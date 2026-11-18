ALTER TABLE public.meta_consent_evidence
  ADD COLUMN consent_source text NOT NULL DEFAULT 'legacy_record' CHECK (length(trim(consent_source)) BETWEEN 1 AND 100),
  ADD COLUMN global_privacy_control boolean NOT NULL DEFAULT false,
  ADD COLUMN recorded_by uuid;

ALTER TABLE public.meta_conversion_rules
  ADD COLUMN currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$');

ALTER TABLE public.meta_conversion_events DROP CONSTRAINT meta_conversion_events_check;
ALTER TABLE public.meta_conversion_events ADD CONSTRAINT meta_conversion_events_purchase_shape CHECK (
  event_name <> 'Purchase' OR (
    (value IS NULL OR value >= 0) AND
    (currency IS NULL OR currency ~ '^[A-Z]{3}$') AND
    (status = 'blocked' OR (value IS NOT NULL AND currency IS NOT NULL))
  )
);

CREATE OR REPLACE FUNCTION public.meta_consent_block_reason(_consent_id uuid, _organization_id uuid, _lead_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE c public.meta_consent_evidence;
BEGIN
  IF _consent_id IS NULL THEN RETURN 'consent_missing'; END IF;
  SELECT * INTO c FROM public.meta_consent_evidence
    WHERE id = _consent_id AND organization_id = _organization_id AND lead_id = _lead_id;
  IF c.id IS NULL THEN RETURN 'consent_missing'; END IF;
  IF c.global_privacy_control THEN RETURN 'global_privacy_control'; END IF;
  IF c.withdrawn_at IS NOT NULL THEN RETURN 'consent_withdrawn'; END IF;
  IF NOT c.advertising_accepted THEN RETURN 'advertising_consent_required'; END IF;
  IF NOT c.matching_accepted THEN RETURN 'matching_consent_required'; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.meta_consent_block_reason(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_meta_conversion_for_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rule public.meta_conversion_rules;
  latest_consent_id uuid;
  block_reason text;
  event_value numeric;
  event_currency text;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status AND OLD.quality IS NOT DISTINCT FROM NEW.quality THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

  FOR rule IN
    SELECT * FROM public.meta_conversion_rules
    WHERE organization_id = NEW.organization_id AND enabled
      AND ((trigger_type = 'status' AND trigger_value = NEW.status)
        OR (trigger_type = 'quality' AND trigger_value = NEW.quality))
  LOOP
    latest_consent_id := NULL;
    SELECT c.id INTO latest_consent_id FROM public.meta_consent_evidence c
      WHERE c.organization_id = NEW.organization_id AND c.lead_id = NEW.id
      ORDER BY c.recorded_at DESC, c.id DESC LIMIT 1;
    block_reason := public.meta_consent_block_reason(latest_consent_id, NEW.organization_id, NEW.id);
    event_value := NULL;
    event_currency := NULL;
    IF rule.event_name = 'Purchase' THEN
      event_value := NEW.lead_value;
      event_currency := rule.currency;
      IF event_value IS NULL OR event_value < 0 THEN block_reason := coalesce(block_reason, 'purchase_value_required'); END IF;
      IF event_currency IS NULL THEN block_reason := coalesce(block_reason, 'purchase_currency_required'); END IF;
    END IF;
    INSERT INTO public.meta_conversion_events (
      organization_id, lead_id, consent_id, event_name, outcome_reference,
      occurred_at, action_source, value, currency, status, error_code
    ) VALUES (
      NEW.organization_id, NEW.id, latest_consent_id, rule.event_name, 'lead:' || NEW.id::text,
      NEW.updated_at, 'system_generated', event_value, event_currency,
      CASE WHEN block_reason IS NULL THEN 'pending' ELSE 'blocked' END, block_reason
    ) ON CONFLICT (organization_id, event_name, outcome_reference) DO NOTHING;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_meta_conversion_for_lead() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER leads_enqueue_meta_conversion_insert AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_meta_conversion_for_lead();
CREATE TRIGGER leads_enqueue_meta_conversion_update AFTER UPDATE OF status, quality ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_meta_conversion_for_lead();

CREATE OR REPLACE FUNCTION public.record_meta_consent(
  _organization_id uuid,
  _lead_id uuid,
  _advertising_accepted boolean,
  _matching_accepted boolean,
  _notice_version text,
  _evidence_reference text,
  _region text,
  _consent_source text,
  _global_privacy_control boolean,
  _withdrawn boolean,
  _recorded_by uuid
)
RETURNS public.meta_consent_evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  saved public.meta_consent_evidence;
  block_reason text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = _lead_id AND organization_id = _organization_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Lead was not found in this workspace';
  END IF;
  IF _global_privacy_control AND (_advertising_accepted OR _matching_accepted) THEN
    RAISE EXCEPTION 'Global Privacy Control cannot be combined with consent acceptance';
  END IF;
  INSERT INTO public.meta_consent_evidence (
    organization_id, lead_id, advertising_accepted, matching_accepted,
    notice_version, evidence_reference, region, consent_source,
    global_privacy_control, withdrawn_at, recorded_by
  ) VALUES (
    _organization_id, _lead_id,
    CASE WHEN _withdrawn THEN false ELSE _advertising_accepted END,
    CASE WHEN _withdrawn THEN false ELSE _matching_accepted END,
    trim(_notice_version), trim(_evidence_reference), trim(_region), trim(_consent_source),
    _global_privacy_control, CASE WHEN _withdrawn THEN now() ELSE NULL END, _recorded_by
  ) RETURNING * INTO saved;

  block_reason := public.meta_consent_block_reason(saved.id, saved.organization_id, saved.lead_id);
  IF block_reason IS NOT NULL THEN
    UPDATE public.meta_conversion_events
      SET status = 'blocked', error_code = block_reason, next_attempt_at = NULL
      WHERE organization_id = saved.organization_id AND lead_id = saved.lead_id
        AND provider_received_at IS NULL AND status IN ('pending','processing');
  END IF;
  RETURN saved;
END;
$$;
REVOKE ALL ON FUNCTION public.record_meta_consent(uuid,uuid,boolean,boolean,text,text,text,text,boolean,boolean,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_meta_consent(uuid,uuid,boolean,boolean,text,text,text,text,boolean,boolean,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.recheck_meta_conversion_consent(_event_id uuid)
RETURNS public.meta_conversion_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  event public.meta_conversion_events;
  latest_consent_id uuid;
  block_reason text;
BEGIN
  SELECT * INTO event FROM public.meta_conversion_events WHERE id = _event_id FOR UPDATE;
  IF event.id IS NULL THEN RAISE EXCEPTION 'Conversion event was not found'; END IF;
  SELECT c.id INTO latest_consent_id FROM public.meta_consent_evidence c
    WHERE c.organization_id = event.organization_id AND c.lead_id = event.lead_id
    ORDER BY c.recorded_at DESC, c.id DESC LIMIT 1;
  block_reason := coalesce(
    public.meta_consent_block_reason(event.consent_id, event.organization_id, event.lead_id),
    public.meta_consent_block_reason(latest_consent_id, event.organization_id, event.lead_id)
  );
  IF block_reason IS NOT NULL AND event.provider_received_at IS NULL AND event.status IN ('pending','processing','failed') THEN
    UPDATE public.meta_conversion_events SET status = 'blocked', error_code = block_reason, next_attempt_at = NULL
      WHERE id = event.id RETURNING * INTO event;
  END IF;
  RETURN event;
END;
$$;
REVOKE ALL ON FUNCTION public.recheck_meta_conversion_consent(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recheck_meta_conversion_consent(uuid) TO service_role;

CREATE INDEX meta_consent_latest_lookup ON public.meta_consent_evidence (organization_id, lead_id, recorded_at DESC);
CREATE INDEX meta_conversion_events_lead_lookup ON public.meta_conversion_events (organization_id, lead_id, status);

COMMENT ON COLUMN public.meta_consent_evidence.consent_source IS 'Source of the recorded customer choice, such as crm_manual, customer_form, withdrawal, or global_privacy_control.';
COMMENT ON COLUMN public.meta_consent_evidence.global_privacy_control IS 'A detected Global Privacy Control signal; blocks conversion creation and delayed processing.';
COMMENT ON COLUMN public.meta_conversion_events.outcome_reference IS 'Stable lead outcome reference. Existing row UUID is the Meta event_id; conflicts never replace original event data.';