import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const jobSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("lead_sync") }),
  z.object({ kind: z.literal("conversion_delivery") }),
  z.object({ kind: z.literal("all") }),
]);

export const Route = createFileRoute("/api/public/meta/process")({
  server: { handlers: { POST: async ({ request }) => {
    const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
    const denied = await authenticateCronRequest(request);
    if (denied) return denied;
    const body = jobSchema.safeParse(await request.json().catch(() => null));
    if (!body.success) return new Response("Invalid job request", { status: 400 });

    const runLeadSync = async () => {
      if (!process.env["META_APP_ID"] || !process.env["META_APP_SECRET"] || !process.env["META_GRAPH_API_VERSION"] || !process.env["META_REDIRECT_URI"]) return { pendingConfiguration: true };
      const { processMetaLeadJobs } = await import("@/lib/meta-processor.server");
      return processMetaLeadJobs();
    };
    const runConversions = async () => {
      if (!process.env["META_GRAPH_API_VERSION"] || !process.env["META_TOKEN_ENCRYPTION_KEY"]) return { pendingConfiguration: true };
      const { processMetaConversionJobs } = await import("@/lib/meta-capi-worker.server");
      return processMetaConversionJobs();
    };

    if (body.data.kind === "lead_sync") return Response.json(await runLeadSync());
    if (body.data.kind === "conversion_delivery") return Response.json(await runConversions());

    // A failure in one processor must not prevent the other queue from being checked.
    const [leadSync, conversions] = await Promise.allSettled([runLeadSync(), runConversions()]);
    return Response.json({
      leadSync: leadSync.status === "fulfilled" ? leadSync.value : { status: "failed" },
      conversions: conversions.status === "fulfilled" ? conversions.value : { status: "failed" },
    });
  } } },
});
