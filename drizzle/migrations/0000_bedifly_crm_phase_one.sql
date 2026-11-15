CREATE TYPE public.app_role AS ENUM ('platform_admin', 'client_admin', 'sales_exec');

CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  business_category TEXT,
  website TEXT,
  address TEXT,
  city TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'inactive')),
  subscription_plan TEXT NOT NULL DEFAULT 'Phase 1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_roles_org_role_shape CHECK ((role = 'platform_admin' AND organization_id IS NULL) OR (role <> 'platform_admin' AND organization_id IS NOT NULL))
);
CREATE UNIQUE INDEX user_roles_platform_unique ON public.user_roles (user_id) WHERE role = 'platform_admin';
CREATE UNIQUE INDEX user_roles_org_unique ON public.user_roles (user_id, organization_id, role) WHERE organization_id IS NOT NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX organization_members_user_idx ON public.organization_members (user_id, organization_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lead_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_terminal BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX lead_statuses_org_order_idx ON public.lead_statuses (organization_id, position);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_statuses TO authenticated;
GRANT ALL ON public.lead_statuses TO service_role;
ALTER TABLE public.lead_statuses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  whatsapp_number TEXT,
  city TEXT,
  state TEXT,
  country TEXT,
  source TEXT NOT NULL DEFAULT 'Manual',
  campaign_name TEXT,
  ad_set_name TEXT,
  ad_name TEXT,
  form_name TEXT,
  source_reference_id TEXT,
  lead_created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'New Lead',
  quality TEXT NOT NULL DEFAULT 'Warm' CHECK (quality IN ('Hot', 'Warm', 'Cold', 'Junk')),
  lead_score INTEGER NOT NULL DEFAULT 0 CHECK (lead_score BETWEEN 0 AND 100),
  assigned_to UUID,
  follow_up_at TIMESTAMPTZ,
  lead_value NUMERIC(12,2),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX leads_org_created_idx ON public.leads (organization_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX leads_org_status_idx ON public.leads (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX leads_assignee_idx ON public.leads (organization_id, assigned_to, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX leads_phone_idx ON public.leads (organization_id, phone) WHERE deleted_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID,
  activity_type TEXT NOT NULL,
  description TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_activities_lead_time_idx ON public.lead_activities (lead_id, created_at DESC);
GRANT SELECT, INSERT ON public.lead_activities TO authenticated;
GRANT ALL ON public.lead_activities TO service_role;
ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lead_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  content TEXT NOT NULL CHECK (length(trim(content)) BETWEEN 1 AND 5000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX lead_notes_lead_time_idx ON public.lead_notes (lead_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_notes TO authenticated;
GRANT ALL ON public.lead_notes TO service_role;
ALTER TABLE public.lead_notes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX follow_ups_org_schedule_idx ON public.follow_ups (organization_id, scheduled_at) WHERE completed_at IS NULL;
CREATE INDEX follow_ups_assignee_schedule_idx ON public.follow_ups (assigned_to, scheduled_at) WHERE completed_at IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.follow_ups TO authenticated;
GRANT ALL ON public.follow_ups TO service_role;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_time_idx ON public.notifications (user_id, created_at DESC);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_org_time_idx ON public.audit_logs (organization_id, created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'platform_admin' AND organization_id IS NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(_organization_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.organization_members m
    JOIN public.user_roles r ON r.user_id = m.user_id AND r.organization_id = m.organization_id
    WHERE m.organization_id = _organization_id AND m.user_id = auth.uid() AND m.is_active
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
    SELECT 1 FROM public.organization_members m
    JOIN public.user_roles r ON r.user_id = m.user_id AND r.organization_id = m.organization_id
    WHERE m.organization_id = _organization_id AND m.user_id = auth.uid() AND m.is_active AND r.role = 'client_admin'
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
    SELECT 1 FROM public.organization_members m
    JOIN public.user_roles r ON r.user_id = m.user_id AND r.organization_id = m.organization_id
    WHERE m.organization_id = _organization_id AND m.user_id = auth.uid() AND m.is_active AND r.role = 'sales_exec'
  )
$$;

CREATE OR REPLACE FUNCTION public.can_view_lead(_organization_id UUID, _assigned_to UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin() OR public.is_org_admin(_organization_id) OR
    (public.is_sales_exec(_organization_id) AND _assigned_to = auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_exec(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_lead(UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.is_platform_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_sales_exec(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_view_lead(UUID, UUID) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.seed_default_lead_statuses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.lead_statuses (organization_id, name, position, is_default, is_terminal) VALUES
    (NEW.id, 'New Lead', 0, true, false),
    (NEW.id, 'Contacted', 1, true, false),
    (NEW.id, 'Interested', 2, true, false),
    (NEW.id, 'Qualified', 3, true, false),
    (NEW.id, 'Meeting Scheduled', 4, true, false),
    (NEW.id, 'Negotiation', 5, true, false),
    (NEW.id, 'Converted', 6, true, true),
    (NEW.id, 'Not Interested', 7, true, true),
    (NEW.id, 'Invalid Number', 8, true, true),
    (NEW.id, 'Duplicate', 9, true, true),
    (NEW.id, 'Junk Lead', 10, true, true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER organizations_seed_lead_statuses AFTER INSERT ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.seed_default_lead_statuses();

CREATE OR REPLACE FUNCTION public.record_lead_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.lead_activities (organization_id, lead_id, user_id, activity_type, description)
    VALUES (NEW.organization_id, NEW.id, auth.uid(), 'created', 'Lead created');
    RETURN NEW;
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.lead_activities (organization_id, lead_id, user_id, activity_type, description, details)
    VALUES (NEW.organization_id, NEW.id, auth.uid(), 'status_changed', 'Status changed', jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF OLD.quality IS DISTINCT FROM NEW.quality THEN
    INSERT INTO public.lead_activities (organization_id, lead_id, user_id, activity_type, description, details)
    VALUES (NEW.organization_id, NEW.id, auth.uid(), 'quality_changed', 'Lead quality updated', jsonb_build_object('from', OLD.quality, 'to', NEW.quality));
  END IF;
  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.lead_activities (organization_id, lead_id, user_id, activity_type, description, details)
    VALUES (NEW.organization_id, NEW.id, auth.uid(), 'assigned', 'Lead assignment changed', jsonb_build_object('from', OLD.assigned_to, 'to', NEW.assigned_to));
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER leads_record_activity AFTER INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.record_lead_activity();

CREATE OR REPLACE FUNCTION public.guard_sales_lead_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_sales_exec(OLD.organization_id) AND NOT public.is_org_admin(OLD.organization_id) AND NOT public.is_platform_admin() THEN
    IF NEW.organization_id IS DISTINCT FROM OLD.organization_id OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR
       NEW.full_name IS DISTINCT FROM OLD.full_name OR NEW.phone IS DISTINCT FROM OLD.phone OR NEW.email IS DISTINCT FROM OLD.email OR
       NEW.whatsapp_number IS DISTINCT FROM OLD.whatsapp_number OR NEW.city IS DISTINCT FROM OLD.city OR NEW.state IS DISTINCT FROM OLD.state OR
       NEW.country IS DISTINCT FROM OLD.country OR NEW.source IS DISTINCT FROM OLD.source OR NEW.campaign_name IS DISTINCT FROM OLD.campaign_name OR
       NEW.ad_set_name IS DISTINCT FROM OLD.ad_set_name OR NEW.ad_name IS DISTINCT FROM OLD.ad_name OR NEW.form_name IS DISTINCT FROM OLD.form_name OR
       NEW.source_reference_id IS DISTINCT FROM OLD.source_reference_id OR NEW.lead_value IS DISTINCT FROM OLD.lead_value OR
       NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
      RAISE EXCEPTION 'Sales executives can only update lead status, quality, score, and follow-up date';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER leads_guard_sales_update BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.guard_sales_lead_update();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER organizations_touch_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER leads_touch_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER lead_notes_touch_updated_at BEFORE UPDATE ON public.lead_notes FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER follow_ups_touch_updated_at BEFORE UPDATE ON public.follow_ups FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY organizations_read_scoped ON public.organizations FOR SELECT TO authenticated USING (deleted_at IS NULL AND (public.is_platform_admin() OR public.is_org_member(id)));
CREATE POLICY organizations_insert_platform ON public.organizations FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin());
CREATE POLICY organizations_update_admin ON public.organizations FOR UPDATE TO authenticated USING (public.is_platform_admin() OR public.is_org_admin(id)) WITH CHECK (public.is_platform_admin() OR public.is_org_admin(id));
CREATE POLICY organizations_delete_platform ON public.organizations FOR DELETE TO authenticated USING (public.is_platform_admin());

CREATE POLICY user_roles_read_self_or_admin ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin() OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id)));
CREATE POLICY user_roles_insert_admin ON public.user_roles FOR INSERT TO authenticated WITH CHECK (
  public.is_platform_admin() OR (organization_id IS NOT NULL AND role IN ('client_admin', 'sales_exec') AND public.is_org_admin(organization_id))
);
CREATE POLICY user_roles_update_admin ON public.user_roles FOR UPDATE TO authenticated USING (
  public.is_platform_admin() OR (organization_id IS NOT NULL AND role IN ('client_admin', 'sales_exec') AND public.is_org_admin(organization_id))
) WITH CHECK (
  public.is_platform_admin() OR (organization_id IS NOT NULL AND role IN ('client_admin', 'sales_exec') AND public.is_org_admin(organization_id))
);
CREATE POLICY user_roles_delete_admin ON public.user_roles FOR DELETE TO authenticated USING (
  public.is_platform_admin() OR (organization_id IS NOT NULL AND role IN ('client_admin', 'sales_exec') AND public.is_org_admin(organization_id))
);

CREATE POLICY organization_members_read_scoped ON public.organization_members FOR SELECT TO authenticated USING (
  user_id = auth.uid() OR public.is_platform_admin() OR public.is_org_admin(organization_id)
);
CREATE POLICY organization_members_insert_admin ON public.organization_members FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin() OR public.is_org_admin(organization_id));
CREATE POLICY organization_members_update_admin ON public.organization_members FOR UPDATE TO authenticated USING (public.is_platform_admin() OR public.is_org_admin(organization_id)) WITH CHECK (public.is_platform_admin() OR public.is_org_admin(organization_id));
CREATE POLICY organization_members_delete_admin ON public.organization_members FOR DELETE TO authenticated USING (public.is_platform_admin() OR public.is_org_admin(organization_id));

CREATE POLICY lead_statuses_read_scoped ON public.lead_statuses FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY lead_statuses_insert_admin ON public.lead_statuses FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin() OR public.is_org_admin(organization_id));
CREATE POLICY lead_statuses_update_admin ON public.lead_statuses FOR UPDATE TO authenticated USING (public.is_platform_admin() OR public.is_org_admin(organization_id)) WITH CHECK (public.is_platform_admin() OR public.is_org_admin(organization_id));
CREATE POLICY lead_statuses_delete_admin ON public.lead_statuses FOR DELETE TO authenticated USING (public.is_platform_admin() OR public.is_org_admin(organization_id));

CREATE POLICY leads_read_assigned_or_admin ON public.leads FOR SELECT TO authenticated USING (deleted_at IS NULL AND public.can_view_lead(organization_id, assigned_to));
CREATE POLICY leads_insert_admin ON public.leads FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin() OR public.is_org_admin(organization_id));
CREATE POLICY leads_update_assigned_or_admin ON public.leads FOR UPDATE TO authenticated USING (deleted_at IS NULL AND public.can_view_lead(organization_id, assigned_to)) WITH CHECK (public.can_view_lead(organization_id, assigned_to));
CREATE POLICY leads_delete_admin ON public.leads FOR DELETE TO authenticated USING (public.is_platform_admin() OR public.is_org_admin(organization_id));

CREATE POLICY lead_activities_read_scoped ON public.lead_activities FOR SELECT TO authenticated USING (public.can_view_lead(organization_id, (SELECT l.assigned_to FROM public.leads l WHERE l.id = lead_id)));
CREATE POLICY lead_activities_insert_scoped ON public.lead_activities FOR INSERT TO authenticated WITH CHECK (public.can_view_lead(organization_id, (SELECT l.assigned_to FROM public.leads l WHERE l.id = lead_id)));

CREATE POLICY lead_notes_read_scoped ON public.lead_notes FOR SELECT TO authenticated USING (public.can_view_lead(organization_id, (SELECT l.assigned_to FROM public.leads l WHERE l.id = lead_id)));
CREATE POLICY lead_notes_insert_scoped ON public.lead_notes FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND public.can_view_lead(organization_id, (SELECT l.assigned_to FROM public.leads l WHERE l.id = lead_id))
);
CREATE POLICY lead_notes_update_author_or_admin ON public.lead_notes FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin() OR public.is_org_admin(organization_id)) WITH CHECK (user_id = auth.uid() OR public.is_platform_admin() OR public.is_org_admin(organization_id));
CREATE POLICY lead_notes_delete_author_or_admin ON public.lead_notes FOR DELETE TO authenticated USING (user_id = auth.uid() OR public.is_platform_admin() OR public.is_org_admin(organization_id));

CREATE POLICY follow_ups_read_scoped ON public.follow_ups FOR SELECT TO authenticated USING (public.can_view_lead(organization_id, (SELECT l.assigned_to FROM public.leads l WHERE l.id = lead_id)));
CREATE POLICY follow_ups_insert_scoped ON public.follow_ups FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND public.can_view_lead(organization_id, (SELECT l.assigned_to FROM public.leads l WHERE l.id = lead_id)) AND
  (public.is_platform_admin() OR public.is_org_admin(organization_id) OR assigned_to = auth.uid())
);
CREATE POLICY follow_ups_update_scoped ON public.follow_ups FOR UPDATE TO authenticated USING (
  public.is_platform_admin() OR public.is_org_admin(organization_id) OR assigned_to = auth.uid()
) WITH CHECK (
  public.can_view_lead(organization_id, (SELECT l.assigned_to FROM public.leads l WHERE l.id = lead_id)) AND
  (public.is_platform_admin() OR public.is_org_admin(organization_id) OR assigned_to = auth.uid())
);
CREATE POLICY follow_ups_delete_admin ON public.follow_ups FOR DELETE TO authenticated USING (public.is_platform_admin() OR public.is_org_admin(organization_id));

CREATE POLICY notifications_read_own ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY notifications_update_own ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY audit_logs_read_admin ON public.audit_logs FOR SELECT TO authenticated USING (public.is_platform_admin() OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id)));
CREATE POLICY audit_logs_insert_scoped ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (
  user_id = auth.uid() AND (public.is_platform_admin() OR (organization_id IS NOT NULL AND public.is_org_admin(organization_id)))
);