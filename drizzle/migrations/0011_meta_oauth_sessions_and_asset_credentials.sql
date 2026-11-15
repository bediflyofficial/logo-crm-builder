CREATE TABLE public.meta_oauth_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), state_hash text NOT NULL UNIQUE, user_id uuid NOT NULL, organization_id uuid NOT NULL REFERENCES public.organizations(id), redirect_uri text NOT NULL, expires_at timestamptz NOT NULL, consumed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.meta_oauth_sessions FROM anon,authenticated;
GRANT ALL ON public.meta_oauth_sessions TO service_role;
ALTER TABLE public.meta_oauth_sessions ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.meta_asset_credentials (
 asset_id uuid PRIMARY KEY REFERENCES public.meta_assets(id), organization_id uuid NOT NULL REFERENCES public.organizations(id), encrypted_access_token text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.meta_asset_credentials FROM anon,authenticated;
GRANT ALL ON public.meta_asset_credentials TO service_role;
ALTER TABLE public.meta_asset_credentials ENABLE ROW LEVEL SECURITY;
CREATE INDEX meta_oauth_expiry ON public.meta_oauth_sessions(expires_at);
CREATE INDEX meta_asset_credentials_org ON public.meta_asset_credentials(organization_id);
ALTER TABLE public.meta_connections ADD COLUMN connected_by uuid, ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();