import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canEnableCapi, capiConfigSchema, capiStatusAfterSave, type CapiStatus } from "@/lib/meta-rules";

const orgInput = z.object({ organizationId: z.string().uuid() });
type Ctx = { supabase: { rpc: (name: "is_org_admin" | "is_platform_admin", args?: { _organization_id: string }) => PromiseLike<{ data: unknown; error: unknown }> } };

async function requireOrgAdmin(context: Ctx, organizationId: string) {
  const { data, error } = await context.supabase.rpc("is_org_admin", { _organization_id: organizationId });
  if (error || !data) throw new Error("Administrator access is required.");
}
async function requirePlatformAdmin(context: Ctx) {
  const { data, error } = await context.supabase.rpc("is_platform_admin");
  if (error || !data) throw new Error("Super Admin access is required.");
}
async function admin() { return (await import("@/integrations/supabase/client.server")).supabaseAdmin; }
function encryptionSecret() {
  const key = process.env["META_TOKEN_ENCRYPTION_KEY"];
  if (!key) throw new Error("META_TOKEN_ENCRYPTION_KEY is not configured.");
  return key;
}
function safeError(error: unknown) { return (error instanceof Error ? error.message : "Meta request failed.").slice(0, 500); }

async function loadConfig(organizationId: string) {
  const db = await admin();
  const { data, error } = await db.from("meta_capi_configs").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error) throw new Error("Conversions API settings could not be loaded.");
  return data;
}
function publicView(row: Awaited<ReturnType<typeof loadConfig>>) {
  return { datasetId: row?.dataset_id ?? "", hasToken: Boolean(row?.encrypted_capi_token), testEventCode: row?.test_event_code ?? "", enabled: row?.capi_enabled ?? false, status: (row?.status ?? "not_connected") as CapiStatus, lastTestedAt: row?.last_tested_at ?? null, lastTestEventAt: row?.last_test_event_at ?? null, lastError: row?.last_error ?? null, updatedAt: row?.updated_at ?? null };
}
async function update(organizationId: string, values: Record<string, unknown>) {
  const db = await admin();
  const { error } = await db.from("meta_capi_configs").update({ ...values, updated_at: new Date().toISOString() }).eq("organization_id", organizationId);
  if (error) throw new Error("Conversions API status could not be saved.");
}
async function credentials(organizationId: string) {
  const row = await loadConfig(organizationId);
  if (!row?.dataset_id || !row.encrypted_capi_token) throw new Error("Save a Dataset ID and CAPI access token first.");
  const { decryptMetaToken } = await import("@/lib/meta-crypto.server");
  return { row, token: decryptMetaToken(row.encrypted_capi_token, encryptionSecret()) };
}

export const getCapiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orgInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireOrgAdmin(context as unknown as Ctx, data.organizationId);
    return publicView(await loadConfig(data.organizationId));
  });

export const saveCapiConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => capiConfigSchema.parse(input))
  .handler(async ({ context, data }) => {
    await requireOrgAdmin(context as unknown as Ctx, data.organizationId);
    const existing = await loadConfig(data.organizationId);
    let encrypted = existing?.encrypted_capi_token ?? null;
    if (data.accessToken) {
      const { encryptMetaToken } = await import("@/lib/meta-crypto.server");
      encrypted = encryptMetaToken(data.accessToken, encryptionSecret());
    }
    const changed = !existing || existing.dataset_id !== data.datasetId || Boolean(data.accessToken);
    const status: CapiStatus = changed ? capiStatusAfterSave(true, Boolean(encrypted)) : (existing.status as CapiStatus);
    const db = await admin();
    const { error } = await db.from("meta_capi_configs").upsert({ organization_id: data.organizationId, dataset_id: data.datasetId, encrypted_capi_token: encrypted, test_event_code: data.testEventCode || null, status, capi_enabled: changed ? false : existing.capi_enabled, last_error: changed ? null : existing.last_error, updated_by: context.userId, updated_at: new Date().toISOString() });
    if (error) throw new Error("Conversions API settings could not be saved.");
    await context.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: context.userId, action: "meta_capi_saved", entity_type: "meta_capi_config", entity_id: data.organizationId });
    return publicView(await loadConfig(data.organizationId));
  });

