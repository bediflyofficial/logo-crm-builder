REVOKE ALL ON public.meta_conversion_delivery_attempts FROM anon, authenticated;
GRANT SELECT ON public.meta_conversion_delivery_attempts TO authenticated;
GRANT ALL ON public.meta_conversion_delivery_attempts TO service_role;

REVOKE ALL ON public.meta_conversion_rules FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meta_conversion_rules TO authenticated;
GRANT ALL ON public.meta_conversion_rules TO service_role;