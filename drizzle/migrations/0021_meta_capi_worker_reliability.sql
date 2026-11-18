ALTER TABLE public.meta_conversion_events
  ADD COLUMN lease_token uuid,
  ADD COLUMN lease_until timestamptz,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN failure_kind text CHECK (failure_kind IS NULL OR failure_kind IN ('temporary','permanent','uncertain')),
  ADD COLUMN retry_requested_at timestamptz;

CREATE TABLE public.meta_conversion_delivery_attempts (
  id uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.meta_conversion_events(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  attempt_number integer NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','sent','failed','blocked')),
  error_code text,
  failure_kind text CHECK (failure_kind IS NULL OR failure_kind IN ('temporary','permanent','uncertain')),
  dataset_id text,
  test_event boolean NOT NULL DEFAULT false,
  provider_events_received integer,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  UNIQUE(event_id, attempt_number)
);
GRANT SELECT ON public.meta_conversion_delivery_attempts TO authenticated;
GRANT ALL ON public.meta_conversion_delivery_attempts TO service_role;
ALTER TABLE public.meta_conversion_delivery_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_conversion_attempts_admin_read ON public.meta_conversion_delivery_attempts
  FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE INDEX meta_conversion_attempts_event_history ON public.meta_conversion_delivery_attempts(event_id, started_at DESC);
CREATE INDEX meta_conversion_events_claimable ON public.meta_conversion_events(status, next_attempt_at, created_at) WHERE provider_received_at IS NULL AND NOT test_event;

CREATE OR REPLACE FUNCTION public.reserve_meta_conversion_send(_organization_id uuid, _event_id uuid)
RETURNS public.meta_conversion_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.meta_conversion_events; c public.meta_capi_configs; v_lease uuid;
BEGIN
 SELECT * INTO e FROM public.meta_conversion_events WHERE id = _event_id AND organization_id = _organization_id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Conversion event not found in this workspace'; END IF;
 IF e.status <> 'pending' OR e.provider_received_at IS NOT NULL OR e.test_event
    OR (e.next_attempt_at IS NOT NULL AND e.next_attempt_at > now())
    OR (e.attempts >= 8 AND e.retry_requested_at IS NULL) THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.meta_capi_configs WHERE organization_id = _organization_id;
 IF c.organization_id IS NULL OR NOT c.capi_enabled OR c.status <> 'production_active' OR NOT c.dataset_eligible
    OR c.eligibility_reviewed_at IS NULL OR c.dataset_id IS NULL OR c.encrypted_capi_token IS NULL OR c.last_test_event_at IS NULL
    OR (e.sent_dataset_id IS NOT NULL AND e.sent_dataset_id <> c.dataset_id) THEN RETURN NULL; END IF;
 e := public.recheck_meta_conversion_consent(_event_id);
 IF e.status <> 'pending' THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization_id AND status = 'active' AND deleted_at IS NULL) THEN RETURN NULL; END IF;
 v_lease := gen_random_uuid();
 UPDATE public.meta_conversion_events SET status = 'processing', attempts = attempts + 1,
   sent_dataset_id = coalesce(e.sent_dataset_id, c.dataset_id), test_event = false, error_code = NULL,
   failure_kind = NULL, next_attempt_at = NULL, lease_token = v_lease,
   lease_until = now() + interval '90 seconds', last_attempt_at = now(), retry_requested_at = NULL
   WHERE id = e.id AND organization_id = _organization_id RETURNING * INTO e;
 INSERT INTO public.meta_conversion_delivery_attempts(id,event_id,organization_id,attempt_number,dataset_id,test_event)
   VALUES(v_lease,e.id,e.organization_id,e.attempts,e.sent_dataset_id,false);
 RETURN e;
END; $$;

