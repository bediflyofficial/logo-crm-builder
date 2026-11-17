import { z } from "zod";

/** Origins allowed to call the admin endpoints and receive invitation redirects. */
export const PRODUCTION_CRM_ORIGIN = "https://crm.bedifly.com";

export function isAllowedCrmOrigin(origin: string | null | undefined): origin is string {
  if (!origin) return false;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (url.origin !== origin) return false;
  if (origin === PRODUCTION_CRM_ORIGIN) return true;
  if (url.protocol === "https:" && url.hostname.endsWith(".lovable.app")) return true;
  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return true;
  return false;
}

/** Invitations from the Oracle site (or unknown callers) always return users to crm.bedifly.com. */
export function invitationRedirect(origin: string | null | undefined) {
  return isAllowedCrmOrigin(origin) ? origin : PRODUCTION_CRM_ORIGIN;
}

export const organizationInput = z.object({
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

export const memberInviteInput = z.object({
  organizationId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).default(""),
});

export const assignRoleInput = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(["client_admin", "sales_exec"]),
});

export const ADMIN_ACTIONS = ["ensure-platform-admin", "create-workspace", "invite-client-admin", "invite-sales-executive", "assign-role"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];
