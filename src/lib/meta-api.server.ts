import { z } from "zod";

export { META_PERMISSIONS } from "@/lib/meta-rules";

export function metaConfig() {
  const appId = process.env["META_APP_ID"];
  const appSecret = process.env["META_APP_SECRET"];
  const version = process.env["META_GRAPH_API_VERSION"];
  const redirectUri = process.env["META_REDIRECT_URI"];
  const encryptionSecret = process.env["META_TOKEN_ENCRYPTION_KEY"];
  const loginConfigId = process.env["META_LOGIN_CONFIG_ID"];
  if (!appId || !appSecret || !version || !redirectUri || !encryptionSecret || !loginConfigId) throw new Error("Facebook connection needs Meta Developer App configuration.");
  if (!/^v\d+\.\d+$/.test(version)) throw new Error("Set a supported Meta Graph API version, such as the version shown in your Developer App.");
  if (!/^\d{5,25}$/.test(loginConfigId)) throw new Error("META_LOGIN_CONFIG_ID must be the numeric Configuration ID from Facebook Login for Business.");
  const redirect = new URL(redirectUri);
  if (redirect.protocol !== "https:" || redirect.pathname !== "/api/public/meta/callback" || redirect.search || redirect.hash) throw new Error("The Meta callback must be the HTTPS /api/public/meta/callback address for this CRM.");
  return { appId, appSecret, version, redirectUri, encryptionSecret, loginConfigId };
}

export function graphVersion() {
  const version = process.env["META_GRAPH_API_VERSION"];
  if (!version || !/^v\d+\.\d+$/.test(version)) throw new Error("Set META_GRAPH_API_VERSION (for example v21.0) in backend secrets.");
  return version;
}

export class MetaApiError extends Error {
  constructor(public status: number, public code: number | undefined, message: string) { super(message); }
}

// Custom client-owned OAuth uses the client's token, never a shared builder connection.
// Authorization headers and token-bearing responses are never logged or returned to the browser.
export async function metaRequest(path: string, token: string | null, params: Record<string, string> = {}, method = "GET") {
  const version = graphVersion();
  if (!/^[a-zA-Z0-9_\-/]+$/.test(path)) throw new Error("Invalid Meta request path.");
  const url = new URL(`https://graph.facebook.com/${version}/${path}`);
  const headers = new Headers();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body: URLSearchParams | undefined;
  if (method === "GET") Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  else { headers.set("Content-Type", "application/x-www-form-urlencoded"); body = new URLSearchParams(params); }
  const response = await fetch(url, { method, headers, body: body ?? null, signal: AbortSignal.timeout(20_000) });
  const json: unknown = await response.json().catch(() => null);
  const failure = z.object({ error: z.object({ code: z.number().optional(), message: z.string().optional(), error_user_msg: z.string().optional() }) }).safeParse(json);
  if (!response.ok || failure.success) {
    const code = failure.success ? failure.data.error.code : undefined;
    // Redact the credential even when a provider echoes it in an error.
    const raw = failure.success ? (failure.data.error.error_user_msg ?? failure.data.error.message ?? "Meta request failed.") : "Meta returned an unreadable response.";
    const secrets = [token, params["client_secret"], params["fb_exchange_token"], params["code"], params["input_token"], params["access_token"]].filter((value): value is string => Boolean(value));
    const message = secrets.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), raw);
    throw new MetaApiError(response.status, code, `Facebook request failed (${response.status}${code ? `, code ${code}` : ""}): ${message}`);
  }
  return json;
}

export async function metaList(path: string, token: string, fields: string) {
  const records: Record<string, unknown>[] = [];
  let after: string | undefined;
  for (let page = 0; page < 20; page++) {
    const result = z.object({ data: z.array(z.record(z.unknown())), paging: z.object({ cursors: z.object({ after: z.string().optional() }).optional(), next: z.string().optional() }).optional() }).parse(await metaRequest(path, token, { fields, limit: "100", ...(after ? { after } : {}) }));
    records.push(...result.data);
    if (!result.paging?.next) return records;
    after = result.paging.cursors?.after;
    if (!after) throw new Error("Meta asset pagination could not be continued.");
  }
  throw new Error("More than 2,000 assets are available; narrow the connected Facebook asset access and refresh.");
}