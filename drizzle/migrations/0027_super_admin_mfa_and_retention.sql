CREATE TABLE public.platform_admin_recovery_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  used_at timestamptz
);
CREATE INDEX platform_admin_recovery_codes_user_idx ON public.platform_admin_recovery_codes(user_id, used_at);
GRANT ALL ON public.platform_admin_recovery_codes TO service_role;
REVOKE ALL ON public.platform_admin_recovery_codes FROM PUBLIC, anon, authenticated;
ALTER TABLE public.platform_admin_recovery_codes ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.platform_admin_recovery_codes IS 'Server-only HMAC hashes of one-time Super Admin recovery codes; plaintext codes are never stored.';

CREATE TABLE public.retention_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  automatic_deletion_enabled boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamptz,
  legal_hold boolean NOT NULL DEFAULT false,
  legal_hold_reason text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT automatic_deletion_enabled OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CHECK (legal_hold_reason IS NULL OR length(legal_hold_reason) <= 500)
);
GRANT ALL ON public.retention_settings TO service_role;
REVOKE ALL ON public.retention_settings FROM PUBLIC, anon, authenticated;
ALTER TABLE public.retention_settings ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.retention_settings IS 'Server-only workspace retention approval and legal-hold controls. Automatic deletion requires explicit Super Admin approval.';

CREATE TABLE public.retention_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid,
  mode text NOT NULL CHECK (mode IN ('dry_run','execute')),
  candidate_counts jsonb NOT NULL,
  deleted_counts jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX retention_runs_org_time_idx ON public.retention_runs(organization_id, created_at DESC);
GRANT ALL ON public.retention_runs TO service_role;
REVOKE ALL ON public.retention_runs FROM PUBLIC, anon, authenticated;
ALTER TABLE public.retention_runs ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.retention_runs IS 'Count-only retention monitoring history. Never stores customer fields or deleted record contents.';

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin' AND organization_id IS NULL
  ) AND (
    coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
    OR NOT EXISTS (
      SELECT 1 FROM auth.mfa_factors
      WHERE user_id = auth.uid() AND factor_type = 'totp' AND status = 'verified'
    )
  )
$$;
COMMENT ON FUNCTION public.is_platform_admin() IS 'Platform role plus AAL2 after a verified TOTP factor exists. The no-factor grace path prevents lockout during initial enrollment and recovery.';

