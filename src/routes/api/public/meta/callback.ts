import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/meta/callback")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const parsed = z.object({ state: z.string().regex(/^[a-f0-9]{64}$/), code: z.string().min(1).max(4096).optional(), error: z.string().max(200).optional() }).safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) return new Response("Invalid Facebook connection response.", { status: 400, headers: { "Cache-Control": "no-store" } });
    const { getMetaOAuthOpenerOrigin } = await import("@/lib/meta-admin.server");
    const openerOrigin = await getMetaOAuthOpenerOrigin(parsed.data.state);
    if (!openerOrigin) return new Response("Facebook authorization expired or was already used. Connect again.", { status: 400, headers: { "Cache-Control": "no-store" } });
    const result = JSON.stringify({ type: "bedifly-meta-oauth", ...parsed.data }).replace(/</g, "\\u003c");
    const targetOrigin = JSON.stringify(openerOrigin).replace(/</g, "\\u003c");
    return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Facebook connection — Bedifly CRM</title></head><body><p>Return to Bedifly CRM to finish your Facebook connection.</p><script>if(window.opener){window.opener.postMessage(${result},${targetOrigin});window.close();}</script></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'" } });
  } } },
});