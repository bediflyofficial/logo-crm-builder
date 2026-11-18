import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { AdminError, authenticateCaller } from "@/lib/crm-admin.server";
import { isAllowedCrmOrigin } from "@/lib/crm-admin-rules";
import { authorizeMetaAction, type MetaAction, type MetaAuthorizationCaller, type MetaCapiConfigView } from "@/lib/meta-api-rules";
import { assessMetaAccess, canEnableCapi, capiConfigSchema, capiStatusAfterSave, metaConversionRuleSchema, metaSettingsSchema, missingMetaPermissions, type CapiStatus } from "@/lib/meta-rules";
import { hashMetaState } from "@/lib/meta-crypto.server";
import { metaConsentSchema, metaConsentWithdrawalSchema } from "@/lib/meta-consent";

type Caller = Awaited<ReturnType<typeof authenticateCaller>>;
const orgInput = z.object({ organizationId: z.string().uuid() });
const APP_SECRETS = ["META_APP_ID", "META_APP_SECRET", "META_GRAPH_API_VERSION", "META_REDIRECT_URI", "META_WEBHOOK_VERIFY_TOKEN", "META_TOKEN_ENCRYPTION_KEY", "META_LOGIN_CONFIG_ID"] as const;

async function authorize(caller: Caller, action: MetaAction, organizationId: string | null) {
  await authorizeMetaAction(caller as unknown as MetaAuthorizationCaller, action, organizationId);
}

function encryptionSecret() {
  const key = process.env["META_TOKEN_ENCRYPTION_KEY"];
  if (!key) throw new AdminError("META_TOKEN_ENCRYPTION_KEY is not configured.", 500);
  return key;
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Meta request failed.").slice(0, 500);
}

async function loadConfig(organizationId: string) {
  const { data, error } = await supabaseAdmin.from("meta_capi_configs").select("*").eq("organization_id", organizationId).maybeSingle();
  if (error) throw new AdminError("Conversions API settings could not be loaded.", 500);
  return data;
}

function publicView(row: Awaited<ReturnType<typeof loadConfig>>): MetaCapiConfigView {
  return {
    datasetId: row?.dataset_id ?? "",
    hasToken: Boolean(row?.encrypted_capi_token),
    testEventCode: row?.test_event_code ?? "",
    enabled: row?.capi_enabled ?? false,
    status: (row?.status ?? "not_connected") as CapiStatus,
    lastTestedAt: row?.last_tested_at ?? null,
    lastTestEventAt: row?.last_test_event_at ?? null,
    lastError: row?.last_error ?? null,
    updatedAt: row?.updated_at ?? null,
    datasetEligible: row?.dataset_eligible ?? false,
    eligibilityReviewedAt: row?.eligibility_reviewed_at ?? null,
  };
}

async function updateConfig(organizationId: string, values: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("meta_capi_configs").update({ ...values, updated_at: new Date().toISOString() }).eq("organization_id", organizationId);
  if (error) throw new AdminError("Conversions API status could not be saved.", 500);
}

async function credentials(organizationId: string) {
  const row = await loadConfig(organizationId);
  if (!row?.dataset_id || !row.encrypted_capi_token) throw new AdminError("Save a Dataset ID and CAPI access token first.");
  const { decryptMetaToken } = await import("@/lib/meta-crypto.server");
  return { row, token: decryptMetaToken(row.encrypted_capi_token, encryptionSecret()) };
}

/** The public callback reads only the approved opener origin. It never consumes state or returns tokens. */
export async function getMetaOAuthOpenerOrigin(stateInput: string) {
  const parsed = z.string().regex(/^[a-f0-9]{64}$/).safeParse(stateInput);
  if (!parsed.success) return null;
  const { data: session, error } = await supabaseAdmin.from("meta_oauth_sessions")
    .select("opener_origin,redirect_uri")
    .eq("state_hash", hashMetaState(parsed.data))
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !session) return null;
  try {
    const origin = session.opener_origin ?? new URL(session.redirect_uri).origin;
    return isAllowedCrmOrigin(origin) ? origin : null;
  } catch {
    return null;
  }
}

