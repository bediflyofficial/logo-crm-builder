import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { isAllowedCrmOrigin } from "@/lib/crm-admin-rules";
import { META_ACTIONS, MetaApiAuthorizationError } from "@/lib/meta-api-rules";

function corsHeaders(origin: string | null): Record<string, string> {
  const base: Record<string, string> = { "Cache-Control": "no-store", Vary: "Origin" };
  if (!isAllowedCrmOrigin(origin)) return base;
  return { ...base, "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Max-Age": "600" };
}

export const Route = createFileRoute("/api/public/meta/manage/$action")({
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
        if (!(META_ACTIONS as readonly string[]).includes(params.action)) return Response.json({ error: "Unknown Meta action." }, { status: 404, headers });
        const [{ AdminError, authenticateCaller }, { runMetaAction }, { MetaApiError }] = await Promise.all([
          import("@/lib/crm-admin.server"),
          import("@/lib/meta-admin.server"),
          import("@/lib/meta-api.server"),
        ]);
        try {
          const caller = await authenticateCaller(request);
          const body = await request.json().catch(() => ({}));
          const result = await runMetaAction(params.action as Parameters<typeof runMetaAction>[0], caller, body, origin);
          return Response.json(result, { headers });
        } catch (error) {
          if (error instanceof AdminError || error instanceof MetaApiAuthorizationError) return Response.json({ error: error.message }, { status: error.status, headers });
          if (error instanceof MetaApiError) return Response.json({ error: error.message }, { status: error.status, headers });
          if (error instanceof z.ZodError) return Response.json({ error: error.issues[0]?.message ?? "Invalid input." }, { status: 400, headers });
          console.error("[meta api]", error);
          return Response.json({ error: "The Meta integration request could not be completed." }, { status: 500, headers });
        }
      },
    },
  },
});
