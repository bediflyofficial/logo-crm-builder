import { supabase } from "@/integrations/supabase/client";
import type { SecurityAction } from "./crm-security-rules";

function securityApiBase() {
  return (import.meta.env["VITE_CRM_ADMIN_API_URL"] as string | undefined)?.replace(/\/+$/, "") ?? "";
}

export async function callSecurityApi<T>(action: SecurityAction, data: unknown = {}): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const response = await fetch(`${securityApiBase()}/api/public/security/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The security request could not be completed.");
  return payload;
}
