CREATE OR REPLACE FUNCTION public.guard_meta_lead_import() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE enabled boolean;
BEGIN
 IF NEW.meta_lead_id IS NOT NULL THEN
  SELECT auto_sync_enabled INTO enabled FROM public.meta_integration_settings WHERE organization_id=NEW.organization_id FOR SHARE;
  IF enabled IS DISTINCT FROM true OR NOT EXISTS(SELECT 1 FROM public.organizations WHERE id=NEW.organization_id AND status='active' AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Meta lead synchronization is paused'; END IF;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_meta_lead_import() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER guard_meta_lead_import BEFORE INSERT ON public.leads FOR EACH ROW EXECUTE FUNCTION public.guard_meta_lead_import();