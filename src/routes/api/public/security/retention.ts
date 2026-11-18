import { createFileRoute } from "@tanstack/react-router";
import type { RetentionRunResult } from "@/lib/crm-security-rules";

export const Route = createFileRoute("/api/public/security/retention")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc("run_approved_retention", { _actor_id: null });
        if (error) {
          console.error("[retention worker]", error.message);
          return Response.json({ status: "failed" }, { status: 500 });
        }
        const results = (data ?? []) as unknown as RetentionRunResult[];
        return Response.json({
          status: "completed",
          workspaces: results.map((result) => ({ organizationId: result.organizationId, deletedCounts: result.deletedCounts })),
        });
      },
    },
  },
});
