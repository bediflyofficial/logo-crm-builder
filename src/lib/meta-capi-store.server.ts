import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptMetaToken } from "@/lib/meta-crypto.server";
import { metaRequest } from "@/lib/meta-api.server";
import { CapiDispatchError, type CapiDispatchStore } from "@/lib/meta-capi-sender.server";

export const capiDispatchStore: CapiDispatchStore = {
  async reserve(organizationId, eventId, testEvent) {
    const args = { _organization_id: organizationId, _event_id: eventId };
    const { data, error } = testEvent
      ? await supabaseAdmin.rpc("reserve_meta_conversion_test", args)
      : await supabaseAdmin.rpc("reserve_meta_conversion_send", args);
    if (error) throw new CapiDispatchError("event_unavailable");
    return data?.id ? data : null;
  },
  async claim(limit) {
    const { data, error } = await supabaseAdmin.rpc("claim_meta_conversion_events", { _limit: limit });
    if (error) throw new CapiDispatchError("event_unavailable");
    return data ?? [];
  },
  async credentials(event) {
    const { data, error } = await supabaseAdmin.from("meta_capi_configs").select("*").eq("organization_id", event.organization_id).single();
    const key = process.env["META_TOKEN_ENCRYPTION_KEY"];
    if (error || !data?.encrypted_capi_token || !data.dataset_id || !key) throw new CapiDispatchError("credentials_missing");
    const token = decryptMetaToken(data.encrypted_capi_token, key);
    // Accessible metadata is necessary, but not a substitute for the administrator's eligibility review.
    const dataset = await metaRequest(data.dataset_id, token, { fields: "id" });
    if (!dataset || typeof dataset !== "object" || !("id" in dataset) || dataset.id !== data.dataset_id) throw new CapiDispatchError("dataset_access_invalid");
    return { datasetId: data.dataset_id, token };
  },
  async matching(event) {
    const { data, error } = await supabaseAdmin.from("leads").select("email,phone").eq("id", event.lead_id).eq("organization_id", event.organization_id).is("deleted_at", null).single();
    if (error || !data) throw new CapiDispatchError("lead_unavailable");
    return data;
  },
  async preflight(event, credentials, testEvent) {
    const { data: checked, error } = await supabaseAdmin.rpc("recheck_meta_conversion_consent", { _event_id: event.id });
    if (error || checked?.organization_id !== event.organization_id || checked.status !== "processing" || checked.provider_received_at || checked.test_event !== testEvent) return false;
    if (!checked.consent_id) return false;
    const [originalResult, configResult, organizationResult] = await Promise.all([
      supabaseAdmin.from("meta_consent_evidence").select("recorded_at").eq("id", checked.consent_id).eq("organization_id", event.organization_id).eq("lead_id", event.lead_id).single(),
      supabaseAdmin.from("meta_capi_configs").select("*").eq("organization_id", event.organization_id).single(),
      supabaseAdmin.from("organizations").select("id").eq("id", event.organization_id).eq("status", "active").is("deleted_at", null).maybeSingle(),
    ]);
    const original = originalResult.data;
    const config = configResult.data;
    const key = process.env["META_TOKEN_ENCRYPTION_KEY"];
    if (originalResult.error || !original || Date.parse(original.recorded_at) > Date.parse(event.occurred_at)) return false;
    if (configResult.error || !config || !key || !config.encrypted_capi_token || organizationResult.error || !organizationResult.data) return false;
    const modeAllowed = testEvent
      ? ["test_successful", "production_active"].includes(config.status) && Boolean(config.test_event_code?.trim())
      : config.capi_enabled && config.status === "production_active";
    if (!(modeAllowed && config.dataset_eligible && Boolean(config.eligibility_reviewed_at && config.last_test_event_at) && config.dataset_id === credentials.datasetId && decryptMetaToken(config.encrypted_capi_token, key) === credentials.token)) return false;
    const { data: latest, error: latestError } = await supabaseAdmin.rpc("recheck_meta_conversion_consent", { _event_id: event.id });
    return !latestError && latest?.organization_id === event.organization_id && latest.status === "processing" && !latest.provider_received_at && latest.test_event === testEvent;
  },
  async finish(event, status, code, received, failure) {
    if (!event.lease_token) throw new CapiDispatchError("receipt_persistence_failed");
    const { data, error } = await supabaseAdmin.rpc("complete_meta_conversion_delivery", {
      _event_id: event.id,
      _organization_id: event.organization_id,
      _lease_token: event.lease_token,
      _status: status,
      _error_code: code as string,
      _failure_kind: (failure?.kind ?? null) as string,
      _retry_delay_seconds: failure?.retryDelaySeconds as number,
      _events_received: received ?? 0,
    });
    if (error || data !== true) throw new CapiDispatchError("receipt_persistence_failed");
  },
};
