CREATE OR REPLACE FUNCTION public.is_org_member(_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.organization_members m ON m.organization_id = o.id
    JOIN public.user_roles r ON r.user_id = m.user_id AND r.organization_id = m.organization_id
    WHERE o.id = _organization_id AND o.status = 'active'
      AND m.user_id = auth.uid() AND m.is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.organization_members m ON m.organization_id = o.id
    JOIN public.user_roles r ON r.user_id = m.user_id AND r.organization_id = m.organization_id
    WHERE o.id = _organization_id AND o.status = 'active'
      AND m.user_id = auth.uid() AND m.is_active AND r.role = 'client_admin'
  )
$$;

CREATE OR REPLACE FUNCTION public.is_sales_exec(_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    JOIN public.organization_members m ON m.organization_id = o.id
    JOIN public.user_roles r ON r.user_id = m.user_id AND r.organization_id = m.organization_id
    WHERE o.id = _organization_id AND o.status = 'active'
      AND m.user_id = auth.uid() AND m.is_active AND r.role = 'sales_exec'
  )
$$;

GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_exec(UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_sales_exec(UUID) FROM PUBLIC, anon;