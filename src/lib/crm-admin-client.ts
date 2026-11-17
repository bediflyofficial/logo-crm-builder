import { supabase } from "@/integrations/supabase/client";
import type { AdminAction } from "./crm-admin-rules";

/** Empty on Lovable hosting (same origin); on the Oracle build set VITE_CRM_ADMIN_API_URL to the Lovable published URL. */
function adminApiBase() {
  return (import.meta.env["VITE_CRM_ADMIN_API_URL"] as string | undefined)?.replace(/\/+$/, "") ?? "";
}

export async function callAdminApi<T>(action: AdminAction, data: unknown = {}): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const response = await fetch(`${adminApiBase()}/api/public/admin/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The request could not be completed.");
  return payload;
}
