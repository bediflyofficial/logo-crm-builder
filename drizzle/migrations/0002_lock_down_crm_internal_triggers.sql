REVOKE INSERT ON public.lead_activities FROM authenticated;
REVOKE ALL ON FUNCTION public.seed_default_lead_statuses() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_lead_activity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_sales_lead_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;