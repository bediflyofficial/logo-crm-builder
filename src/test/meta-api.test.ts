import { afterEach, describe, expect, it, vi } from "vitest";
import { metaConfig, metaRequest } from "@/lib/meta-api.server";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function configure() {
  vi.stubEnv("META_APP_ID", "fixture-app-id");
  vi.stubEnv("META_APP_SECRET", "fixture-app-secret");
  vi.stubEnv("META_GRAPH_API_VERSION", "v99.0");
  vi.stubEnv("META_REDIRECT_URI", "https://crm.example.com/api/public/meta/callback");
  vi.stubEnv("META_TOKEN_ENCRYPTION_KEY", "fixture-only-key".repeat(8));
}
describe("Meta server transport", () => {
  it("rejects non-HTTPS and wrong-path callbacks", () => {
    configure();
    vi.stubEnv("META_REDIRECT_URI", "http://crm.example.com/api/public/meta/callback");
    expect(metaConfig).toThrow();
    vi.stubEnv("META_REDIRECT_URI", "https://crm.example.com/leads");
    expect(metaConfig).toThrow();
  });
  it("uses the configured version and keeps tokens out of request URLs", async () => {
    configure();
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "123" }), { status: 200 }));
    vi.stubGlobal("fetch", transport);
    await metaRequest("me", "fixture-user-token", { fields: "id" });
    const [url, init] = transport.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://graph.facebook.com/v99.0/me?fields=id");
    expect(init.headers.get("Authorization")).toBe("Bearer fixture-user-token");
    expect(String(url)).not.toContain("fixture-user-token");
  });
  it("redacts credential echoes from provider failures", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 190, message: "fixture-user-token fixture-app-secret fixture-code" } }), { status: 401 })));
    await expect(metaRequest("oauth/access_token", "fixture-user-token", { client_secret: "fixture-app-secret", code: "fixture-code" }, "POST")).rejects.toThrow("Facebook request failed (401, code 190): [redacted] [redacted] [redacted]");
  });
});