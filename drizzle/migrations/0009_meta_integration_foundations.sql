CREATE TABLE public.meta_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), meta_user_id text, facebook_name text, encrypted_access_token text, token_expires_at timestamptz, connection_status text NOT NULL DEFAULT 'pending_configuration' CHECK (connection_status IN ('pending_configuration','connected','expired','revoked','disconnected')), granted_permissions text[] NOT NULL DEFAULT '{}', connected_at timestamptz, last_sync_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,meta_user_id)
);
GRANT SELECT (id,organization_id,meta_user_id,facebook_name,token_expires_at,connection_status,granted_permissions,connected_at,last_sync_at,created_at) ON public.meta_connections TO authenticated;
GRANT ALL ON public.meta_connections TO service_role;
ALTER TABLE public.meta_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_connections_admin_read ON public.meta_connections FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE TABLE public.meta_integration_settings (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations(id), auto_sync_enabled boolean NOT NULL DEFAULT false, default_status text NOT NULL DEFAULT 'New Lead', default_quality text NOT NULL DEFAULT 'Warm' CHECK(default_quality IN ('Hot','Warm','Cold','Junk')), assignment_mode text NOT NULL DEFAULT 'manual' CHECK(assignment_mode IN ('manual','fixed','round_robin')), executive_ids uuid[] NOT NULL DEFAULT '{}', duplicate_handling text NOT NULL DEFAULT 'keep_separate' CHECK(duplicate_handling IN ('keep_separate','flag')), notifications_enabled boolean NOT NULL DEFAULT true, dataset_id text, conversion_enabled boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT,UPDATE ON public.meta_integration_settings TO authenticated;
GRANT ALL ON public.meta_integration_settings TO service_role;
ALTER TABLE public.meta_integration_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_settings_admin_read ON public.meta_integration_settings FOR SELECT TO authenticated USING(public.is_org_admin(organization_id));
CREATE POLICY meta_settings_admin_insert ON public.meta_integration_settings FOR INSERT TO authenticated WITH CHECK(public.is_org_admin(organization_id));
CREATE POLICY meta_settings_admin_update ON public.meta_integration_settings FOR UPDATE TO authenticated USING(public.is_org_admin(organization_id)) WITH CHECK(public.is_org_admin(organization_id));
CREATE TABLE public.meta_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), connection_id uuid NOT NULL REFERENCES public.meta_connections(id), asset_type text NOT NULL CHECK(asset_type IN ('business','page','ad_account','instagram','form','dataset')), external_id text NOT NULL, parent_external_id text, name text NOT NULL, selected boolean NOT NULL DEFAULT false, webhook_subscribed boolean NOT NULL DEFAULT false, metadata jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,asset_type,external_id)
);
GRANT SELECT ON public.meta_assets TO authenticated;
GRANT ALL ON public.meta_assets TO service_role;
ALTER TABLE public.meta_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_assets_admin_read ON public.meta_assets FOR SELECT TO authenticated USING(public.is_org_admin(organization_id));
CREATE TABLE public.meta_webhook_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES public.organizations(id), leadgen_id text NOT NULL UNIQUE, page_id text NOT NULL, form_id text NOT NULL, payload jsonb NOT NULL, processing_status text NOT NULL DEFAULT 'pending' CHECK(processing_status IN ('pending','processing','succeeded','failed','ignored')), attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, error_code text, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz
);
GRANT ALL ON public.meta_webhook_events TO service_role;
ALTER TABLE public.meta_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX meta_webhook_pending ON public.meta_webhook_events(processing_status,next_attempt_at);
CREATE TABLE public.meta_sync_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), connection_id uuid REFERENCES public.meta_connections(id), sync_type text NOT NULL, status text NOT NULL CHECK(status IN ('pending','succeeded','failed')), records_processed integer NOT NULL DEFAULT 0, error_message text, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.meta_sync_logs TO authenticated;
GRANT ALL ON public.meta_sync_logs TO service_role;
ALTER TABLE public.meta_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_logs_admin_read ON public.meta_sync_logs FOR SELECT TO authenticated USING(public.is_org_admin(organization_id));
ALTER TABLE public.leads ADD COLUMN meta_lead_id text, ADD COLUMN meta_page_id text, ADD COLUMN meta_form_id text, ADD COLUMN meta_ad_account_id text, ADD COLUMN meta_campaign_id text, ADD COLUMN meta_ad_set_id text, ADD COLUMN meta_ad_id text, ADD COLUMN fbc text, ADD COLUMN fbp text;
CREATE UNIQUE INDEX leads_meta_id_unique ON public.leads(organization_id,meta_lead_id) WHERE meta_lead_id IS NOT NULL;
CREATE TABLE public.meta_lead_responses (
 lead_id uuid PRIMARY KEY REFERENCES public.leads(id), organization_id uuid NOT NULL REFERENCES public.organizations(id), field_data jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.meta_lead_responses TO authenticated;
GRANT ALL ON public.meta_lead_responses TO service_role;
ALTER TABLE public.meta_lead_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_responses_admin_read ON public.meta_lead_responses FOR SELECT TO authenticated USING(public.is_org_admin(organization_id));
CREATE TABLE public.meta_consent_evidence (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), lead_id uuid NOT NULL REFERENCES public.leads(id), advertising_accepted boolean NOT NULL, matching_accepted boolean NOT NULL DEFAULT false, notice_version text NOT NULL, evidence_reference text NOT NULL, region text NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz, UNIQUE(id,organization_id,lead_id)
);
GRANT SELECT ON public.meta_consent_evidence TO authenticated;
GRANT ALL ON public.meta_consent_evidence TO service_role;
ALTER TABLE public.meta_consent_evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_consent_admin_read ON public.meta_consent_evidence FOR SELECT TO authenticated USING(public.is_org_admin(organization_id));
CREATE TABLE public.meta_conversion_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations(id), lead_id uuid NOT NULL REFERENCES public.leads(id), consent_id uuid, event_name text NOT NULL CHECK(event_name IN ('QualifiedLead','Purchase')), outcome_reference text NOT NULL, occurred_at timestamptz NOT NULL, action_source text NOT NULL, value numeric, currency text, status text NOT NULL DEFAULT 'blocked' CHECK(status IN ('blocked','pending','processing','sent','failed')), attempts integer NOT NULL DEFAULT 0, next_attempt_at timestamptz, provider_received_at timestamptz, error_code text, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,event_name,outcome_reference), FOREIGN KEY(consent_id,organization_id,lead_id) REFERENCES public.meta_consent_evidence(id,organization_id,lead_id), CHECK(event_name <> 'Purchase' OR (value IS NOT NULL AND value >= 0 AND currency ~ '^[A-Z]{3}$'))
);
GRANT SELECT ON public.meta_conversion_events TO authenticated;
GRANT ALL ON public.meta_conversion_events TO service_role;
ALTER TABLE public.meta_conversion_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_events_admin_read ON public.meta_conversion_events FOR SELECT TO authenticated USING(public.is_org_admin(organization_id));