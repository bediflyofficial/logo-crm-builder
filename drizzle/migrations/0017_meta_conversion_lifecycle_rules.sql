CREATE TABLE public.meta_conversion_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  trigger_type text NOT NULL CHECK (trigger_type IN ('status','quality')),
  trigger_value text NOT NULL CHECK (length(trim(trigger_value)) BETWEEN 1 AND 100),
  event_name text NOT NULL CHECK (event_name IN ('QualifiedLead','Purchase')),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, trigger_type, trigger_value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_conversion_rules TO authenticated;
GRANT ALL ON public.meta_conversion_rules TO service_role;
ALTER TABLE public.meta_conversion_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY meta_conversion_rules_admin_read ON public.meta_conversion_rules FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE POLICY meta_conversion_rules_admin_insert ON public.meta_conversion_rules FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY meta_conversion_rules_admin_update ON public.meta_conversion_rules FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY meta_conversion_rules_admin_delete ON public.meta_conversion_rules FOR DELETE TO authenticated USING (public.is_org_admin(organization_id));

CREATE OR REPLACE FUNCTION public.seed_default_lead_statuses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lead_statuses (organization_id, name, position, is_default, is_terminal) VALUES
    (NEW.id, 'New Lead', 0, true, false),
    (NEW.id, 'Contacted', 1, true, false),
    (NEW.id, 'Interested', 2, true, false),
    (NEW.id, 'Qualified', 3, true, false),
    (NEW.id, 'Meeting Scheduled', 4, true, false),
    (NEW.id, 'Negotiation', 5, true, false),
    (NEW.id, 'Converted', 6, true, true),
    (NEW.id, 'Not Interested', 7, true, true),
    (NEW.id, 'Invalid Number', 8, true, true),
    (NEW.id, 'Duplicate', 9, true, true),
    (NEW.id, 'Junk Lead', 10, true, true),
    (NEW.id, 'Unqualified', 11, true, true),
    (NEW.id, 'Lost', 12, true, true);
  INSERT INTO public.meta_conversion_rules (organization_id, trigger_type, trigger_value, event_name, enabled) VALUES
    (NEW.id, 'status', 'Qualified', 'QualifiedLead', false),
    (NEW.id, 'status', 'Converted', 'Purchase', false);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_default_lead_statuses() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.meta_integration_settings.dataset_id IS 'DEPRECATED: use meta_capi_configs.dataset_id';
COMMENT ON COLUMN public.meta_integration_settings.conversion_enabled IS 'DEPRECATED: use meta_capi_configs.capi_enabled';