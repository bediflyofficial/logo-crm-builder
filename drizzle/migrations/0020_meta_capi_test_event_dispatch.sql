ALTER TABLE public.meta_conversion_events ADD COLUMN test_event boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.reserve_meta_conversion_send(_organization_id uuid, _event_id uuid)
RETURNS public.meta_conversion_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.meta_conversion_events; c public.meta_capi_configs;
BEGIN
 SELECT * INTO e FROM public.meta_conversion_events WHERE id = _event_id AND organization_id = _organization_id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Conversion event not found in this workspace'; END IF;
 IF e.status <> 'pending' OR e.provider_received_at IS NOT NULL OR e.test_event THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.meta_capi_configs WHERE organization_id = _organization_id;
 IF c.organization_id IS NULL OR NOT c.capi_enabled OR c.status <> 'production_active' OR NOT c.dataset_eligible OR c.eligibility_reviewed_at IS NULL OR c.dataset_id IS NULL OR c.encrypted_capi_token IS NULL OR c.last_test_event_at IS NULL THEN RETURN NULL; END IF;
 e := public.recheck_meta_conversion_consent(_event_id);
 IF e.status <> 'pending' THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization_id AND status = 'active' AND deleted_at IS NULL) THEN RETURN NULL; END IF;
 UPDATE public.meta_conversion_events SET status = 'processing', attempts = attempts + 1, sent_dataset_id = c.dataset_id, test_event = false, error_code = NULL WHERE id = e.id AND organization_id = _organization_id RETURNING * INTO e;
 RETURN e;
END; $$;

CREATE FUNCTION public.reserve_meta_conversion_test(_organization_id uuid, _event_id uuid)
RETURNS public.meta_conversion_events LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e public.meta_conversion_events; c public.meta_capi_configs;
BEGIN
 SELECT * INTO e FROM public.meta_conversion_events WHERE id = _event_id AND organization_id = _organization_id FOR UPDATE;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Conversion event not found in this workspace'; END IF;
 IF e.status <> 'pending' OR e.provider_received_at IS NOT NULL OR e.test_event THEN RETURN NULL; END IF;
 SELECT * INTO c FROM public.meta_capi_configs WHERE organization_id = _organization_id;
 IF c.organization_id IS NULL OR c.status NOT IN ('test_successful', 'production_active') OR NOT c.dataset_eligible OR c.eligibility_reviewed_at IS NULL OR c.dataset_id IS NULL OR c.encrypted_capi_token IS NULL OR c.test_event_code IS NULL OR BTRIM(c.test_event_code) = '' OR c.last_test_event_at IS NULL THEN RETURN NULL; END IF;
 e := public.recheck_meta_conversion_consent(_event_id);
 IF e.status <> 'pending' THEN RETURN NULL; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = _organization_id AND status = 'active' AND deleted_at IS NULL) THEN RETURN NULL; END IF;
 UPDATE public.meta_conversion_events SET status = 'processing', attempts = attempts + 1, sent_dataset_id = c.dataset_id, test_event = true, error_code = NULL WHERE id = e.id AND organization_id = _organization_id RETURNING * INTO e;
 RETURN e;
END; $$;

REVOKE ALL ON FUNCTION public.reserve_meta_conversion_send(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_meta_conversion_send(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.reserve_meta_conversion_test(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_meta_conversion_test(uuid,uuid) TO service_role;

COMMENT ON COLUMN public.meta_conversion_events.test_event IS 'True when this outbox event was dispatched with a Meta Test Event Code; test receipts are not production delivery.';
COMMENT ON FUNCTION public.reserve_meta_conversion_test(uuid,uuid) IS 'Atomically reserves one pending workspace event for Meta Test Events without enabling production CAPI.';