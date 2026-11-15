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
    const required = ["META_APP_ID", "META_APP_SECRET", "META_GRAPH_API_VERSION", "META_REDIRECT_URI", "META_WEBHOOK_VERIFY_TOKEN", "META_TOKEN_ENCRYPTION_KEY", "META_LOGIN_CONFIG_ID"];
    return { connections: connections.data ?? [], assets: assets.data ?? [], logs: logs.data ?? [], events: events.data ?? [], settings: settings?.data ?? null, missingConfiguration: required.filter((name) => !process.env[name]), oauthImplemented: true, processorImplemented: true };
  });

export const saveMetaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => metaSettingsSchema.parse(input))
  .handler(async ({ context, data }) => {
    const { data: permitted, error: roleError } = await context.supabase.rpc("is_org_admin", { _organization_id: data.organizationId });
    if (roleError || !permitted) throw new Error("Administrator access is required.");
    const { data: status, error: statusError } = await context.supabase.from("lead_statuses").select("id").eq("organization_id", data.organizationId).eq("name", data.defaultStatus).limit(1);
    if (statusError || !status?.length) throw new Error("Choose a lead status from this workspace.");
    if (data.executiveIds.length) {
      const { data: members, error } = await context.supabase.from("organization_members").select("user_id").eq("organization_id", data.organizationId).eq("is_active", true).in("user_id", data.executiveIds);
      const { data: roles, error: rolesError } = await context.supabase.from("user_roles").select("user_id").eq("organization_id", data.organizationId).eq("role", "sales_exec").in("user_id", data.executiveIds);
      if (error || rolesError || data.executiveIds.some((id) => !members?.some((member) => member.user_id === id) || !roles?.some((role) => role.user_id === id))) throw new Error("Choose active sales executives from this workspace.");
    }
    if (data.autoSyncEnabled) {
      const { data: forms, error: formError } = await context.supabase.from("meta_assets").select("id").eq("organization_id", data.organizationId).eq("asset_type", "form").eq("selected", true).limit(1);
      if (formError || !forms?.length || !process.env["META_WEBHOOK_VERIFY_TOKEN"]) throw new Error("Select a subscribed Page and lead form and configure the Meta webhook first.");
    }
    const { error } = await context.supabase.from("meta_integration_settings").upsert({ organization_id: data.organizationId, auto_sync_enabled: data.autoSyncEnabled, default_status: data.defaultStatus, default_quality: data.defaultQuality, assignment_mode: data.assignmentMode, executive_ids: data.executiveIds, duplicate_handling: data.duplicateHandling, notifications_enabled: data.notificationsEnabled, updated_at: new Date().toISOString() });
    if (error) throw new Error("Meta settings could not be saved.");
    return { saved: true };
  });

export const startMetaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid(), origin: z.string().url().max(500) }).parse(input))
  .handler(async ({ context, data }) => {
    const permission = await context.supabase.rpc("is_org_admin", { _organization_id: data.organizationId });
    if (permission.error || !permission.data) throw new Error("Administrator access is required.");
    const { metaConfig } = await import("@/lib/meta-api.server");
    const config = metaConfig();
    if (new URL(config.redirectUri).origin !== data.origin) throw new Error("Open the CRM at its configured Facebook callback address before connecting.");
    const { hashMetaState, newMetaState } = await import("@/lib/meta-crypto.server");
    const state = newMetaState();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("meta_oauth_sessions").insert({ organization_id: data.organizationId, user_id: context.userId, state_hash: hashMetaState(state), redirect_uri: config.redirectUri, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    if (error) throw new Error("Facebook authorization could not be started.");
    const url = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
    url.search = new URLSearchParams({ client_id: config.appId, redirect_uri: config.redirectUri, state, config_id: config.loginConfigId, response_type: "code", override_default_response_type: "true" }).toString();
    return { authorizationUrl: url.toString(), state };
  });

export const completeMetaOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid(), state: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().min(1).max(4096) }).parse(input))
  .handler(async ({ context, data }) => {
    const permission = await context.supabase.rpc("is_org_admin", { _organization_id: data.organizationId });
    if (permission.error || !permission.data) throw new Error("Administrator access is required.");
    const { metaConfig, metaRequest, metaList } = await import("@/lib/meta-api.server");
    const config = metaConfig();
    const { hashMetaState, encryptMetaToken } = await import("@/lib/meta-crypto.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Atomic consume binds the request to this signed-in user AND client workspace.
    const { data: session, error: stateError } = await supabaseAdmin.from("meta_oauth_sessions").update({ consumed_at: new Date().toISOString() }).eq("state_hash", hashMetaState(data.state)).eq("user_id", context.userId).eq("organization_id", data.organizationId).eq("redirect_uri", config.redirectUri).is("consumed_at", null).gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
    if (stateError || !session) throw new Error("Facebook authorization expired or was already used. Connect again.");
    const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().optional() });
    const initial = tokenSchema.parse(await metaRequest("oauth/access_token", null, { client_id: config.appId, client_secret: config.appSecret, redirect_uri: config.redirectUri, code: data.code }, "POST"));
    const token = tokenSchema.parse(await metaRequest("oauth/access_token", null, { grant_type: "fb_exchange_token", client_id: config.appId, client_secret: config.appSecret, fb_exchange_token: initial.access_token }, "POST"));
    const identity = z.object({ id: z.string().regex(/^\d+$/), name: z.string() }).parse(await metaRequest("me", token.access_token, { fields: "id,name" }));
    const granted = (await metaList("me/permissions", token.access_token, "permission,status")).filter((item) => item["status"] === "granted" && typeof item["permission"] === "string").map((item) => String(item["permission"]));
    const { data: connection, error } = await supabaseAdmin.from("meta_connections").upsert({ organization_id: data.organizationId, meta_user_id: identity.id, facebook_name: identity.name, encrypted_access_token: encryptMetaToken(token.access_token, config.encryptionSecret), token_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null, connection_status: "connected", granted_permissions: granted, connected_by: context.userId, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "organization_id,meta_user_id" }).select("id").single();
    if (error || !connection) throw new Error("Facebook authorization succeeded but the connection could not be saved. Connect again.");
    const { error: auditError } = await context.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: context.userId, action: "meta_connected", entity_type: "meta_connection", entity_id: connection.id });
    if (auditError) throw new Error("Facebook is connected, but its audit entry could not be saved.");
    return { connected: true, connectionId: connection.id, missingPermissions: ["leads_retrieval", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "pages_manage_metadata", "ads_read", "business_management"].filter((item) => !granted.includes(item)) };
  });

