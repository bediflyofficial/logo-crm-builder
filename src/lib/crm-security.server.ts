import { AdminError, authenticateCaller } from "@/lib/crm-admin.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  normalizeRecoveryCode,
  recoveryCodeInput,
  RETENTION_APPROVAL_PHRASE,
  retentionAutomaticInput,
  retentionExecuteInput,
  retentionHoldInput,
  retentionOrganizationInput,
  retentionRunResultSchema,
  type SecurityAction,
} from "./crm-security-rules";

type Caller = Awaited<ReturnType<typeof authenticateCaller>>;
const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

async function requirePlatformAdmin(caller: Caller) {
  const { data, error } = await caller.supabase.rpc("is_platform_admin");
  if (error || !data) throw new AdminError("Verify your authenticator to continue as Super Admin.", 403);
}

async function hasPlatformRole(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin.from("user_roles").select("id")
    .eq("user_id", userId).eq("role", "platform_admin").is("organization_id", null).limit(1);
  if (error) throw new AdminError("Administrator access could not be verified.", 500);
  return Boolean(data?.length);
}

async function audit(caller: Caller, action: string, organizationId: string | null, details: Record<string, unknown>) {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    organization_id: organizationId,
    user_id: caller.userId,
    action,
    entity_type: "platform_security",
    entity_id: organizationId,
    details,
  });
  if (error) throw new AdminError("The security audit entry could not be saved.", 500);
}

function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const body = Array.from(bytes, (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length]).join("");
    return `BDY-${body.match(/.{5}/g)!.join("-")}`;
  });
}

async function recoveryCodeHash(code: string): Promise<string> {
  const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!secret) throw new AdminError("Server configuration is incomplete.", 500);
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(normalizeRecoveryCode(code)));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function generateRecoveryCodes(caller: Caller) {
  await requirePlatformAdmin(caller);
  const codes = newRecoveryCodes();
  const codeHashes = await Promise.all(codes.map(recoveryCodeHash));
  const timestamp = new Date().toISOString();
  const { error: retireError } = await supabaseAdmin.from("platform_admin_recovery_codes")
    .update({ used_at: timestamp }).eq("user_id", caller.userId).is("used_at", null);
  if (retireError) throw new AdminError("Previous recovery codes could not be retired.", 500);
  const { error } = await supabaseAdmin.from("platform_admin_recovery_codes")
    .insert(codeHashes.map((code_hash) => ({ user_id: caller.userId, code_hash })));
  if (error) throw new AdminError("Recovery codes could not be generated.", 500);
  await audit(caller, "mfa_recovery_codes_generated", null, { count: codes.length });
  return { codes };
}

async function recoverMfa(caller: Caller, body: unknown) {
  const { code } = recoveryCodeInput.parse(body);
  if (caller.assuranceLevel === "aal2") throw new AdminError("This session is already verified. Generate new recovery codes from Security settings.");
  if (!(await hasPlatformRole(caller.userId))) throw new AdminError("Only a Super Admin can use these recovery codes.", 403);
  const { data: factorData, error: factorError } = await supabaseAdmin.auth.admin.mfa.listFactors({ userId: caller.userId });
  if (factorError) throw new AdminError("Authenticator recovery is unavailable. Try again.", 500);
  const factors = (factorData?.factors ?? []).filter((factor) => factor.factor_type === "totp" && factor.status === "verified");
  if (!factors.length) return { recovered: true, message: "No verified authenticator needs removal." };

  const codeHash = await recoveryCodeHash(code);
  const timestamp = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin.from("platform_admin_recovery_codes")
    .update({ used_at: timestamp }).eq("user_id", caller.userId).eq("code_hash", codeHash).is("used_at", null).select("id").maybeSingle();
  if (claimError) throw new AdminError("Recovery could not be completed. Try again.", 500);
  if (!claimed) throw new AdminError("That recovery code is invalid or has already been used.", 403);

  try {
    for (const factor of factors) {
      const { error } = await supabaseAdmin.auth.admin.mfa.deleteFactor({ userId: caller.userId, id: factor.id });
      if (error) throw error;
    }
  } catch {
    await supabaseAdmin.from("platform_admin_recovery_codes").update({ used_at: null }).eq("id", claimed.id).eq("used_at", timestamp);
    throw new AdminError("The old authenticator could not be removed. No changes were made; try again.", 500);
  }
  await audit(caller, "mfa_authenticator_recovered", null, { recoveryCodeUsed: true });
  return { recovered: true };
}

