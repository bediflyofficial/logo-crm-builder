import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptMetaToken, encryptMetaToken } from "@/lib/meta-crypto.server";
import { metaConfig, metaList, metaRequest, MetaApiError } from "@/lib/meta-api.server";

const assetSchema = z.object({ id: z.string().regex(/^\d+$/), name: z.string().optional() }).passthrough();

export async function loadMetaConnection(organizationId: string, connectionId: string) {
  const { data, error } = await supabaseAdmin.from("meta_connections").select("*").eq("id", connectionId).eq("organization_id", organizationId).single();
  if (error || !data || data.connection_status !== "connected" || !data.encrypted_access_token) throw new Error("Reconnect this Facebook account before continuing.");
  if (data.token_expires_at && Date.parse(data.token_expires_at) <= Date.now()) {
    await supabaseAdmin.from("meta_connections").update({ connection_status: "expired" }).eq("id", data.id).eq("organization_id", organizationId);
    throw new Error("Facebook access has expired. Reconnect this account.");
  }
  return { connection: data, token: decryptMetaToken(data.encrypted_access_token, metaConfig().encryptionSecret) };
}

export async function refreshMetaAssets(organizationId: string, connectionId: string) {
  const { token } = await loadMetaConnection(organizationId, connectionId);
  let count = 0;
  const warnings: string[] = [];
  const save = async (raw: Record<string, unknown>, type: "page" | "ad_account" | "instagram" | "form" | "dataset", parent?: string) => {
    const asset = assetSchema.parse(raw);
    // Deliberately project safe metadata. Never store raw /me/accounts responses containing tokens.
    const metadata = Object.fromEntries(["currency", "account_status", "status", "created_time", "leads_count", "username"].filter((key) => raw[key] !== undefined).map((key) => [key, raw[key]]));
    const { data, error } = await supabaseAdmin.from("meta_assets").upsert({ organization_id: organizationId, connection_id: connectionId, asset_type: type, external_id: asset.id, name: asset.name ?? (typeof raw["username"] === "string" ? raw["username"] : asset.id), parent_external_id: parent ?? null, metadata: JSON.parse(JSON.stringify(metadata)) }, { onConflict: "organization_id,asset_type,external_id" }).select("id").single();
    if (error || !data) throw new Error("Facebook assets could not be stored.");
    count++;
    if (typeof raw["access_token"] === "string") {
      const { error: credentialError } = await supabaseAdmin.from("meta_asset_credentials").upsert({ asset_id: data.id, organization_id: organizationId, encrypted_access_token: encryptMetaToken(raw["access_token"], metaConfig().encryptionSecret), updated_at: new Date().toISOString() });
      if (credentialError) throw new Error("Facebook Page credentials could not be stored securely.");
    }
    return asset.id;
  };
  try {
    const pages = await metaList("me/accounts", token, "id,name,access_token,instagram_business_account{id,username}");
    for (const raw of pages) {
      const pageId = await save(raw, "page");
      const instagram = z.object({ id: z.string(), username: z.string().optional() }).safeParse(raw["instagram_business_account"]);
      if (instagram.success) await save(instagram.data, "instagram", pageId);
      if (typeof raw["access_token"] !== "string") { warnings.push("A Page has no lead-access credential; check Facebook Page access."); continue; }
      try { for (const form of await metaList(`${pageId}/leadgen_forms`, raw["access_token"], "id,name,status,created_time,leads_count")) await save(form, "form", pageId); }
      catch (error) { if (error instanceof MetaApiError && [4, 17, 32, 613].includes(error.code ?? 0)) throw error; warnings.push(error instanceof Error ? error.message : "Page forms could not be retrieved."); }
    }
    try {
      for (const account of await metaList("me/adaccounts", token, "id,account_id,name,currency,account_status")) {
        // Graph uses act_ prefixes for account paths; stored IDs remain numeric.
        const numericId = typeof account["account_id"] === "string" ? account["account_id"] : String(account["id"]).replace(/^act_/, "");
        await save({ ...account, id: numericId }, "ad_account");
        try { for (const dataset of await metaList(`act_${numericId}/adspixels`, token, "id,name")) await save(dataset, "dataset", numericId); }
        catch (error) { if (error instanceof MetaApiError && [4, 17, 32, 613].includes(error.code ?? 0)) throw error; warnings.push(error instanceof Error ? error.message : "Datasets could not be retrieved."); }
      }
    } catch (error) { warnings.push(error instanceof Error ? error.message : "Ad accounts could not be retrieved."); }
    const { error } = await supabaseAdmin.from("meta_sync_logs").insert({ organization_id: organizationId, connection_id: connectionId, sync_type: "asset_refresh", status: warnings.length ? "failed" : "succeeded", records_processed: count, error_message: warnings.length ? warnings.join(" ").slice(0, 2000) : null });
    if (error) throw new Error("Asset refresh history could not be saved.");
    return { count, warnings };
  } catch (error) {
    if (error instanceof MetaApiError && error.code === 190) await supabaseAdmin.from("meta_connections").update({ connection_status: "revoked" }).eq("id", connectionId).eq("organization_id", organizationId);
    await supabaseAdmin.from("meta_sync_logs").insert({ organization_id: organizationId, connection_id: connectionId, sync_type: "asset_refresh", status: "failed", records_processed: count, error_message: error instanceof Error ? error.message.slice(0, 2000) : "Asset refresh failed." });
    throw error;
  }
}

