CREATE OR REPLACE FUNCTION public.bootstrap_bedifly_platform_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) = 'bediflyofficial@gmail.com'
     AND NEW.email_confirmed_at IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, NULL, 'platform_admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_bedifly_platform_admin() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER bedifly_bootstrap_platform_admin_on_confirm
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (NEW.email_confirmed_at IS NOT NULL AND (OLD.email_confirmed_at IS NULL OR OLD.email_confirmed_at IS DISTINCT FROM NEW.email_confirmed_at))
EXECUTE FUNCTION public.bootstrap_bedifly_platform_admin();