async function retentionOverview(caller: Caller) {
  await requirePlatformAdmin(caller);
  const [organizations, settings, runs] = await Promise.all([
    supabaseAdmin.from("organizations").select("id,name,status").order("name"),
    supabaseAdmin.from("retention_settings").select("*"),
    supabaseAdmin.from("retention_runs").select("*").order("created_at", { ascending: false }).limit(40),
  ]);
  if (organizations.error || settings.error || runs.error) throw new AdminError("Retention monitoring could not be loaded.", 500);
  return { organizations: organizations.data ?? [], settings: settings.data ?? [], runs: runs.data ?? [] };
}

async function retentionRun(caller: Caller, body: unknown, execute: boolean) {
  const data = execute ? retentionExecuteInput.parse(body) : retentionOrganizationInput.parse(body);
  await requirePlatformAdmin(caller);
  const { data: result, error } = await supabaseAdmin.rpc("run_workspace_retention", {
    _organization_id: data.organizationId,
    _execute: execute,
    _actor_id: caller.userId,
  });
  if (error) {
    if (error.message.includes("not been approved")) throw new AdminError("Approve automatic deletion for this workspace first.", 403);
    throw new AdminError("The retention run could not be completed. No partial result was kept.", 500);
  }
  return retentionRunResultSchema.parse(result);
}

async function setRetentionAutomatic(caller: Caller, body: unknown) {
  const data = retentionAutomaticInput.parse(body);
  await requirePlatformAdmin(caller);
  if (data.enabled && data.approvalPhrase !== RETENTION_APPROVAL_PHRASE) throw new AdminError(`Type ${RETENTION_APPROVAL_PHRASE} to approve automatic deletion.`);
  const { data: current, error: readError } = await supabaseAdmin.from("retention_settings").select("legal_hold,legal_hold_reason").eq("organization_id", data.organizationId).maybeSingle();
  if (readError) throw new AdminError("Retention settings could not be read.", 500);
  if (data.enabled && current?.legal_hold) throw new AdminError("Remove the workspace legal hold before approving deletion.", 409);
  const timestamp = new Date().toISOString();
  const { error } = await supabaseAdmin.from("retention_settings").upsert({
    organization_id: data.organizationId,
    automatic_deletion_enabled: data.enabled,
    approved_by: data.enabled ? caller.userId : null,
    approved_at: data.enabled ? timestamp : null,
    legal_hold: current?.legal_hold ?? false,
    legal_hold_reason: current?.legal_hold_reason ?? null,
    updated_by: caller.userId,
    updated_at: timestamp,
  });
  if (error) throw new AdminError("Retention approval could not be saved.", 500);
  await audit(caller, data.enabled ? "retention_automatic_approved" : "retention_automatic_disabled", data.organizationId, { enabled: data.enabled });
  return { saved: true, enabled: data.enabled };
}

async function setRetentionHold(caller: Caller, body: unknown) {
  const data = retentionHoldInput.parse(body);
  await requirePlatformAdmin(caller);
  if (data.hold && data.reason.length < 3) throw new AdminError("Enter a short legal-hold reason.");
  const { data: current, error: readError } = await supabaseAdmin.from("retention_settings").select("organization_id").eq("organization_id", data.organizationId).maybeSingle();
  if (readError) throw new AdminError("Retention settings could not be read.", 500);
  const { error } = await supabaseAdmin.from("retention_settings").upsert({
    organization_id: data.organizationId,
    automatic_deletion_enabled: false,
    approved_by: null,
    approved_at: null,
    legal_hold: data.hold,
    legal_hold_reason: data.hold ? data.reason : null,
    updated_by: caller.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "organization_id" });
  if (error || (!current && data.organizationId.length === 0)) throw new AdminError("The legal hold could not be saved.", 500);
  await audit(caller, data.hold ? "retention_legal_hold_enabled" : "retention_legal_hold_removed", data.organizationId, { legalHold: data.hold });
  return { saved: true, legalHold: data.hold };
}

export async function runSecurityAction(action: SecurityAction, caller: Caller, body: unknown): Promise<unknown> {
  switch (action) {
    case "generate-recovery-codes": return generateRecoveryCodes(caller);
    case "recover-mfa": return recoverMfa(caller, body);
    case "retention-overview": return retentionOverview(caller);
    case "retention-dry-run": return retentionRun(caller, body, false);
    case "retention-execute": return retentionRun(caller, body, true);
    case "set-retention-automatic": return setRetentionAutomatic(caller, body);
    case "set-retention-hold": return setRetentionHold(caller, body);
  }
}
