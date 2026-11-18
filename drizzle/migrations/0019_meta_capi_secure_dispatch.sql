ALTER TABLE public.meta_capi_configs ADD COLUMN dataset_eligible boolean NOT NULL DEFAULT false, ADD COLUMN eligibility_reviewed_by uuid, ADD COLUMN eligibility_reviewed_at timestamptz;
ALTER TABLE public.meta_conversion_events ADD COLUMN sent_dataset_id text, ADD COLUMN provider_events_received integer;
CREATE OR REPLACE FUNCTION public.reserve_meta_conversion_send(_organization_id uuid, _event_id uuid)
RETURNS public.meta_conversion_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.meta_conversion_events; c public.meta_capi_configs;
BEGIN
 SELECT * INTO e FROM public.meta_conversion_events WHERE id = _event_id AND organization_id = _organization_id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Conversion event not found in this workspace'; END IF;
 IF e.status <> 'pending' OR e.provider_received_at IS NOT NULL THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.meta_capi_configs WHERE organization_id = _organization_id;
 IF c.organization_id IS NULL OR NOT c.capi_enabled OR c.status <> 'production_active' OR NOT c.dataset_eligible OR c.eligibility_reviewed_at IS NULL OR c.dataset_id IS NULL OR c.encrypted_capi_token IS NULL OR c.last_test_event_at IS NULL THEN RETURN NULL; END IF;
 e := public.recheck_meta_conversion_consent(_event_id);
 IF e.status <> 'pending' THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization_id AND status = 'active' AND deleted_at IS NULL) THEN RETURN NULL; END IF;
 UPDATE public.meta_conversion_events SET status = 'processing', attempts = attempts + 1, sent_dataset_id = c.dataset_id, error_code = NULL WHERE id = e.id AND organization_id = _organization_id RETURNING * INTO e;
 RETURN e;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_meta_conversion_send(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_meta_conversion_send(uuid,uuid) TO service_role;
COMMENT ON COLUMN public.meta_capi_configs.dataset_eligible IS 'Explicit administrator assessment of Dataset restrictions, non-sensitive outcomes, age eligibility and Meta Business Tools Terms; readable Dataset metadata alone is not eligibility.';
COMMENT ON COLUMN public.meta_conversion_events.sent_dataset_id IS 'Dataset reserved for the original event; dispatch must never reroute this event to another Dataset.';