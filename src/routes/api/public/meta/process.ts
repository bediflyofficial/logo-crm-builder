import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/meta/process")({
  server: { handlers: { POST: async ({ request }) => {
    const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
    const denied = await authenticateCronRequest(request);
    if (denied) return denied;
    const body = z.object({ kind: z.literal("lead_sync") }).safeParse(await request.json().catch(() => null));
    if (!body.success) return new Response("Invalid job request", { status: 400 });
    if (!process.env["META_APP_ID"] || !process.env["META_APP_SECRET"] || !process.env["META_GRAPH_API_VERSION"] || !process.env["META_REDIRECT_URI"]) return Response.json({ pendingConfiguration: true });
    const { processMetaLeadJobs } = await import("@/lib/meta-processor.server");
    return Response.json(await processMetaLeadJobs());
  } } },
});