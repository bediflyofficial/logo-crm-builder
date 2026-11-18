CREATE OR REPLACE FUNCTION public.claim_meta_conversion_events(_limit integer DEFAULT 1)
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
   SELECT ev.id FROM public.meta_conversion_events ev
   JOIN public.meta_capi_configs c ON c.organization_id = ev.organization_id
   JOIN public.organizations o ON o.id = ev.organization_id
   WHERE NOT ev.test_event AND ev.provider_received_at IS NULL
     AND (
       (ev.status = 'pending' AND (ev.next_attempt_at IS NULL OR ev.next_attempt_at <= now())
         AND (ev.attempts < 8 OR ev.retry_requested_at IS NOT NULL))
       OR (ev.status = 'failed' AND ev.failure_kind = 'temporary' AND ev.attempts < 8
         AND ev.next_attempt_at IS NOT NULL AND ev.next_attempt_at <= now())
     )
     AND c.capi_enabled AND c.status = 'production_active' AND c.dataset_eligible
     AND c.eligibility_reviewed_at IS NOT NULL AND c.dataset_id IS NOT NULL
     AND c.encrypted_capi_token IS NOT NULL AND c.last_test_event_at IS NOT NULL
     AND (ev.sent_dataset_id IS NULL OR ev.sent_dataset_id = c.dataset_id)
     AND o.status = 'active' AND o.deleted_at IS NULL
   ORDER BY coalesce(ev.next_attempt_at, ev.created_at), ev.created_at
   FOR UPDATE OF ev SKIP LOCKED LIMIT least(greatest(_limit,1),3)
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
REVOKE ALL ON FUNCTION public.claim_meta_conversion_events(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_meta_conversion_events(integer) TO service_role;