CREATE OR REPLACE FUNCTION public.run_workspace_retention(
  _organization_id uuid,
  _execute boolean,
  _actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  settings public.retention_settings;
  legal_hold_active boolean := false;
  delivery_candidates uuid[] := '{}';
  event_candidates uuid[] := '{}';
  webhook_candidates uuid[] := '{}';
  delivery_deleted uuid[] := '{}';
  event_deleted uuid[] := '{}';
  webhook_deleted uuid[] := '{}';
  candidate_details jsonb;
  candidate_counts jsonb;
  deleted_counts jsonb;
  delivery_cutoff timestamptz := now() - interval '13 months';
  event_cutoff timestamptz := now() - interval '25 months';
  webhook_cutoff timestamptz := now() - interval '90 days';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization_id) THEN
    RAISE EXCEPTION 'Workspace not found';
  END IF;
  SELECT * INTO settings FROM public.retention_settings WHERE organization_id = _organization_id;
  legal_hold_active := coalesce(settings.legal_hold, false);
  IF _execute AND (
    settings.organization_id IS NULL OR NOT settings.automatic_deletion_enabled
    OR settings.approved_by IS NULL OR settings.approved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Automatic deletion has not been approved for this workspace';
  END IF;

  IF NOT legal_hold_active THEN
    SELECT coalesce(array_agg(a.id ORDER BY a.started_at), '{}') INTO delivery_candidates
      FROM public.meta_conversion_delivery_attempts a
      WHERE a.organization_id = _organization_id AND a.started_at < delivery_cutoff AND a.status <> 'processing';

    SELECT coalesce(array_agg(e.id ORDER BY e.created_at), '{}') INTO event_candidates
      FROM public.meta_conversion_events e
      WHERE e.organization_id = _organization_id AND e.created_at < event_cutoff
        AND e.status IN ('sent','blocked','failed')
        AND (e.lease_until IS NULL OR e.lease_until < now())
        AND e.retry_requested_at IS NULL
        AND NOT (e.status = 'failed' AND e.failure_kind = 'temporary' AND e.attempts < 8 AND e.next_attempt_at IS NOT NULL)
        AND NOT EXISTS (
          SELECT 1 FROM public.meta_conversion_delivery_attempts a
          WHERE a.event_id = e.id AND a.started_at >= delivery_cutoff
        );

    SELECT coalesce(array_agg(w.id ORDER BY w.received_at), '{}') INTO webhook_candidates
      FROM public.meta_webhook_events w
      WHERE w.organization_id = _organization_id AND w.received_at < webhook_cutoff
        AND w.processing_status IN ('succeeded','failed','ignored');
  END IF;

  SELECT jsonb_build_object(
    'deliveryHistory', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'timestamp', a.started_at) ORDER BY a.started_at) FROM public.meta_conversion_delivery_attempts a WHERE a.id = ANY(delivery_candidates)), '[]'::jsonb),
    'conversionEvents', coalesce((SELECT jsonb_agg(jsonb_build_object('id', e.id, 'timestamp', e.created_at) ORDER BY e.created_at) FROM public.meta_conversion_events e WHERE e.id = ANY(event_candidates)), '[]'::jsonb),
    'incomingMetaData', coalesce((SELECT jsonb_agg(jsonb_build_object('id', w.id, 'timestamp', w.received_at) ORDER BY w.received_at) FROM public.meta_webhook_events w WHERE w.id = ANY(webhook_candidates)), '[]'::jsonb)
  ) INTO candidate_details;
  candidate_counts := jsonb_build_object(
    'deliveryHistory', coalesce(array_length(delivery_candidates, 1), 0),
    'conversionEvents', coalesce(array_length(event_candidates, 1), 0),
    'incomingMetaData', coalesce(array_length(webhook_candidates, 1), 0)
  );

  IF _execute THEN
    WITH removed AS (
      DELETE FROM public.meta_conversion_delivery_attempts a
      WHERE a.id = ANY(delivery_candidates) AND a.organization_id = _organization_id
        AND a.started_at < delivery_cutoff AND a.status <> 'processing'
      RETURNING a.id
    ) SELECT coalesce(array_agg(id), '{}') INTO delivery_deleted FROM removed;

    WITH removed AS (
      DELETE FROM public.meta_conversion_events e
      WHERE e.id = ANY(event_candidates) AND e.organization_id = _organization_id
        AND e.created_at < event_cutoff AND e.status IN ('sent','blocked','failed')
        AND (e.lease_until IS NULL OR e.lease_until < now()) AND e.retry_requested_at IS NULL
        AND NOT (e.status = 'failed' AND e.failure_kind = 'temporary' AND e.attempts < 8 AND e.next_attempt_at IS NOT NULL)
        AND NOT EXISTS (SELECT 1 FROM public.meta_conversion_delivery_attempts a WHERE a.event_id = e.id AND a.started_at >= delivery_cutoff)
      RETURNING e.id
    ) SELECT coalesce(array_agg(id), '{}') INTO event_deleted FROM removed;

    WITH removed AS (
      DELETE FROM public.meta_webhook_events w
      WHERE w.id = ANY(webhook_candidates) AND w.organization_id = _organization_id
        AND w.received_at < webhook_cutoff AND w.processing_status IN ('succeeded','failed','ignored')
      RETURNING w.id
    ) SELECT coalesce(array_agg(id), '{}') INTO webhook_deleted FROM removed;
  END IF;

  deleted_counts := jsonb_build_object(
    'deliveryHistory', coalesce(array_length(delivery_deleted, 1), 0),
    'conversionEvents', coalesce(array_length(event_deleted, 1), 0),
    'incomingMetaData', coalesce(array_length(webhook_deleted, 1), 0)
  );
  INSERT INTO public.retention_runs(organization_id, actor_id, mode, candidate_counts, deleted_counts)
    VALUES (_organization_id, _actor_id, CASE WHEN _execute THEN 'execute' ELSE 'dry_run' END, candidate_counts, deleted_counts);
  IF _execute THEN
    INSERT INTO public.audit_logs(organization_id, user_id, action, entity_type, entity_id, details)
      VALUES (_organization_id, _actor_id, 'retention_deleted', 'workspace_retention', _organization_id,
        jsonb_build_object('deletedCounts', deleted_counts, 'protected', jsonb_build_array('consent_evidence','audit_logs')));
  END IF;

  RETURN jsonb_build_object(
    'organizationId', _organization_id,
    'dryRun', NOT _execute,
    'legalHold', legal_hold_active,
    'cutoffs', jsonb_build_object('deliveryHistory', delivery_cutoff, 'conversionEvents', event_cutoff, 'incomingMetaData', webhook_cutoff),
    'candidates', candidate_details,
    'candidateCounts', candidate_counts,
    'deletedCounts', deleted_counts,
    'protected', jsonb_build_array('consent_evidence','audit_logs','active_conversion_events','unprocessed_webhook_events')
  );
END;
$$;
REVOKE ALL ON FUNCTION public.run_workspace_retention(uuid,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_workspace_retention(uuid,boolean,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.run_approved_retention(_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  workspace record;
  results jsonb := '[]'::jsonb;
BEGIN
  FOR workspace IN
    SELECT organization_id FROM public.retention_settings
    WHERE automatic_deletion_enabled AND approved_by IS NOT NULL AND approved_at IS NOT NULL AND NOT legal_hold
    ORDER BY organization_id
  LOOP
    results := results || jsonb_build_array(public.run_workspace_retention(workspace.organization_id, true, _actor_id));
  END LOOP;
  RETURN results;
END;
$$;
REVOKE ALL ON FUNCTION public.run_approved_retention(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_approved_retention(uuid) TO service_role;
COMMENT ON FUNCTION public.run_approved_retention(uuid) IS 'Scheduled server-only retention runner; processes only explicitly approved workspaces without legal holds.';