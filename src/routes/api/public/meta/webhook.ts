import { createFileRoute } from "@tanstack/react-router";
import { extractLeadNotifications } from "@/lib/meta-rules";

export const Route = createFileRoute("/api/public/meta/webhook")({
  server: { handlers: {
    GET: async ({ request }) => {
      const configured = process.env["META_WEBHOOK_VERIFY_TOKEN"];
      if (!configured) return new Response("Meta webhook pending configuration", { status: 503 });
      const url = new URL(request.url);
      const challenge = url.searchParams.get("hub.challenge");
      if (url.searchParams.get("hub.mode") !== "subscribe" || url.searchParams.get("hub.verify_token") !== configured || !challenge || !/^\d{1,100}$/.test(challenge)) return new Response("Verification failed", { status: 403 });
      return new Response(challenge, { headers: { "Content-Type": "text/plain", "Cache-Control": "no-store" } });
    },
    POST: async ({ request }) => {
      const secret = process.env["META_APP_SECRET"];
      if (!secret) return new Response("Meta webhook pending configuration", { status: 503 });
      if (Number(request.headers.get("content-length") ?? 0) > 1024 * 1024) return new Response("Payload too large", { status: 413 });
      const reader = request.body?.getReader();
      if (!reader) return new Response("Missing payload", { status: 400 });
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 1024 * 1024) { await reader.cancel(); return new Response("Payload too large", { status: 413 }); }
        chunks.push(value);
      }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const body = new TextDecoder().decode(bytes);
      const { verifyMetaSignature } = await import("@/lib/meta-webhook.server");
      if (!verifyMetaSignature(body, request.headers.get("x-hub-signature-256"), secret)) return new Response("Invalid signature", { status: 401 });
      let notifications;
      try { notifications = extractLeadNotifications(JSON.parse(body)); } catch { return new Response("Invalid payload", { status: 400 }); }
      if (!notifications.length) return new Response("EVENT_RECEIVED");
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin.from("meta_webhook_events").upsert(notifications.map((item) => ({ ...item, payload: item })), { onConflict: "leadgen_id", ignoreDuplicates: true });
      if (error) { console.error("Meta webhook inbox write failed", error.code); return new Response("Inbox unavailable", { status: 503 }); }
      return new Response("EVENT_RECEIVED", { headers: { "Cache-Control": "no-store" } });
    },
  } },
});