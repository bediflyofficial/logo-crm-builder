ALTER TABLE public.organization_members ADD COLUMN email TEXT;

CREATE OR REPLACE FUNCTION public.score_crm_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  points INTEGER := 0;
BEGIN
  IF NEW.phone IS NOT NULL AND NEW.phone ~ '^[+0-9() .-]{7,20}$' THEN points := points + 10; END IF;
  IF NEW.email IS NOT NULL AND NEW.email ~* '^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$' THEN points := points + 5; END IF;
  IF NEW.status IN ('Contacted', 'Interested', 'Qualified', 'Meeting Scheduled', 'Negotiation', 'Converted') THEN points := points + 15; END IF;
  IF NEW.status IN ('Interested', 'Qualified', 'Meeting Scheduled', 'Negotiation', 'Converted') THEN points := points + 20; END IF;
  IF NEW.status IN ('Meeting Scheduled', 'Negotiation', 'Converted') THEN points := points + 25; END IF;
  IF NEW.status = 'Converted' THEN points := points + 50; END IF;
  IF NEW.status = 'Invalid Number' THEN points := points - 50; END IF;
  IF NEW.status IN ('Duplicate', 'Junk Lead') THEN points := points - 100; END IF;
  NEW.lead_score := greatest(0, least(100, points));
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.score_crm_lead() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER leads_score_automatically BEFORE INSERT OR UPDATE OF phone, email, status ON public.leads FOR EACH ROW EXECUTE FUNCTION public.score_crm_lead();