CREATE OR REPLACE FUNCTION public.reserve_meta_conversion_test(_organization_id uuid, _event_id uuid)
RETURNS public.meta_conversion_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.meta_conversion_events; c public.meta_capi_configs; v_lease uuid;
BEGIN
 SELECT * INTO e FROM public.meta_conversion_events WHERE id = _event_id AND organization_id = _organization_id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Conversion event not found in this workspace'; END IF;
 IF e.status <> 'pending' OR e.provider_received_at IS NOT NULL OR e.test_event OR e.attempts >= 8 THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.meta_capi_configs WHERE organization_id = _organization_id;
 IF c.organization_id IS NULL OR c.status NOT IN ('test_successful', 'production_active') OR NOT c.dataset_eligible
    OR c.eligibility_reviewed_at IS NULL OR c.dataset_id IS NULL OR c.encrypted_capi_token IS NULL
    OR c.test_event_code IS NULL OR BTRIM(c.test_event_code) = '' OR c.last_test_event_at IS NULL
    OR (e.sent_dataset_id IS NOT NULL AND e.sent_dataset_id <> c.dataset_id) THEN RETURN NULL; END IF;
 e := public.recheck_meta_conversion_consent(_event_id);
 IF e.status <> 'pending' THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization_id AND status = 'active' AND deleted_at IS NULL) THEN RETURN NULL; END IF;
 v_lease := gen_random_uuid();
 UPDATE public.meta_conversion_events SET status = 'processing', attempts = attempts + 1,
   sent_dataset_id = coalesce(e.sent_dataset_id, c.dataset_id), test_event = true, error_code = NULL,
   failure_kind = NULL, next_attempt_at = NULL, lease_token = v_lease,
   lease_until = now() + interval '90 seconds', last_attempt_at = now(), retry_requested_at = NULL
   WHERE id = e.id AND organization_id = _organization_id RETURNING * INTO e;
 INSERT INTO public.meta_conversion_delivery_attempts(id,event_id,organization_id,attempt_number,dataset_id,test_event)
   VALUES(v_lease,e.id,e.organization_id,e.attempts,e.sent_dataset_id,true);
 RETURN e;
END; $$;

CREATE FUNCTION public.claim_meta_conversion_events(_limit integer DEFAULT 1)
RETURNS SETOF public.meta_conversion_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE candidate record; e public.meta_conversion_events; v_lease uuid;
BEGIN
 FOR candidate IN
   SELECT id, lease_token FROM public.meta_conversion_events
   WHERE status = 'processing' AND provider_received_at IS NULL AND lease_until IS NOT NULL AND lease_until < now()
   FOR UPDATE SKIP LOCKED
 LOOP
   UPDATE public.meta_conversion_delivery_attempts SET status = 'failed', error_code = 'lease_expired',
     failure_kind = 'uncertain', finished_at = now() WHERE id = candidate.lease_token AND status = 'processing';
   UPDATE public.meta_conversion_events SET status = 'failed', error_code = 'lease_expired', failure_kind = 'uncertain',
     next_attempt_at = NULL, lease_token = NULL, lease_until = NULL WHERE id = candidate.id;
 END LOOP;

 FOR candidate IN
   SELECT e.id FROM public.meta_conversion_events e
   JOIN public.meta_capi_configs c ON c.organization_id = e.organization_id
   JOIN public.organizations o ON o.id = e.organization_id
   WHERE NOT e.test_event AND e.provider_received_at IS NULL
     AND (
       (e.status = 'pending' AND (e.next_attempt_at IS NULL OR e.next_attempt_at <= now())
         AND (e.attempts < 8 OR e.retry_requested_at IS NOT NULL))
       OR (e.status = 'failed' AND e.failure_kind = 'temporary' AND e.attempts < 8
         AND e.next_attempt_at IS NOT NULL AND e.next_attempt_at <= now())
     )
     AND c.capi_enabled AND c.status = 'production_active' AND c.dataset_eligible
     AND c.eligibility_reviewed_at IS NOT NULL AND c.dataset_id IS NOT NULL
     AND c.encrypted_capi_token IS NOT NULL AND c.last_test_event_at IS NOT NULL
     AND (e.sent_dataset_id IS NULL OR e.sent_dataset_id = c.dataset_id)
     AND o.status = 'active' AND o.deleted_at IS NULL
   ORDER BY coalesce(e.next_attempt_at, e.created_at), e.created_at
   FOR UPDATE OF e SKIP LOCKED LIMIT least(greatest(_limit,1),3)
 LOOP
   e := public.recheck_meta_conversion_consent(candidate.id);
   IF e.status NOT IN ('pending','failed') OR e.provider_received_at IS NOT NULL OR e.test_event THEN CONTINUE; END IF;
   v_lease := gen_random_uuid();
   UPDATE public.meta_conversion_events SET status = 'processing', attempts = attempts + 1,
     sent_dataset_id = coalesce(e.sent_dataset_id, (SELECT dataset_id FROM public.meta_capi_configs WHERE organization_id = e.organization_id)),
     error_code = NULL, failure_kind = NULL, next_attempt_at = NULL, lease_token = v_lease,
     lease_until = now() + interval '90 seconds', last_attempt_at = now(), retry_requested_at = NULL
     WHERE id = e.id RETURNING * INTO e;
   INSERT INTO public.meta_conversion_delivery_attempts(id,event_id,organization_id,attempt_number,dataset_id,test_event)
     VALUES(v_lease,e.id,e.organization_id,e.attempts,e.sent_dataset_id,false);
   RETURN NEXT e;
 END LOOP;
 RETURN;
END; $$;

