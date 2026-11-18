import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptMetaToken } from "@/lib/meta-crypto.server";
import { metaRequest } from "@/lib/meta-api.server";
import { CapiDispatchError, type CapiDispatchStore } from "@/lib/meta-capi-sender.server";

export const capiDispatchStore: CapiDispatchStore = {
  async reserve(organizationId, eventId) {
    const { data, error } = await supabaseAdmin.rpc("reserve_meta_conversion_send", { _organization_id: organizationId, _event_id: eventId });
    if (error) throw new CapiDispatchError("event_unavailable");
    return data?.id ? data : null;
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
  async preflight(event, credentials) {
    const { data: checked, error } = await supabaseAdmin.rpc("recheck_meta_conversion_consent", { _event_id: event.id });
    if (error || checked?.organization_id !== event.organization_id || checked.status !== "processing" || checked.provider_received_at) return false;
    if (!checked.consent_id) return false;
    const { data: original, error: consentError } = await supabaseAdmin.from("meta_consent_evidence").select("recorded_at").eq("id", checked.consent_id).eq("organization_id", event.organization_id).eq("lead_id", event.lead_id).single();
    if (consentError || !original || Date.parse(original.recorded_at) > Date.parse(event.occurred_at)) return false;
    const { data: config, error: configError } = await supabaseAdmin.from("meta_capi_configs").select("*").eq("organization_id", event.organization_id).single();
    const key = process.env["META_TOKEN_ENCRYPTION_KEY"];
    if (configError || !config || !key || !config.encrypted_capi_token) return false;
    if (!(config.capi_enabled && config.status === "production_active" && config.dataset_eligible && Boolean(config.eligibility_reviewed_at && config.last_test_event_at) && config.dataset_id === credentials.datasetId && decryptMetaToken(config.encrypted_capi_token, key) === credentials.token)) return false;
    const { data: latest, error: latestError } = await supabaseAdmin.rpc("recheck_meta_conversion_consent", { _event_id: event.id });
    return !latestError && latest?.organization_id === event.organization_id && latest.status === "processing" && !latest.provider_received_at;
  },
  async finish(event, status, code, received) {
    const { error } = await supabaseAdmin.from("meta_conversion_events").update({ status, error_code: code, next_attempt_at: null, ...(received === 1 ? { provider_received_at: new Date().toISOString(), provider_events_received: received } : {}) }).eq("id", event.id).eq("organization_id", event.organization_id).is("provider_received_at", null);
    if (error) throw new CapiDispatchError("receipt_persistence_failed");
  },
};