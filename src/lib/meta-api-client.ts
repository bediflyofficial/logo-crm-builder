import { supabase } from "@/integrations/supabase/client";
import type { MetaAction } from "./meta-api-rules";

/** Empty on Lovable hosting. Oracle uses the same Lovable API base as workspace administration. */
function metaApiBase() {
  return (import.meta.env["VITE_CRM_ADMIN_API_URL"] as string | undefined)?.replace(/\/+$/, "") ?? "";
}

/** Sends only the user's bearer token and validated action data; backend credentials never enter the browser. */
export async function callMetaApi<T>(action: MetaAction, data: unknown = {}): Promise<T> {
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) throw new Error("Sign in again to continue.");
  const response = await fetch(`${metaApiBase()}/api/public/meta/manage/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "The Meta integration request could not be completed.");
  return payload;
}