export const testCapiConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orgInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireOrgAdmin(context as unknown as Ctx, data.organizationId);
    const { row, token } = await credentials(data.organizationId);
    const { metaRequest } = await import("@/lib/meta-api.server");
    try {
      const result = z.object({ id: z.string(), name: z.string().optional() }).parse(await metaRequest(row.dataset_id!, token, { fields: "id,name" }));
      const keep = row.status === "test_successful" || row.status === "production_active";
      await update(data.organizationId, { status: keep ? row.status : "connected", last_tested_at: new Date().toISOString(), last_error: null });
      return { ok: true, datasetName: result.name ?? result.id };
    } catch (error) {
      await update(data.organizationId, { status: "connection_error", capi_enabled: false, last_tested_at: new Date().toISOString(), last_error: safeError(error) });
      throw new Error(safeError(error));
    }
  });

export const sendCapiTestEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orgInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireOrgAdmin(context as unknown as Ctx, data.organizationId);
    const { row, token } = await credentials(data.organizationId);
    if (!row.test_event_code) throw new Error("Add the Test Event Code from Meta Events Manager first.");
    const { metaRequest } = await import("@/lib/meta-api.server");
    const { createHash } = await import("node:crypto");
    // Synthetic test event with a hashed non-personal identifier; no customer data is sent.
    const event = { event_name: "BediflyTestEvent", event_time: Math.floor(Date.now() / 1000), action_source: "system_generated", event_id: `test-${crypto.randomUUID()}`, user_data: { external_id: [createHash("sha256").update(`bedifly-test-${data.organizationId}`).digest("hex")] } };
    try {
      const result = z.object({ events_received: z.number() }).parse(await metaRequest(`${row.dataset_id}/events`, token, { data: JSON.stringify([event]), test_event_code: row.test_event_code }, "POST"));
      if (result.events_received < 1) throw new Error("Meta did not accept the test event.");
      await update(data.organizationId, { status: row.status === "production_active" ? "production_active" : "test_successful", last_test_event_at: new Date().toISOString(), last_error: null });
      return { eventsReceived: result.events_received };
    } catch (error) {
      await update(data.organizationId, { status: "connection_error", capi_enabled: false, last_error: safeError(error) });
      throw new Error(safeError(error));
    }
  });

export const setCapiEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orgInput.extend({ enabled: z.boolean() }).parse(input))
  .handler(async ({ context, data }) => {
    await requireOrgAdmin(context as unknown as Ctx, data.organizationId);
    const row = await loadConfig(data.organizationId);
    if (!row) throw new Error("Save the Conversions API configuration first.");
    if (data.enabled && !canEnableCapi(row.status as CapiStatus, Boolean(row.dataset_id), Boolean(row.encrypted_capi_token))) throw new Error("Send a successful test event before enabling the Conversions API.");
    await update(data.organizationId, { capi_enabled: data.enabled, status: data.enabled ? "production_active" : row.status === "production_active" ? "test_successful" : row.status });
    await context.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: context.userId, action: data.enabled ? "meta_capi_enabled" : "meta_capi_disabled", entity_type: "meta_capi_config", entity_id: data.organizationId });
    return publicView(await loadConfig(data.organizationId));
  });

export const disconnectCapi = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => orgInput.parse(input))
  .handler(async ({ context, data }) => {
    await requireOrgAdmin(context as unknown as Ctx, data.organizationId);
    const db = await admin();
    const { error } = await db.from("meta_capi_configs").delete().eq("organization_id", data.organizationId);
    if (error) throw new Error("Conversions API could not be disconnected.");
    await context.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: context.userId, action: "meta_capi_disconnected", entity_type: "meta_capi_config", entity_id: data.organizationId });
    return { disconnected: true };
  });

