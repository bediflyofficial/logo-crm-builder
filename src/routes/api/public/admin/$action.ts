import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ADMIN_ACTIONS, invitationRedirect, isAllowedCrmOrigin, type AdminAction } from "@/lib/crm-admin-rules";

function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (!isAllowedCrmOrigin(origin)) return base;
  return { ...base, "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600" };
}

export const Route = createFileRoute("/api/public/admin/$action")({
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
        // Browsers always send Origin on cross-site POST; reject unknown sites outright.
        if (origin && !isAllowedCrmOrigin(origin)) return Response.json({ error: "Origin not allowed." }, { status: 403, headers });
        if (!(ADMIN_ACTIONS as readonly string[]).includes(params.action)) return Response.json({ error: "Unknown action." }, { status: 404, headers });
        const { AdminError, authenticateCaller, runAdminAction } = await import("@/lib/crm-admin.server");
        try {
          const caller = await authenticateCaller(request);
          const body = await request.json().catch(() => ({}));
          const result = await runAdminAction(params.action as AdminAction, caller, body, invitationRedirect(origin));
          return Response.json(result, { headers });
        } catch (error) {
          if (error instanceof AdminError) return Response.json({ error: error.message }, { status: error.status, headers });
          if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid input." }, { status: 400, headers });
          console.error("[admin api]", error);
          return Response.json({ error: "The request could not be completed." }, { status: 500, headers });
        }
      },
    },
  },
});
