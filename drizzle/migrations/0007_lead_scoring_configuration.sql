CREATE TABLE public.lead_scoring_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  valid_phone_points INTEGER NOT NULL DEFAULT 10 CHECK (valid_phone_points BETWEEN 0 AND 100),
  valid_email_points INTEGER NOT NULL DEFAULT 5 CHECK (valid_email_points BETWEEN 0 AND 100),
  responded_call_points INTEGER NOT NULL DEFAULT 15 CHECK (responded_call_points BETWEEN 0 AND 100),
  expressed_interest_points INTEGER NOT NULL DEFAULT 20 CHECK (expressed_interest_points BETWEEN 0 AND 100),
  meeting_scheduled_points INTEGER NOT NULL DEFAULT 25 CHECK (meeting_scheduled_points BETWEEN 0 AND 100),
  converted_points INTEGER NOT NULL DEFAULT 50 CHECK (converted_points BETWEEN 0 AND 100),
  invalid_number_points INTEGER NOT NULL DEFAULT -50 CHECK (invalid_number_points BETWEEN -100 AND 0),
  duplicate_points INTEGER NOT NULL DEFAULT -100 CHECK (duplicate_points BETWEEN -100 AND 0),
  junk_lead_points INTEGER NOT NULL DEFAULT -100 CHECK (junk_lead_points BETWEEN -100 AND 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_scoring_settings TO authenticated;
GRANT ALL ON public.lead_scoring_settings TO service_role;
ALTER TABLE public.lead_scoring_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY lead_scoring_settings_read_admin ON public.lead_scoring_settings FOR SELECT TO authenticated USING (public.is_org_admin(organization_id));
CREATE POLICY lead_scoring_settings_insert_admin ON public.lead_scoring_settings FOR INSERT TO authenticated WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY lead_scoring_settings_update_admin ON public.lead_scoring_settings FOR UPDATE TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY lead_scoring_settings_delete_admin ON public.lead_scoring_settings FOR DELETE TO authenticated USING (public.is_org_admin(organization_id));
INSERT INTO public.lead_scoring_settings (organization_id)
SELECT id FROM public.organizations WHERE deleted_at IS NULL
ON CONFLICT (organization_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.seed_default_lead_scoring_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lead_scoring_settings (organization_id) VALUES (NEW.id) ON CONFLICT (organization_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.seed_default_lead_scoring_settings() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER organizations_seed_lead_scoring_settings AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_default_lead_scoring_settings();
CREATE OR REPLACE FUNCTION public.score_crm_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  points INTEGER := 0;
  phone_points INTEGER := 10;
  email_points INTEGER := 5;
  call_points INTEGER := 15;
  interest_points INTEGER := 20;
  meeting_points INTEGER := 25;
  converted_points INTEGER := 50;
  invalid_points INTEGER := -50;
  duplicate_points INTEGER := -100;
  junk_points INTEGER := -100;
BEGIN
  SELECT COALESCE(s.valid_phone_points, 10), COALESCE(s.valid_email_points, 5),
         COALESCE(s.responded_call_points, 15), COALESCE(s.expressed_interest_points, 20),
         COALESCE(s.meeting_scheduled_points, 25), COALESCE(s.converted_points, 50),
         COALESCE(s.invalid_number_points, -50), COALESCE(s.duplicate_points, -100),
         COALESCE(s.junk_lead_points, -100)
    INTO phone_points, email_points, call_points, interest_points, meeting_points,
         converted_points, invalid_points, duplicate_points, junk_points
    FROM (SELECT 1) AS anchor
    LEFT JOIN public.lead_scoring_settings s ON s.organization_id = NEW.organization_id;

  IF NEW.phone IS NOT NULL AND NEW.phone ~ '^[+0-9() .-]{7,20}$' THEN points := points + phone_points; END IF;
  IF NEW.email IS NOT NULL AND NEW.email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$' THEN points := points + email_points; END IF;
  IF NEW.status IN ('Contacted', 'Interested', 'Qualified', 'Meeting Scheduled', 'Negotiation', 'Converted') THEN points := points + call_points; END IF;
  IF NEW.status IN ('Interested', 'Qualified', 'Meeting Scheduled', 'Negotiation', 'Converted') THEN points := points + interest_points; END IF;
  IF NEW.status IN ('Meeting Scheduled', 'Negotiation', 'Converted') THEN points := points + meeting_points; END IF;
  IF NEW.status = 'Converted' THEN points := points + converted_points; END IF;
  IF NEW.status = 'Invalid Number' THEN points := points + invalid_points; END IF;
  IF NEW.status = 'Duplicate' THEN points := points + duplicate_points; END IF;
  IF NEW.status = 'Junk Lead' THEN points := points + junk_points; END IF;
  NEW.lead_score := greatest(0, least(100, points));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.score_crm_lead() FROM PUBLIC, anon, authenticated;