CREATE FUNCTION public.complete_meta_conversion_delivery(
  _event_id uuid, _organization_id uuid, _lease_token uuid, _status text, _error_code text,
  _failure_kind text, _retry_delay_seconds integer, _events_received integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.meta_conversion_events; v_history_status text;
BEGIN
 IF _status NOT IN ('sent','blocked','failed') THEN RAISE EXCEPTION 'Invalid delivery outcome'; END IF;
 IF _failure_kind IS NOT NULL AND _failure_kind NOT IN ('temporary','permanent','uncertain') THEN RAISE EXCEPTION 'Invalid failure kind'; END IF;
 SELECT * INTO e FROM public.meta_conversion_events
   WHERE id = _event_id AND organization_id = _organization_id AND lease_token = _lease_token FOR UPDATE;
 IF e.id IS NULL OR e.provider_received_at IS NOT NULL THEN RETURN false; END IF;
 v_history_status := CASE WHEN _events_received = 1 THEN 'sent' WHEN e.status = 'blocked' THEN 'blocked' ELSE _status END;
 UPDATE public.meta_conversion_delivery_attempts SET status = v_history_status, error_code = _error_code,
   failure_kind = _failure_kind, provider_events_received = _events_received, finished_at = now()
   WHERE id = _lease_token AND event_id = e.id AND organization_id = e.organization_id;

 IF _events_received = 1 THEN
   UPDATE public.meta_conversion_events SET status = 'sent', error_code = NULL, failure_kind = NULL,
     next_attempt_at = NULL, provider_received_at = now(), provider_events_received = 1,
     lease_token = NULL, lease_until = NULL WHERE id = e.id;
 ELSIF e.status = 'processing' THEN
   IF _status = 'blocked' THEN
     UPDATE public.meta_conversion_events SET status = 'blocked', error_code = _error_code, failure_kind = NULL,
       next_attempt_at = NULL, lease_token = NULL, lease_until = NULL WHERE id = e.id;
   ELSIF _failure_kind = 'temporary' AND e.attempts < 8 AND _retry_delay_seconds IS NOT NULL THEN
     UPDATE public.meta_conversion_events SET status = 'failed', error_code = _error_code, failure_kind = 'temporary',
       next_attempt_at = now() + make_interval(secs => greatest(_retry_delay_seconds,1)),
       lease_token = NULL, lease_until = NULL WHERE id = e.id;
   ELSE
     UPDATE public.meta_conversion_events SET status = 'failed', error_code = _error_code,
       failure_kind = coalesce(_failure_kind,'permanent'), next_attempt_at = NULL,
       lease_token = NULL, lease_until = NULL WHERE id = e.id;
   END IF;
 END IF;

 IF _error_code = 'meta_token_invalid' THEN
   UPDATE public.meta_capi_configs SET capi_enabled = false, status = 'connection_error',
     last_error = 'Meta rejected the saved CAPI access token. Update the credentials and test the connection before reconnecting.',
     updated_at = now() WHERE organization_id = e.organization_id;
 END IF;
 RETURN true;
END; $$;

CREATE FUNCTION public.request_meta_conversion_retry(_organization_id uuid, _event_id uuid)
RETURNS public.meta_conversion_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.meta_conversion_events;
BEGIN
 SELECT * INTO e FROM public.meta_conversion_events WHERE id = _event_id AND organization_id = _organization_id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Conversion event not found in this workspace'; END IF;
 IF e.status <> 'failed' OR e.provider_received_at IS NOT NULL OR e.test_event THEN RETURN NULL; END IF;
 UPDATE public.meta_conversion_events SET status = 'pending', error_code = NULL, failure_kind = NULL,
   next_attempt_at = now(), retry_requested_at = now(), lease_token = NULL, lease_until = NULL
   WHERE id = e.id RETURNING * INTO e;
 RETURN e;
END; $$;

REVOKE ALL ON FUNCTION public.reserve_meta_conversion_send(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_meta_conversion_test(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_meta_conversion_events(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_meta_conversion_delivery(uuid,uuid,uuid,text,text,text,integer,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_meta_conversion_retry(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_meta_conversion_send(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_meta_conversion_test(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_meta_conversion_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_meta_conversion_delivery(uuid,uuid,uuid,text,text,text,integer,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.request_meta_conversion_retry(uuid,uuid) TO service_role;

COMMENT ON TABLE public.meta_conversion_delivery_attempts IS 'Safe delivery audit history only; not a queue. Contains no access tokens, customer matching fields, or provider response bodies.';
COMMENT ON COLUMN public.meta_conversion_events.failure_kind IS 'Temporary failures may retry automatically; permanent and uncertain failures require an authorized administrator retry.';
COMMENT ON COLUMN public.meta_conversion_events.lease_token IS 'Server-only atomic delivery lease; completion must match the current lease to prevent stale workers changing newer attempts.';