import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isAllowedCrmOrigin } from "@/lib/crm-admin-rules";
import { SECURITY_ACTIONS, type SecurityAction } from "@/lib/crm-security-rules";

function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (!isAllowedCrmOrigin(origin)) return base;
  return { ...base, "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600" };
}

export const Route = createFileRoute("/api/public/security/$action")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (!isAllowedCrmOrigin(origin)) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
      },
      POST: async ({ request, params }) => {
        const origin = request.headers.get("origin");
        const headers = corsHeaders(origin);
        if (origin && !isAllowedCrmOrigin(origin)) return Response.json({ error: "Origin not allowed." }, { status: 403, headers });
        if (!(SECURITY_ACTIONS as readonly string[]).includes(params.action)) return Response.json({ error: "Unknown security action." }, { status: 404, headers });
        const { AdminError, authenticateCaller } = await import("@/lib/crm-admin.server");
        const { runSecurityAction } = await import("@/lib/crm-security.server");
        try {
          const caller = await authenticateCaller(request);
          const body = await request.json().catch(() => ({}));
          const result = await runSecurityAction(params.action as SecurityAction, caller, body);
          return Response.json(result, { headers });
        } catch (error) {
          if (error instanceof AdminError) return Response.json({ error: error.message }, { status: error.status, headers });
          if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid input." }, { status: 400, headers });
          console.error("[security api]", error);
          return Response.json({ error: "The security request could not be completed." }, { status: 500, headers });
        }
      },
    },
  },
});
