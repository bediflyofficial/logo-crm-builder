import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { metaSettingsSchema } from "@/lib/meta-rules";

export const getMetaOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid().nullable() }).parse(input))
  .handler(async ({ context, data }) => {
    const permission = data.organizationId
      ? await context.supabase.rpc("is_org_admin", { _organization_id: data.organizationId })
      : await context.supabase.rpc("is_platform_admin");
    if (permission.error || !permission.data) throw new Error("Administrator access is required.");
    let connectionsQuery = context.supabase.from("meta_connections").select("id,organization_id,facebook_name,connection_status,token_expires_at,last_sync_at,granted_permissions");
    let assetsQuery = context.supabase.from("meta_assets").select("*");
    let logsQuery = context.supabase.from("meta_sync_logs").select("*").order("created_at", { ascending: false }).limit(50);
    let eventsQuery = context.supabase.from("meta_conversion_events").select("id,organization_id,event_name,status,occurred_at,error_code").order("created_at", { ascending: false }).limit(50);
    if (data.organizationId) {
      connectionsQuery = connectionsQuery.eq("organization_id", data.organizationId);
      assetsQuery = assetsQuery.eq("organization_id", data.organizationId);
      logsQuery = logsQuery.eq("organization_id", data.organizationId);
      eventsQuery = eventsQuery.eq("organization_id", data.organizationId);
    }
    const [connections, assets, logs, events] = await Promise.all([connectionsQuery, assetsQuery, logsQuery, eventsQuery]);
    for (const result of [connections, assets, logs, events]) if (result.error) throw new Error("Meta integration records could not be loaded.");
    const settings = data.organizationId ? await context.supabase.from("meta_integration_settings").select("*").eq("organization_id", data.organizationId).maybeSingle() : null;
    if (settings?.error) throw new Error("Meta settings could not be loaded.");
    const required = ["META_APP_ID", "META_APP_SECRET", "META_GRAPH_API_VERSION", "META_REDIRECT_URI", "META_WEBHOOK_VERIFY_TOKEN", "META_TOKEN_ENCRYPTION_KEY"];
    return { connections: connections.data ?? [], assets: assets.data ?? [], logs: logs.data ?? [], events: events.data ?? [], settings: settings?.data ?? null, missingConfiguration: required.filter((name) => !process.env[name]), oauthImplemented: false, processorImplemented: false };
  });

export const saveMetaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => metaSettingsSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: permitted, error: roleError } = await context.supabase.rpc("is_org_admin", { _organization_id: data.organizationId });
    if (roleError || !permitted) throw new Error("Administrator access is required.");
    if (data.executiveIds.length) {
      const { data: members, error } = await context.supabase.from("organization_members").select("user_id").eq("organization_id", data.organizationId).eq("is_active", true).in("user_id", data.executiveIds);
      const { data: roles, error: rolesError } = await context.supabase.from("user_roles").select("user_id").eq("organization_id", data.organizationId).eq("role", "sales_exec").in("user_id", data.executiveIds);
      if (error || rolesError || data.executiveIds.some((id) => !members?.some((member) => member.user_id === id) || !roles?.some((role) => role.user_id === id))) throw new Error("Choose active sales executives from this workspace.");
    }
    const { error } = await context.supabase.from("meta_integration_settings").upsert({ organization_id: data.organizationId, default_status: data.defaultStatus, default_quality: data.defaultQuality, assignment_mode: data.assignmentMode, executive_ids: data.executiveIds, duplicate_handling: data.duplicateHandling, notifications_enabled: data.notificationsEnabled, updated_at: new Date().toISOString() });
    if (error) throw new Error("Meta settings could not be saved.");
    return { saved: true };
  });