const APP_SECRETS = ["META_APP_ID", "META_APP_SECRET", "META_GRAPH_API_VERSION", "META_REDIRECT_URI", "META_WEBHOOK_VERIFY_TOKEN", "META_TOKEN_ENCRYPTION_KEY"] as const;

export const getMetaAppStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context as unknown as Ctx);
    const appId = process.env["META_APP_ID"] ?? "";
    const redirectUri = process.env["META_REDIRECT_URI"] ?? null;
    // Callback URLs are derived from the published HTTPS address Meta must call; secret values are never returned.
    const base = "https://lead-lantern-workspaces.lovable.app";
    const settings = APP_SECRETS.map((name) => ({ name, configured: Boolean(process.env[name]?.trim()) }));
    return { settings, missing: settings.filter((s) => !s.configured).map((s) => s.name), checkedAt: new Date().toISOString(), appIdHint: appId ? `••••${appId.slice(-4)}` : null, graphVersion: process.env["META_GRAPH_API_VERSION"] ?? null, redirectUri, expectedRedirectUri: `${base}/api/public/meta/callback`, redirectMatches: redirectUri === `${base}/api/public/meta/callback`, webhookUrl: `${base}/api/public/meta/webhook`, webhookPath: "/api/public/meta/webhook" };
  });

export const testMetaApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context as unknown as Ctx);
    const appId = process.env["META_APP_ID"]; const secret = process.env["META_APP_SECRET"];
    if (!appId || !secret) throw new Error("META_APP_ID and META_APP_SECRET must be set in backend secrets.");
    if (!/^\d+$/.test(appId)) throw new Error("META_APP_ID must be numeric.");
    const { metaRequest } = await import("@/lib/meta-api.server");
    try {
      const result = z.object({ id: z.string(), name: z.string().optional() }).parse(await metaRequest(appId, `${appId}|${secret}`, { fields: "id,name" }));
      return { ok: true, appName: result.name ?? result.id };
    } catch (error) { throw new Error(safeError(error)); }
  });

export const listClientIntegrationStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requirePlatformAdmin(context as unknown as Ctx);
    const db = await admin();
    const [orgs, configs, connections, events] = await Promise.all([
      db.from("organizations").select("id,name,status").is("deleted_at", null).order("name"),
      db.from("meta_capi_configs").select("organization_id,dataset_id,status,capi_enabled,last_tested_at,last_test_event_at,last_error"),
      db.from("meta_connections").select("organization_id,connection_status,facebook_name"),
      db.from("meta_conversion_events").select("organization_id,status").gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()).limit(10000),
    ]);
    if (orgs.error || configs.error || connections.error || events.error) throw new Error("Client integration statuses could not be loaded.");
    return (orgs.data ?? []).filter((org) => org.name).map((org) => {
      const config = configs.data?.find((item) => item.organization_id === org.id);
      const conn = connections.data?.filter((item) => item.organization_id === org.id) ?? [];
      const own = events.data?.filter((item) => item.organization_id === org.id) ?? [];
      const count = (status: string) => own.filter((item) => item.status === status).length;
      return { organizationId: org.id, name: org.name, workspaceStatus: org.status, facebook: conn.some((c) => c.connection_status === "connected") ? "connected" : conn.length ? conn[0]!.connection_status : "not_connected", facebookName: conn.find((c) => c.connection_status === "connected")?.facebook_name ?? null, capiStatus: (config?.status ?? "not_connected") as CapiStatus, capiEnabled: config?.capi_enabled ?? false, datasetId: config?.dataset_id ?? null, lastTestEventAt: config?.last_test_event_at ?? null, lastError: config?.last_error ?? null, events: { sent: count("sent"), failed: count("failed"), pending: count("pending") + count("processing"), blocked: count("blocked") } };
    });
  });