export async function runMetaAction(action: MetaAction, caller: Caller, body: unknown, requestOrigin: string | null): Promise<unknown> {
  switch (action) {
    case "overview": {
      const data = z.object({ organizationId: z.string().uuid().nullable() }).parse(body);
      await authorize(caller, action, data.organizationId);
      let connectionsQuery = caller.supabase.from("meta_connections").select("id,organization_id,facebook_name,connection_status,token_expires_at,last_sync_at,granted_permissions");
      let assetsQuery = caller.supabase.from("meta_assets").select("*");
      let logsQuery = caller.supabase.from("meta_sync_logs").select("*").order("created_at", { ascending: false }).limit(50);
      let eventsQuery = caller.supabase.from("meta_conversion_events").select("id,organization_id,lead_id,consent_id,event_name,outcome_reference,status,occurred_at,value,currency,error_code,test_event,sent_dataset_id,provider_received_at,provider_events_received,attempts,next_attempt_at,failure_kind,last_attempt_at,lease_until,retry_requested_at").order("created_at", { ascending: false }).limit(50);
      let attemptsQuery = caller.supabase.from("meta_conversion_delivery_attempts").select("id,event_id,organization_id,attempt_number,status,error_code,failure_kind,dataset_id,test_event,provider_events_received,started_at,finished_at").order("started_at", { ascending: false }).limit(200);
      let rulesQuery = caller.supabase.from("meta_conversion_rules").select("*").order("trigger_type").order("trigger_value");
      if (data.organizationId) {
        connectionsQuery = connectionsQuery.eq("organization_id", data.organizationId);
        assetsQuery = assetsQuery.eq("organization_id", data.organizationId);
        logsQuery = logsQuery.eq("organization_id", data.organizationId);
        eventsQuery = eventsQuery.eq("organization_id", data.organizationId);
        attemptsQuery = attemptsQuery.eq("organization_id", data.organizationId);
        rulesQuery = rulesQuery.eq("organization_id", data.organizationId);
      }
      const [connections, assets, logs, events, attempts, rules] = await Promise.all([connectionsQuery, assetsQuery, logsQuery, eventsQuery, attemptsQuery, rulesQuery]);
      for (const result of [connections, assets, logs, events, attempts, rules]) if (result.error) throw new AdminError("Meta integration records could not be loaded.", 500);
      const settings = data.organizationId ? await caller.supabase.from("meta_integration_settings").select("*").eq("organization_id", data.organizationId).maybeSingle() : null;
      if (settings?.error) throw new AdminError("Meta settings could not be loaded.", 500);
      return {
        connections: connections.data ?? [],
        assets: assets.data ?? [],
        logs: logs.data ?? [],
        events: events.data ?? [],
        deliveryAttempts: attempts.data ?? [],
        settings: settings?.data ?? null,
        conversionRules: rules.data ?? [],
        missingConfiguration: APP_SECRETS.filter((name) => !process.env[name]),
        oauthImplemented: true as const,
        processorImplemented: true as const,
      };
    }
    case "consent-list": {
      const data = orgInput.parse(body);
      await authorize(caller, action, data.organizationId);
      const [leads, records] = await Promise.all([
        caller.supabase.from("leads").select("id,full_name,status,quality").eq("organization_id", data.organizationId).is("deleted_at", null).order("created_at", { ascending: false }).limit(500),
        caller.supabase.from("meta_consent_evidence").select("id,organization_id,lead_id,advertising_accepted,matching_accepted,notice_version,evidence_reference,region,recorded_at,withdrawn_at,consent_source,global_privacy_control,recorded_by").eq("organization_id", data.organizationId).order("recorded_at", { ascending: false }).limit(1000),
      ]);
      if (leads.error || records.error) throw new AdminError("Workspace consent records could not be loaded.", 500);
      return { leads: leads.data ?? [], records: records.data ?? [] };
    }
    case "save-consent": {
      const data = metaConsentSchema.parse(body);
      await authorize(caller, action, data.organizationId);
      const { data: lead, error: leadError } = await caller.supabase.from("leads").select("id").eq("id", data.leadId).eq("organization_id", data.organizationId).is("deleted_at", null).maybeSingle();
      if (leadError || !lead) throw new AdminError("Choose a lead from this workspace.", 404);
      const { data: saved, error } = await supabaseAdmin.rpc("record_meta_consent", {
        _organization_id: data.organizationId,
        _lead_id: data.leadId,
        _advertising_accepted: data.advertisingAccepted,
        _matching_accepted: data.matchingAccepted,
        _notice_version: data.noticeVersion,
        _evidence_reference: data.evidenceReference,
        _region: data.region,
        _consent_source: data.consentSource,
        _global_privacy_control: data.globalPrivacyControl,
        _withdrawn: false,
        _recorded_by: caller.userId,
      });
      if (error || !saved) throw new AdminError("Consent choice could not be recorded.", 500);
      return { saved: true, consent: saved };
    }
    case "withdraw-consent": {
      const data = metaConsentWithdrawalSchema.parse(body);
      await authorize(caller, action, data.organizationId);
      const { data: lead, error: leadError } = await caller.supabase.from("leads").select("id").eq("id", data.leadId).eq("organization_id", data.organizationId).is("deleted_at", null).maybeSingle();
      if (leadError || !lead) throw new AdminError("Choose a lead from this workspace.", 404);
      const { data: saved, error } = await supabaseAdmin.rpc("record_meta_consent", {
        _organization_id: data.organizationId,
        _lead_id: data.leadId,
        _advertising_accepted: false,
        _matching_accepted: false,
        _notice_version: data.noticeVersion,
        _evidence_reference: data.evidenceReference,
        _region: data.region,
        _consent_source: data.consentSource,
        _global_privacy_control: data.globalPrivacyControl,
        _withdrawn: true,
        _recorded_by: caller.userId,
      });
      if (error || !saved) throw new AdminError("Consent withdrawal could not be recorded.", 500);
      return { saved: true, consent: saved };
    }
    case "save-settings": {
      const data = metaSettingsSchema.parse(body);
      await authorize(caller, action, data.organizationId);
      const { data: status, error: statusError } = await caller.supabase.from("lead_statuses").select("id").eq("organization_id", data.organizationId).eq("name", data.defaultStatus).limit(1);
      if (statusError || !status?.length) throw new AdminError("Choose a lead status from this workspace.");
      if (data.executiveIds.length) {
        const { data: members, error } = await caller.supabase.from("organization_members").select("user_id").eq("organization_id", data.organizationId).eq("is_active", true).in("user_id", data.executiveIds);
        const { data: roles, error: rolesError } = await caller.supabase.from("user_roles").select("user_id").eq("organization_id", data.organizationId).eq("role", "sales_exec").in("user_id", data.executiveIds);
        if (error || rolesError || data.executiveIds.some((id) => !members?.some((member) => member.user_id === id) || !roles?.some((role) => role.user_id === id))) throw new AdminError("Choose active sales executives from this workspace.");
      }
      if (data.autoSyncEnabled) {
        const { data: forms, error: formError } = await caller.supabase.from("meta_assets").select("id").eq("organization_id", data.organizationId).eq("asset_type", "form").eq("selected", true).limit(1);
        if (formError || !forms?.length || !process.env["META_WEBHOOK_VERIFY_TOKEN"]) throw new AdminError("Select a subscribed Page and lead form and configure the Meta webhook first.");
      }
      const { error } = await caller.supabase.from("meta_integration_settings").upsert({ organization_id: data.organizationId, auto_sync_enabled: data.autoSyncEnabled, default_status: data.defaultStatus, default_quality: data.defaultQuality, assignment_mode: data.assignmentMode, executive_ids: data.executiveIds, duplicate_handling: data.duplicateHandling, notifications_enabled: data.notificationsEnabled, updated_at: new Date().toISOString() });
      if (error) throw new AdminError("Meta settings could not be saved.", 500);
      return { saved: true };
    }
    case "save-conversion-rule": {
      const data = metaConversionRuleSchema.parse(body);
      await authorize(caller, action, data.organizationId);
      if (data.triggerType === "status") {
        const { data: statuses, error } = await caller.supabase.from("lead_statuses").select("id").eq("organization_id", data.organizationId).eq("name", data.triggerValue).limit(1);
        if (error || !statuses?.length) throw new AdminError("Choose a lead status from this workspace.");
      }
      if (!data.eventName) {
        const { error } = await caller.supabase.from("meta_conversion_rules").delete().eq("organization_id", data.organizationId).eq("trigger_type", data.triggerType).eq("trigger_value", data.triggerValue);
        if (error) throw new AdminError("Conversion rule could not be removed.", 500);
        return { saved: true, rule: null };
      }
      const { error } = await caller.supabase.from("meta_conversion_rules").upsert({
        organization_id: data.organizationId,
        trigger_type: data.triggerType,
        trigger_value: data.triggerValue,
        event_name: data.eventName,
        enabled: data.enabled,
        currency: data.eventName === "Purchase" ? data.currency ?? null : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,trigger_type,trigger_value" });
      if (error) throw new AdminError("Conversion rule could not be saved.", 500);
      return { saved: true };
    }
    case "start-oauth": {
      const data = z.object({ organizationId: z.string().uuid(), origin: z.string().url().max(500) }).parse(body);
      await authorize(caller, action, data.organizationId);
      if (!isAllowedCrmOrigin(data.origin) || (requestOrigin && requestOrigin !== data.origin)) throw new AdminError("Open the CRM from an approved address before connecting Facebook.", 403);
      const { metaConfig } = await import("@/lib/meta-api.server");
      const config = metaConfig();
      const { newMetaState } = await import("@/lib/meta-crypto.server");
      const state = newMetaState();
      const { error } = await supabaseAdmin.from("meta_oauth_sessions").insert({
        organization_id: data.organizationId,
        user_id: caller.userId,
        state_hash: hashMetaState(state),
        redirect_uri: config.redirectUri,
        opener_origin: data.origin,
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      });
      if (error) throw new AdminError("Facebook authorization could not be started.", 500);
      const url = new URL(`https://www.facebook.com/${config.version}/dialog/oauth`);
      url.search = new URLSearchParams({ client_id: config.appId, redirect_uri: config.redirectUri, state, config_id: config.loginConfigId, response_type: "code", override_default_response_type: "true" }).toString();
      return { authorizationUrl: url.toString(), state, callbackOrigin: new URL(config.redirectUri).origin };
    }
    case "complete-oauth": {
      const data = z.object({ organizationId: z.string().uuid(), state: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().min(1).max(4096) }).parse(body);
      await authorize(caller, action, data.organizationId);
      const { metaConfig, metaRequest, metaList } = await import("@/lib/meta-api.server");
      const config = metaConfig();
      const { encryptMetaToken } = await import("@/lib/meta-crypto.server");
      const { data: session, error: stateError } = await supabaseAdmin.from("meta_oauth_sessions").update({ consumed_at: new Date().toISOString() }).eq("state_hash", hashMetaState(data.state)).eq("user_id", caller.userId).eq("organization_id", data.organizationId).eq("redirect_uri", config.redirectUri).is("consumed_at", null).gt("expires_at", new Date().toISOString()).select("id").maybeSingle();
      if (stateError || !session) throw new AdminError("Facebook authorization expired or was already used. Connect again.");
      const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().optional() });
      const initial = tokenSchema.parse(await metaRequest("oauth/access_token", null, { client_id: config.appId, client_secret: config.appSecret, redirect_uri: config.redirectUri, code: data.code }, "POST"));
      const token = tokenSchema.parse(await metaRequest("oauth/access_token", null, { grant_type: "fb_exchange_token", client_id: config.appId, client_secret: config.appSecret, fb_exchange_token: initial.access_token }, "POST"));
      const identity = z.object({ id: z.string().regex(/^\d+$/), name: z.string() }).parse(await metaRequest("me", token.access_token, { fields: "id,name" }));
      const granted = (await metaList("me/permissions", token.access_token, "permission,status")).filter((item) => item["status"] === "granted" && typeof item["permission"] === "string").map((item) => String(item["permission"]));
      const { data: connection, error } = await supabaseAdmin.from("meta_connections").upsert({ organization_id: data.organizationId, meta_user_id: identity.id, facebook_name: identity.name, encrypted_access_token: encryptMetaToken(token.access_token, config.encryptionSecret), token_expires_at: token.expires_in ? new Date(Date.now() + token.expires_in * 1000).toISOString() : null, connection_status: "connected", granted_permissions: granted, connected_by: caller.userId, connected_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: "organization_id,meta_user_id" }).select("id").single();
      if (error || !connection) throw new AdminError("Facebook authorization succeeded but the connection could not be saved. Connect again.", 500);
      const { error: auditError } = await caller.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: caller.userId, action: "meta_connected", entity_type: "meta_connection", entity_id: connection.id });
      if (auditError) throw new AdminError("Facebook is connected, but its audit entry could not be saved.", 500);
      return { connected: true, connectionId: connection.id, missingPermissions: missingMetaPermissions(granted) };
    }
    case "refresh-assets": {
      const data = z.object({ organizationId: z.string().uuid(), connectionId: z.string().uuid() }).parse(body);
      await authorize(caller, action, data.organizationId);
      const { refreshMetaAssets } = await import("@/lib/meta-assets.server");
      try {
        return await refreshMetaAssets(data.organizationId, data.connectionId);
      } catch (error) {
        if (error instanceof AdminError) throw error;
        const { MetaApiError } = await import("@/lib/meta-api.server");
        if (error instanceof MetaApiError) throw error;
        throw new AdminError(safeError(error));
      }
    }
    case "select-asset": {
      const data = z.object({ organizationId: z.string().uuid(), assetId: z.string().uuid(), selected: z.boolean() }).parse(body);
      await authorize(caller, action, data.organizationId);
      const { selectMetaAsset } = await import("@/lib/meta-assets.server");
      try {
        return await selectMetaAsset(data.organizationId, data.assetId, data.selected);
      } catch (error) {
        const { MetaApiError } = await import("@/lib/meta-api.server");
        if (error instanceof MetaApiError) throw error;
        throw new AdminError(safeError(error));
      }
    }
    case "disconnect-connection": {
      const data = z.object({ organizationId: z.string().uuid(), connectionId: z.string().uuid() }).parse(body);
      await authorize(caller, action, data.organizationId);
      const { data: connection, error } = await supabaseAdmin.from("meta_connections").update({ connection_status: "disconnected", encrypted_access_token: null, updated_at: new Date().toISOString() }).eq("id", data.connectionId).eq("organization_id", data.organizationId).select("id").single();
      if (error || !connection) throw new AdminError("Facebook connection could not be disconnected.");
      const { data: assets, error: assetError } = await supabaseAdmin.from("meta_assets").update({ selected: false, webhook_subscribed: false }).eq("connection_id", connection.id).eq("organization_id", data.organizationId).select("id");
      if (assetError) throw new AdminError("Facebook is disconnected but its assets could not be paused.", 500);
      if (assets?.length) {
        const { error: credentialsError } = await supabaseAdmin.from("meta_asset_credentials").delete().eq("organization_id", data.organizationId).in("asset_id", assets.map((item) => item.id));
        if (credentialsError) throw new AdminError("Facebook is disconnected but Page credentials could not be cleared.", 500);
      }
      const { error: auditError } = await caller.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: caller.userId, action: "meta_disconnected", entity_type: "meta_connection", entity_id: connection.id });
      if (auditError) throw new AdminError("Facebook is disconnected but its audit entry could not be saved.", 500);
      return { disconnected: true };
    }
    case "check-connection": {
      const data = z.object({ organizationId: z.string().uuid(), connectionId: z.string().uuid() }).parse(body);
      await authorize(caller, action, data.organizationId);
      const { data: connection, error } = await supabaseAdmin.from("meta_connections").select("id,encrypted_access_token").eq("id", data.connectionId).eq("organization_id", data.organizationId).maybeSingle();
      if (error || !connection) throw new AdminError("Facebook connection was not found in this workspace.", 404);
      if (!connection.encrypted_access_token) throw new AdminError("This Facebook account is disconnected. Connect it again.");
      const { metaConfig, metaList, metaRequest } = await import("@/lib/meta-api.server");
      const config = metaConfig();
      const { decryptMetaToken } = await import("@/lib/meta-crypto.server");
      const userToken = decryptMetaToken(connection.encrypted_access_token, config.encryptionSecret);
      const now = new Date().toISOString();
      let result: ReturnType<typeof assessMetaAccess> & { expiresAt: string | null; scopes: string[] };
      try {
        const debug = z.object({ data: z.object({ is_valid: z.boolean(), app_id: z.string().optional(), expires_at: z.number().optional(), data_access_expires_at: z.number().optional(), scopes: z.array(z.string()).optional(), error: z.object({ message: z.string().optional() }).optional() }) }).parse(await metaRequest("debug_token", null, { input_token: userToken, access_token: `${config.appId}|${config.appSecret}` })).data;
        const expiresAt = debug.expires_at ? new Date(debug.expires_at * 1000).toISOString() : null;
        const wrongApp = debug.app_id !== undefined && debug.app_id !== config.appId;
        const expired = Boolean(debug.expires_at && debug.expires_at * 1000 <= Date.now());
        const tokenCanRead = debug.is_valid && !wrongApp && !expired;
        const grantedPermissions = tokenCanRead
          ? (await metaList("me/permissions", userToken, "permission,status")).filter((item) => item["status"] === "granted" && typeof item["permission"] === "string").map((item) => String(item["permission"]))
          : debug.scopes ?? [];
        const assessed = assessMetaAccess({ tokenValid: debug.is_valid, expired, wrongApp, grantedPermissions });
        result = { ...assessed, message: !assessed.tokenValid && !wrongApp && !expired && debug.error?.message ? `${assessed.message} ${debug.error.message}` : assessed.message, expiresAt, scopes: grantedPermissions };
      } catch (checkError) {
        const { MetaApiError } = await import("@/lib/meta-api.server");
        if (!(checkError instanceof MetaApiError)) throw new AdminError(safeError(checkError));
        await supabaseAdmin.from("meta_sync_logs").insert({ organization_id: data.organizationId, connection_id: connection.id, sync_type: "health_check", status: "failed", records_processed: 0, error_message: safeError(checkError) });
        throw checkError;
      }
      const update = { connection_status: result.status, token_expires_at: result.expiresAt, granted_permissions: result.scopes, updated_at: now };
      const { error: updateError } = await supabaseAdmin.from("meta_connections").update(update).eq("id", connection.id).eq("organization_id", data.organizationId);
      if (updateError) throw new AdminError("Facebook access was checked but its status could not be saved.", 500);
      await supabaseAdmin.from("meta_sync_logs").insert({ organization_id: data.organizationId, connection_id: connection.id, sync_type: "health_check", status: result.healthy ? "succeeded" : "failed", records_processed: 0, error_message: result.healthy ? null : result.message });
      await caller.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: caller.userId, action: "meta_connection_checked", entity_type: "meta_connection", entity_id: connection.id });
      return result;
    }
    case "log-oauth-error": {
      const data = z.object({ organizationId: z.string().uuid(), message: z.string().min(1).max(500) }).parse(body);
      await authorize(caller, action, data.organizationId);
      const { error } = await supabaseAdmin.from("meta_sync_logs").insert({ organization_id: data.organizationId, sync_type: "oauth", status: "failed", records_processed: 0, error_message: data.message });
      if (error) throw new AdminError("Facebook sign-in error could not be logged.", 500);
      return { logged: true };
    }
    case "capi-config": {
      const data = orgInput.parse(body);
      await authorize(caller, action, data.organizationId);
      return publicView(await loadConfig(data.organizationId));
    }
    case "save-capi": {
      const data = capiConfigSchema.parse(body);
      await authorize(caller, action, data.organizationId);
      const existing = await loadConfig(data.organizationId);
      let encrypted = existing?.encrypted_capi_token ?? null;
      if (data.accessToken) {
        const { encryptMetaToken } = await import("@/lib/meta-crypto.server");
        encrypted = encryptMetaToken(data.accessToken, encryptionSecret());
      }
      const changed = !existing || existing.dataset_id !== data.datasetId || Boolean(data.accessToken);
      const status: CapiStatus = changed ? capiStatusAfterSave(true, Boolean(encrypted)) : existing.status as CapiStatus;
      const { error } = await supabaseAdmin.from("meta_capi_configs").upsert({ organization_id: data.organizationId, dataset_id: data.datasetId, encrypted_capi_token: encrypted, test_event_code: data.testEventCode || null, status, capi_enabled: changed ? false : existing.capi_enabled, last_error: changed ? null : existing.last_error, ...(changed ? { dataset_eligible: false, eligibility_reviewed_by: null, eligibility_reviewed_at: null, last_test_event_at: null, last_tested_at: null } : {}), updated_by: caller.userId, updated_at: new Date().toISOString() });
      if (error) throw new AdminError("Conversions API settings could not be saved.", 500);
      await caller.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: caller.userId, action: "meta_capi_saved", entity_type: "meta_capi_config", entity_id: data.organizationId });
      return publicView(await loadConfig(data.organizationId));
    }
    case "test-capi": {
      const data = orgInput.parse(body);
      await authorize(caller, action, data.organizationId);
      const { row, token } = await credentials(data.organizationId);
      const { metaRequest } = await import("@/lib/meta-api.server");
      try {
        if (!row.dataset_id) throw new AdminError("Dataset ID is required.");
        const result = z.object({ id: z.literal(row.dataset_id), name: z.string().optional() }).parse(await metaRequest(row.dataset_id, token, { fields: "id,name" }));
        const keep = row.status === "test_successful" || row.status === "production_active";
        await updateConfig(data.organizationId, { status: keep ? row.status : "connected", last_tested_at: new Date().toISOString(), last_error: null });
        return { ok: true, datasetName: result.name ?? result.id };
      } catch (error) {
        await updateConfig(data.organizationId, { status: "connection_error", capi_enabled: false, last_tested_at: new Date().toISOString(), last_error: safeError(error) });
        throw new AdminError(safeError(error));
      }
    }
    case "send-capi-test": {
      const data = orgInput.parse(body);
      await authorize(caller, action, data.organizationId);
      const { row, token } = await credentials(data.organizationId);
      if (!row.test_event_code) throw new AdminError("Add the Test Event Code from Meta Events Manager first.");
      const { metaRequest } = await import("@/lib/meta-api.server");
      const { createHash } = await import("node:crypto");
      const event = { event_name: "BediflyTestEvent", event_time: Math.floor(Date.now() / 1000), action_source: "system_generated", event_id: `test-${crypto.randomUUID()}`, user_data: { external_id: [createHash("sha256").update(`bedifly-test-${data.organizationId}`).digest("hex")] } };
      try {
        const result = z.object({ events_received: z.literal(1) }).parse(await metaRequest(`${row.dataset_id}/events`, token, { data: JSON.stringify([event]), partner_agent: "lovable", test_event_code: row.test_event_code }, "POST"));
        await updateConfig(data.organizationId, { status: row.status === "production_active" ? "production_active" : "test_successful", last_test_event_at: new Date().toISOString(), last_error: null });
        return { eventsReceived: result.events_received };
      } catch (error) {
        await updateConfig(data.organizationId, { status: "connection_error", capi_enabled: false, last_error: safeError(error) });
        throw new AdminError(safeError(error));
      }
    }
    case "set-capi-enabled": {
      const data = orgInput.extend({ enabled: z.boolean() }).parse(body);
      await authorize(caller, action, data.organizationId);
      const row = await loadConfig(data.organizationId);
      if (!row) throw new AdminError("Save the Conversions API configuration first.");
      if (data.enabled && (!row.dataset_eligible || !row.eligibility_reviewed_at || !row.last_test_event_at)) throw new AdminError("Review Dataset eligibility and send a successful test event before enabling production.");
      if (data.enabled && !canEnableCapi(row.status as CapiStatus, Boolean(row.dataset_id), Boolean(row.encrypted_capi_token))) throw new AdminError("Send a successful test event before enabling the Conversions API.");
      await updateConfig(data.organizationId, { capi_enabled: data.enabled, status: data.enabled ? "production_active" : row.status === "production_active" ? "test_successful" : row.status });
      await caller.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: caller.userId, action: data.enabled ? "meta_capi_enabled" : "meta_capi_disabled", entity_type: "meta_capi_config", entity_id: data.organizationId });
      return publicView(await loadConfig(data.organizationId));
    }
    case "disconnect-capi": {
      const data = orgInput.parse(body);
      await authorize(caller, action, data.organizationId);
      const { error } = await supabaseAdmin.from("meta_capi_configs").delete().eq("organization_id", data.organizationId);
      if (error) throw new AdminError("Conversions API could not be disconnected.", 500);
      await caller.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: caller.userId, action: "meta_capi_disconnected", entity_type: "meta_capi_config", entity_id: data.organizationId });
      return { disconnected: true };
    }
    case "app-status": {
      await authorize(caller, action, null);
      const appId = process.env["META_APP_ID"] ?? "";
      const redirectUri = process.env["META_REDIRECT_URI"] ?? null;
      const base = "https://lead-lantern-workspaces.lovable.app";
      const settings = APP_SECRETS.map((name) => ({ name, configured: Boolean(process.env[name]?.trim()) }));
      return { settings, missing: settings.filter((setting) => !setting.configured).map((setting) => setting.name), checkedAt: new Date().toISOString(), appIdHint: appId ? `••••${appId.slice(-4)}` : null, graphVersion: process.env["META_GRAPH_API_VERSION"] ?? null, redirectUri, expectedRedirectUri: `${base}/api/public/meta/callback`, redirectMatches: redirectUri === `${base}/api/public/meta/callback`, webhookUrl: `${base}/api/public/meta/webhook`, webhookPath: "/api/public/meta/webhook" };
    }
    case "review-dataset-eligibility": {
      const data = orgInput.extend({ eligible: z.boolean() }).parse(body);
      await authorize(caller, action, data.organizationId);
      if (!await loadConfig(data.organizationId)) throw new AdminError("Save Dataset configuration first.");
      await updateConfig(data.organizationId, { dataset_eligible: data.eligible, eligibility_reviewed_by: caller.userId, eligibility_reviewed_at: new Date().toISOString(), ...(!data.eligible ? { capi_enabled: false, status: "configuration_required" } : {}) });
      await caller.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: caller.userId, action: "meta_dataset_eligibility_reviewed", entity_type: "meta_capi_config", entity_id: data.organizationId });
      return publicView(await loadConfig(data.organizationId));
    }
    case "retry-conversion": {
      const data = orgInput.extend({ eventId: z.string().uuid() }).parse(body);
      await authorize(caller, action, data.organizationId);
      const { data: queued, error } = await supabaseAdmin.rpc("request_meta_conversion_retry", { _organization_id: data.organizationId, _event_id: data.eventId });
      if (error) throw new AdminError("The conversion retry could not be queued.", 500);
      if (!queued) throw new AdminError("Only a failed production event without a Meta receipt can be retried.");
      await caller.supabase.from("audit_logs").insert({ organization_id: data.organizationId, user_id: caller.userId, action: "meta_conversion_retry_requested", entity_type: "meta_conversion_event", entity_id: data.eventId });
      return { status: "retry_queued", eventId: queued.id, nextAttemptAt: queued.next_attempt_at };
    }
    case "send-conversion": {
      const data = orgInput.extend({ eventId: z.string().uuid() }).parse(body);
      await authorize(caller, action, data.organizationId);
      const { dispatchCapiEvent } = await import("@/lib/meta-capi-sender.server");
      const { capiDispatchStore } = await import("@/lib/meta-capi-store.server");
      return dispatchCapiEvent(capiDispatchStore, data.organizationId, data.eventId);
    }
    case "send-conversion-test": {
      const data = orgInput.extend({ eventId: z.string().uuid() }).parse(body);
      await authorize(caller, action, data.organizationId);
      const row = await loadConfig(data.organizationId);
      if (!row?.test_event_code?.trim()) throw new AdminError("Add a Test Event Code from Meta Events Manager first.");
      const { dispatchCapiEvent } = await import("@/lib/meta-capi-sender.server");
      const { capiDispatchStore } = await import("@/lib/meta-capi-store.server");
      return dispatchCapiEvent(capiDispatchStore, data.organizationId, data.eventId, undefined, row.test_event_code);
    }
    case "test-app": {
      await authorize(caller, action, null);
      const appId = process.env["META_APP_ID"];
      const secret = process.env["META_APP_SECRET"];
      if (!appId || !secret) throw new AdminError("META_APP_ID and META_APP_SECRET must be set in backend secrets.", 500);
      if (!/^\d+$/.test(appId)) throw new AdminError("META_APP_ID must be numeric.");
      const { metaRequest } = await import("@/lib/meta-api.server");
      try {
        const result = z.object({ id: z.string(), name: z.string().optional() }).parse(await metaRequest(appId, `${appId}|${secret}`, { fields: "id,name" }));
        return { ok: true, appName: result.name ?? result.id };
      } catch (error) {
        throw new AdminError(safeError(error));
      }
    }
    case "client-statuses": {
      await authorize(caller, action, null);
      const [orgs, configs, connections, events] = await Promise.all([
        supabaseAdmin.from("organizations").select("id,name,status").is("deleted_at", null).order("name"),
        supabaseAdmin.from("meta_capi_configs").select("organization_id,dataset_id,status,capi_enabled,last_tested_at,last_test_event_at,last_error"),
        supabaseAdmin.from("meta_connections").select("organization_id,connection_status,facebook_name"),
        supabaseAdmin.from("meta_conversion_events").select("organization_id,status").eq("test_event", false).gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString()).limit(10000),
      ]);
      if (orgs.error || configs.error || connections.error || events.error) throw new AdminError("Client integration statuses could not be loaded.", 500);
      return (orgs.data ?? []).filter((org) => org.name).map((org) => {
        const config = configs.data?.find((item) => item.organization_id === org.id);
        const conn = connections.data?.filter((item) => item.organization_id === org.id) ?? [];
        const own = events.data?.filter((item) => item.organization_id === org.id) ?? [];
        const count = (status: string) => own.filter((item) => item.status === status).length;
        return { organizationId: org.id, name: org.name, workspaceStatus: org.status, facebook: conn.some((connection) => connection.connection_status === "connected") ? "connected" : conn.length ? conn[0]!.connection_status : "not_connected", facebookName: conn.find((connection) => connection.connection_status === "connected")?.facebook_name ?? null, capiStatus: (config?.status ?? "not_connected") as CapiStatus, capiEnabled: config?.capi_enabled ?? false, datasetId: config?.dataset_id ?? null, lastTestEventAt: config?.last_test_event_at ?? null, lastError: config?.last_error ?? null, events: { sent: count("sent"), failed: count("failed"), pending: count("pending") + count("processing"), blocked: count("blocked") } };
      });
    }
  }
  throw new AdminError("Unknown Meta action.", 404);
}