export async function selectMetaAsset(organizationId: string, assetId: string, selected: boolean) {
  const { data: asset, error } = await supabaseAdmin.from("meta_assets").select("*").eq("id", assetId).eq("organization_id", organizationId).single();
  if (error || !asset) throw new Error("This Facebook asset is not available in your workspace.");
  await loadMetaConnection(organizationId, asset.connection_id);
  if (asset.asset_type === "form" && selected) {
    const { data: parent } = await supabaseAdmin.from("meta_assets").select("id,selected,webhook_subscribed").eq("organization_id", organizationId).eq("asset_type", "page").eq("external_id", asset.parent_external_id ?? "").single();
    if (!parent?.selected || !parent.webhook_subscribed) throw new Error("Select and subscribe this form’s Facebook Page first.");
    // One form routes to exactly one client; overlapping routing is unsafe.
    const { data: conflict, error: conflictError } = await supabaseAdmin.from("meta_assets").select("id").eq("asset_type", "form").eq("external_id", asset.external_id).eq("selected", true).neq("organization_id", organizationId).limit(1);
    if (conflictError || conflict?.length) throw new Error("This lead form is already assigned to another client workspace.");
  }
  let subscribed = asset.webhook_subscribed;
  if (asset.asset_type === "page") {
    const { data: credential } = await supabaseAdmin.from("meta_asset_credentials").select("encrypted_access_token").eq("asset_id", asset.id).eq("organization_id", organizationId).single();
    if (!credential) throw new Error("Refresh assets to retrieve this Page’s access credential.");
    const token = decryptMetaToken(credential.encrypted_access_token, metaConfig().encryptionSecret);
    if (selected) {
      const result = z.object({ success: z.boolean() }).parse(await metaRequest(`${asset.external_id}/subscribed_apps`, token, { subscribed_fields: "leadgen" }, "POST"));
      if (!result.success) throw new Error("Facebook did not confirm the Page subscription.");
      subscribed = true;
    } else {
      // Do not remove a shared Page subscription used by a different tenant.
      const { data: others, error: othersError } = await supabaseAdmin.from("meta_assets").select("id").eq("asset_type", "page").eq("external_id", asset.external_id).eq("selected", true).neq("organization_id", organizationId).limit(1);
      if (othersError) throw new Error("Page subscription usage could not be checked.");
      if (!others?.length) {
        const result = z.object({ success: z.boolean() }).parse(await metaRequest(`${asset.external_id}/subscribed_apps`, token, {}, "DELETE"));
        if (!result.success) throw new Error("Facebook did not confirm the Page disconnection.");
      }
      subscribed = false;
      const { error: formsError } = await supabaseAdmin.from("meta_assets").update({ selected: false }).eq("organization_id", organizationId).eq("asset_type", "form").eq("parent_external_id", asset.external_id);
      if (formsError) throw new Error("Page forms could not be paused.");
    }
  }
  const { error: saveError } = await supabaseAdmin.from("meta_assets").update({ selected, webhook_subscribed: subscribed }).eq("id", asset.id).eq("organization_id", organizationId);
  if (saveError) throw new Error("Asset selection could not be saved.");
  return { saved: true };
}