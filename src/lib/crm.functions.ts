import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getRequestHeader } from "@tanstack/react-start/server";

function appRedirectUrl() {
  const origin = getRequestHeader("origin");
  if (!origin) throw new Error("The app address could not be verified for the invitation.");
  const url = new URL(origin);
  if (url.protocol !== "https:" && url.hostname !== "localhost") {
    throw new Error("The invitation must come from the secure Bedifly CRM address.");
  }
  return url.origin;
}

const organizationInput = z.object({
  name: z.string().trim().min(2).max(120),
  contactPerson: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40),
  businessCategory: z.string().trim().max(120),
  website: z.string().trim().max(255),
  address: z.string().trim().max(500),
  city: z.string().trim().max(120),
  country: z.string().trim().max(120),
});

export const createClientWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => organizationInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_platform_admin");
    if (roleError || !isAdmin) throw new Error("Only the Bedifly platform administrator can create workspaces.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo = appRedirectUrl();
    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .insert({
        name: data.name,
        contact_person: data.contactPerson,
        email: data.email,
        phone: data.phone || null,
        business_category: data.businessCategory || null,
        website: data.website || null,
        address: data.address || null,
        city: data.city || null,
        country: data.country || null,
      })
      .select("id, name")
      .single();
    if (organizationError || !organization) throw new Error(organizationError?.message ?? "Workspace could not be created.");

    const { data: invitation, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.contactPerson },
      redirectTo,
    });
    if (inviteError || !invitation.user) {
      await supabaseAdmin.from("organizations").delete().eq("id", organization.id);
      throw new Error(inviteError?.message ?? "The client administrator invitation could not be sent.");
    }

    const { error: membershipError } = await supabaseAdmin.from("organization_members").insert({
      organization_id: organization.id,
      user_id: invitation.user.id,
      full_name: data.contactPerson,
      is_active: true,
    });
    const { error: roleInsertError } = await supabaseAdmin.from("user_roles").insert({
      organization_id: organization.id,
      user_id: invitation.user.id,
      role: "client_admin",
    });

    if (membershipError || roleInsertError) {
      await supabaseAdmin.from("organizations").delete().eq("id", organization.id);
      await supabaseAdmin.auth.admin.deleteUser(invitation.user.id);
      throw new Error(membershipError?.message ?? roleInsertError?.message ?? "Workspace access could not be assigned.");
    }

    return { id: organization.id, name: organization.name, invited: true };
  });

const employeeInput = z.object({
  organizationId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40),
});

export const inviteSalesExecutive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => employeeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("is_org_admin", {
      _organization_id: data.organizationId,
    });
    if (roleError || !isAdmin) throw new Error("Only a workspace administrator can invite team members.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const redirectTo = appRedirectUrl();
    const { data: invitation, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
      data: { full_name: data.fullName },
      redirectTo,
    });
    if (inviteError || !invitation.user) throw new Error(inviteError?.message ?? "The team invitation could not be sent.");

    const { error: memberError } = await supabaseAdmin.from("organization_members").insert({
      organization_id: data.organizationId,
      user_id: invitation.user.id,
      full_name: data.fullName,
      phone: data.phone || null,
      is_active: true,
    });
    const { error: roleErrorInsert } = await supabaseAdmin.from("user_roles").insert({
      organization_id: data.organizationId,
      user_id: invitation.user.id,
      role: "sales_exec",
    });

    if (memberError || roleErrorInsert) {
      await supabaseAdmin.from("organization_members").delete().eq("user_id", invitation.user.id).eq("organization_id", data.organizationId);
      await supabaseAdmin.from("user_roles").delete().eq("user_id", invitation.user.id).eq("organization_id", data.organizationId);
      await supabaseAdmin.auth.admin.deleteUser(invitation.user.id);
      throw new Error(memberError?.message ?? roleErrorInsert?.message ?? "Team access could not be assigned.");
    }

    return { userId: invitation.user.id, fullName: data.fullName, email: data.email };
  });