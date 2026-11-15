import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptMetaToken } from "@/lib/meta-crypto.server";
import { metaConfig, metaRequest, MetaApiError } from "@/lib/meta-api.server";
import { mapMetaLead, metaLeadSchema, metaRetryDelay } from "@/lib/meta-rules";

export async function processMetaLeadJobs() {
  metaConfig();
  const { data: jobs, error } = await supabaseAdmin.rpc("claim_meta_lead_jobs", { _limit: 3 });
  if (error) throw new Error("Meta jobs could not be claimed.");
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs ?? []) {
    let organizationId: string | null = null;
    let connectionId: string | null = null;
    try {
      const { data: forms, error: formError } = await supabaseAdmin.from("meta_assets").select("*").eq("asset_type", "form").eq("external_id", job.form_id).eq("parent_external_id", job.page_id).eq("selected", true);
      if (formError) throw new Error("Form routing is temporarily unavailable.");
      const form = forms?.length === 1 ? forms[0] : undefined;
      if (!form) {
        const { error: ignoreError } = await supabaseAdmin.from("meta_webhook_events").update({ processing_status: "ignored", error_code: "form_not_selected", lease_until: null, processed_at: new Date().toISOString() }).eq("id", job.id).eq("attempts", job.attempts);
        if (ignoreError) throw new Error("Unselected lead state could not be saved.");
        continue;
      }
      organizationId = form.organization_id;
      connectionId = form.connection_id;
      const [{ data: page, error: pageError }, { data: settings, error: settingsError }, { data: org, error: orgError }, { data: connection, error: connectionError }] = await Promise.all([
        supabaseAdmin.from("meta_assets").select("id,selected,webhook_subscribed").eq("organization_id", organizationId).eq("asset_type", "page").eq("external_id", job.page_id).single(),
        supabaseAdmin.from("meta_integration_settings").select("auto_sync_enabled").eq("organization_id", organizationId).maybeSingle(),
        supabaseAdmin.from("organizations").select("status,deleted_at").eq("id", organizationId).single(),
        supabaseAdmin.from("meta_connections").select("connection_status,token_expires_at").eq("id", connectionId).eq("organization_id", organizationId).single(),
      ]);
      if (pageError || settingsError || orgError || connectionError) throw new Error("Client synchronization settings could not be checked.");
      if (!settings?.auto_sync_enabled || !page?.selected || !page.webhook_subscribed || org?.status !== "active" || org.deleted_at || connection?.connection_status !== "connected") {
        const { error: pauseError } = await supabaseAdmin.from("meta_webhook_events").update({ organization_id: organizationId, processing_status: "ignored", error_code: "sync_paused", lease_until: null, processed_at: new Date().toISOString() }).eq("id", job.id).eq("attempts", job.attempts);
        if (pauseError) throw new Error("Paused lead state could not be saved.");
        continue;
      }
      if (connection.token_expires_at && Date.parse(connection.token_expires_at) <= Date.now()) throw new MetaApiError(401, 190, "Facebook access expired. Reconnect this account.");
      const { data: credential, error: credentialError } = await supabaseAdmin.from("meta_asset_credentials").select("encrypted_access_token").eq("asset_id", page.id).eq("organization_id", organizationId).single();
      if (credentialError || !credential) throw new Error("Page access credential is unavailable. Refresh Facebook assets.");
      const token = decryptMetaToken(credential.encrypted_access_token, metaConfig().encryptionSecret);
      const lead = metaLeadSchema.parse(await metaRequest(job.leadgen_id, token, { fields: "id,created_time,field_data,ad_id,form_id" }));
      if (lead.id !== job.leadgen_id || (lead.form_id && lead.form_id !== job.form_id)) throw new Error("Meta lead did not match its selected form.");
      const { error: ingestError } = await supabaseAdmin.rpc("ingest_meta_lead", { _job_id: job.id, _attempt: job.attempts, _organization_id: organizationId, _lead: mapMetaLead(lead), _fields: lead.field_data });
      if (ingestError) throw new Error("Meta lead could not be stored safely.");
      succeeded++;
    } catch (error) {
      failed++;
      const rateLimited = error instanceof MetaApiError && [4, 17, 32, 613].includes(error.code ?? 0);
      const permanent = error instanceof MetaApiError && (error.code === 190 || (!rateLimited && error.status >= 400 && error.status < 500));
      const { error: failureError } = await supabaseAdmin.from("meta_webhook_events").update({ organization_id: organizationId, processing_status: "failed", lease_until: null, attempts: permanent ? 8 : job.attempts, error_code: error instanceof MetaApiError ? String(error.code ?? error.status) : "processing_failed", next_attempt_at: new Date(Date.now() + metaRetryDelay(job.attempts, rateLimited)).toISOString() }).eq("id", job.id).eq("attempts", job.attempts).eq("processing_status", "processing");
      if (failureError) throw new Error("Meta retry state could not be saved.");
      if (organizationId) await supabaseAdmin.from("meta_sync_logs").insert({ organization_id: organizationId, connection_id: connectionId, sync_type: "lead_import", status: "failed", error_message: error instanceof Error ? error.message.slice(0, 2000) : "Lead processing failed." });
      if (error instanceof MetaApiError && error.code === 190 && organizationId && connectionId) await supabaseAdmin.from("meta_connections").update({ connection_status: "expired" }).eq("organization_id", organizationId).eq("id", connectionId);
    }
  }
  return { succeeded, failed, claimed: jobs?.length ?? 0 };
}