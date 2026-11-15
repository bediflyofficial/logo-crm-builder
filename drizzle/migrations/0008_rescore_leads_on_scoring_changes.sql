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
  IF NEW.email IS NOT NULL AND NEW.email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN points := points + email_points; END IF;
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
CREATE OR REPLACE FUNCTION public.rescore_leads_after_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.leads SET status = status
  WHERE organization_id = NEW.organization_id AND deleted_at IS NULL;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.rescore_leads_after_settings_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER lead_scoring_settings_rescore_leads
AFTER UPDATE OF valid_phone_points, valid_email_points, responded_call_points, expressed_interest_points, meeting_scheduled_points, converted_points, invalid_number_points, duplicate_points, junk_lead_points
ON public.lead_scoring_settings
FOR EACH ROW
WHEN (OLD.valid_phone_points IS DISTINCT FROM NEW.valid_phone_points OR OLD.valid_email_points IS DISTINCT FROM NEW.valid_email_points OR OLD.responded_call_points IS DISTINCT FROM NEW.responded_call_points OR OLD.expressed_interest_points IS DISTINCT FROM NEW.expressed_interest_points OR OLD.meeting_scheduled_points IS DISTINCT FROM NEW.meeting_scheduled_points OR OLD.converted_points IS DISTINCT FROM NEW.converted_points OR OLD.invalid_number_points IS DISTINCT FROM NEW.invalid_number_points OR OLD.duplicate_points IS DISTINCT FROM NEW.duplicate_points OR OLD.junk_lead_points IS DISTINCT FROM NEW.junk_lead_points)
EXECUTE FUNCTION public.rescore_leads_after_settings_change();