import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assignRoleInput, memberInviteInput, organizationInput, type AdminAction } from "./crm-admin-rules";

export class AdminError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

type Caller = { supabase: SupabaseClient<Database>; userId: string; email: string; emailConfirmed: boolean };

/** Verifies the bearer token with Lovable Cloud auth and returns an RLS-scoped client for that user. */
export async function authenticateCaller(request: Request): Promise<Caller> {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new AdminError("Sign in again to continue.", 401);
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) throw new AdminError("Server configuration is incomplete.", 500);
  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => { const h = new Headers(init?.headers); h.set("apikey", key); return fetch(input, { ...init, headers: h }); },
    },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new AdminError("Sign in again to continue.", 401);
  return { supabase, userId: data.user.id, email: data.user.email?.toLowerCase() ?? "", emailConfirmed: Boolean(data.user.email_confirmed_at) };
}

async function requirePlatformAdmin(caller: Caller) {
  const { data, error } = await caller.supabase.rpc("is_platform_admin");
  if (error || !data) throw new AdminError("Only the Bedifly platform administrator can do this.", 403);
}

async function requireOrgAdmin(caller: Caller, organizationId: string) {
  const { data, error } = await caller.supabase.rpc("is_org_admin", { _organization_id: organizationId });
  if (error || !data) throw new AdminError("Only a workspace administrator can do this.", 403);
}

async function inviteMember(input: { organizationId: string; fullName: string; email: string; phone: string }, role: "client_admin" | "sales_exec", redirectTo: string) {
  const { data: invitation, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(input.email, { data: { full_name: input.fullName }, redirectTo });
  if (inviteError || !invitation.user) throw new AdminError(inviteError?.message ?? "The invitation could not be sent.");
  const userId = invitation.user.id;
  const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
    organization_id: input.organizationId, user_id: userId, full_name: input.fullName, phone: input.phone || null, email: input.email, is_active: true,
  });
  const { error: roleError } = await supabaseAdmin.from("user_roles").insert({ organization_id: input.organizationId, user_id: userId, role });
  if (memberError || roleError) {
    await supabaseAdmin.from("organization_members").delete().eq("user_id", userId).eq("organization_id", input.organizationId);
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId).eq("organization_id", input.organizationId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
    throw new AdminError(memberError?.message ?? roleError?.message ?? "Access could not be assigned.");
  }
  return userId;
}

export async function runAdminAction(action: AdminAction, caller: Caller, body: unknown, redirectTo: string) {
  switch (action) {
    case "ensure-platform-admin": {
      if (caller.email !== "bediflyofficial@gmail.com" || !caller.emailConfirmed) return { isPlatformAdmin: false };
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: caller.userId, organization_id: null, role: "platform_admin" });
      if (error) await requirePlatformAdmin(caller);
      return { isPlatformAdmin: true };
    }
    case "create-workspace": {
      const data = organizationInput.parse(body);
      await requirePlatformAdmin(caller);
      const { data: organization, error } = await supabaseAdmin.from("organizations").insert({
        name: data.name, contact_person: data.contactPerson, email: data.email, phone: data.phone || null,
        business_category: data.businessCategory || null, website: data.website || null, address: data.address || null,
        city: data.city || null, country: data.country || null,
      }).select("id, name").single();
      if (error || !organization) throw new AdminError(error?.message ?? "Workspace could not be created.");
      try {
        await inviteMember({ organizationId: organization.id, fullName: data.contactPerson, email: data.email, phone: data.phone }, "client_admin", redirectTo);
      } catch (inviteError) {
        await supabaseAdmin.from("organizations").delete().eq("id", organization.id);
        throw inviteError;
      }
      return { id: organization.id, name: organization.name, invited: true };
    }
    case "invite-client-admin": {
      const data = memberInviteInput.parse(body);
      await requirePlatformAdmin(caller);
      const userId = await inviteMember(data, "client_admin", redirectTo);
      return { userId, email: data.email };
    }
    case "invite-sales-executive": {
      const data = memberInviteInput.parse(body);
      await requireOrgAdmin(caller, data.organizationId);
      const userId = await inviteMember(data, "sales_exec", redirectTo);
      return { userId, fullName: data.fullName, email: data.email };
    }
    case "assign-role": {
      const data = assignRoleInput.parse(body);
      await requireOrgAdmin(caller, data.organizationId);
      if (data.userId === caller.userId) throw new AdminError("You cannot change your own role.", 403);
      const { data: member } = await supabaseAdmin.from("organization_members").select("id")
        .eq("organization_id", data.organizationId).eq("user_id", data.userId).maybeSingle();
      if (!member) throw new AdminError("That person is not a member of this workspace.", 404);
      const { error: delError } = await supabaseAdmin.from("user_roles").delete()
        .eq("organization_id", data.organizationId).eq("user_id", data.userId).in("role", ["client_admin", "sales_exec"]);
      if (delError) throw new AdminError(delError.message);
      const { error } = await supabaseAdmin.from("user_roles").insert({ organization_id: data.organizationId, user_id: data.userId, role: data.role });
      if (error) throw new AdminError(error.message);
      return { userId: data.userId, role: data.role };
    }
  }
}
