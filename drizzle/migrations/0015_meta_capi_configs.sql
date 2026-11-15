CREATE TABLE public.meta_capi_configs (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id text,
  encrypted_capi_token text,
  test_event_code text,
  capi_enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','configuration_required','connected','test_successful','production_active','connection_error')),
  last_tested_at timestamptz,
  last_test_event_at timestamptz,
  last_error text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.meta_capi_configs FROM anon, authenticated;
GRANT ALL ON public.meta_capi_configs TO service_role;
ALTER TABLE public.meta_capi_configs ENABLE ROW LEVEL SECURITY;