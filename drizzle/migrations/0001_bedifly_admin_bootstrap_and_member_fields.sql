ALTER TABLE public.organization_members ADD COLUMN full_name TEXT;
ALTER TABLE public.organization_members ADD COLUMN phone TEXT;
ALTER TABLE public.organization_members ADD COLUMN profile_picture_url TEXT;

CREATE OR REPLACE FUNCTION public.bootstrap_bedifly_platform_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(coalesce(NEW.email, '')) = 'bediflyofficial@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, organization_id, role)
    VALUES (NEW.id, NULL, 'platform_admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.bootstrap_bedifly_platform_admin() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER bedifly_bootstrap_platform_admin AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.bootstrap_bedifly_platform_admin();