export const refreshMetaConnectionAssets = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid(), connectionId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const permission = await context.supabase.rpc("is_org_admin", { _organization_id: data.organizationId });
    if (permission.error || !permission.data) throw new Error("Administrator access is required.");
    const { refreshMetaAssets } = await import("@/lib/meta-assets.server");
    return refreshMetaAssets(data.organizationId, data.connectionId);
  });

export const updateMetaAssetSelection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid(), assetId: z.string().uuid(), selected: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    const permission = await context.supabase.rpc("is_org_admin", { _organization_id: data.organizationId });
    if (permission.error || !permission.data) throw new Error("Administrator access is required.");
    const { selectMetaAsset } = await import("@/lib/meta-assets.server");
    return selectMetaAsset(data.organizationId, data.assetId, data.selected);
  });

export const disconnectMetaConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid(), connectionId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const permission = await context.supabase.rpc("is_org_admin", { _organization_id: data.organizationId });
    if (permission.error || !permission.data) throw new Error("Administrator access is required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: connection, error } = await supabaseAdmin.from("meta_connections").update({ connection_status: "disconnected", encrypted_access_token: null, updated_at: new Date().toISOString() }).eq("id", data.connectionId).eq("organization_id", data.organizationId).select("id").single();
    if (error || !connection) throw new Error("Facebook connection could not be disconnected.");
    const { data: assets, error: assetError } = await supabaseAdmin.from("meta_assets").update({ selected: false, webhook_subscribed: false }).eq("connection_id", connection.id).eq("organization_id", data.organizationId).select("id");
    if (assetError) throw new Error("Facebook is disconnected but its assets could not be paused.");
    if (assets?.length) {
      const { error: credentialsError } = await supabaseAdmin.from("meta_asset_credentials").delete().eq("organization_id", data.organizationId).in("asset_id", assets.map((item) => item.id));
      if (credentialsError) throw new Error("Facebook is disconnected but Page credentials could not be cleared.");
    }
    const { error: auditError } = await context.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: context.userId, action: "meta_disconnected", entity_type: "meta_connection", entity_id: connection.id });
    if (auditError) throw new Error("Facebook is disconnected but its audit entry could not be saved.");
    return { disconnected: true };
  });
export const logMetaOAuthError = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ organizationId: z.string().uuid(), message: z.string().min(1).max(500) }).parse(input))
  .handler(async ({ context, data }) => {
    const permission = await context.supabase.rpc("is_org_admin", { _organization_id: data.organizationId });
    if (permission.error || !permission.data) throw new Error("Administrator access is required.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("meta_sync_logs").insert({ organization_id: data.organizationId, sync_type: "oauth", status: "failed", records_processed: 0, error_message: data.message });
    if (error) throw new Error("Facebook sign-in error could not be logged.");
    return { logged: true };
  });
