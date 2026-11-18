DROP TRIGGER IF EXISTS leads_score_automatically ON public.leads;
CREATE TRIGGER leads_score_automatically BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.score_crm_lead();

DROP POLICY IF EXISTS lead_notes_update_author_or_admin ON public.lead_notes;
CREATE POLICY lead_notes_update_author_or_admin ON public.lead_notes FOR UPDATE TO authenticated
USING ((user_id = auth.uid() AND public.is_org_member(organization_id)) OR public.is_platform_admin() OR public.is_org_admin(organization_id))
WITH CHECK ((user_id = auth.uid() AND public.is_org_member(organization_id)) OR public.is_platform_admin() OR public.is_org_admin(organization_id));

DROP POLICY IF EXISTS lead_notes_delete_author_or_admin ON public.lead_notes;
CREATE POLICY lead_notes_delete_author_or_admin ON public.lead_notes FOR DELETE TO authenticated
USING ((user_id = auth.uid() AND public.is_org_member(organization_id)) OR public.is_platform_admin() OR public.is_org_admin(organization_id));