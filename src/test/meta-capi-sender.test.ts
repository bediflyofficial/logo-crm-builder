import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildCapiPayload, capiFailureCode, dispatchCapiEvent, normalizeMetaPhone, transmitCapiEvent, type CapiDispatchStore, type CapiEvent } from "@/lib/meta-capi-sender.server";
import { MetaApiError } from "@/lib/meta-api.server";

const event: CapiEvent = { id: "11111111-1111-4111-8111-111111111111", organization_id: "workspace-a", lead_id: "lead-a", event_name: "QualifiedLead", occurred_at: new Date().toISOString(), action_source: "system_generated", value: null, currency: null, status: "processing", sent_dataset_id: "123456789", test_event: false };
const matching = { email: "  CUSTOMER@EXAMPLE.COM ", phone: "+1 (202) 555-0123" };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function store(): CapiDispatchStore {
  let reserved = false;
  return {
    reserve: vi.fn(async (org, id) => { if (reserved || org !== event.organization_id || id !== event.id) return null; reserved = true; return event; }),
    credentials: vi.fn(async () => ({ datasetId: "123456789", token: "fixture-only-token" })),
    matching: vi.fn(async () => matching), preflight: vi.fn(async () => true), finish: vi.fn(async () => {}),
  };
}
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("Phase 3 secure CAPI sender", () => {
  it("hashes normalized legitimate email and phone, retaining stable ID/time and system_generated", () => {
    const payload = buildCapiPayload(event, matching);
    expect(payload.user_data).toEqual({ em: [hash("customer@example.com")], ph: [hash("12025550123")] });
    expect(payload.event_id).toBe(event.id);
    expect(payload.event_time).toBe(Math.floor(Date.parse(event.occurred_at) / 1000));
    expect(payload.action_source).toBe("system_generated");
    expect(Object.keys(payload).sort()).toEqual(["event_name", "event_time", "event_id", "action_source", "user_data"].sort());
  });
  it("does not guess phone country codes", () => { expect(normalizeMetaPhone("9876543210")).toBeNull(); expect(normalizeMetaPhone("+91 9876543210")).toBe("919876543210"); });
  it("blocks missing matching data", () => { expect(() => buildCapiPayload(event, { email: null, phone: null })).toThrow("matching_data_missing"); });
  it("requires valid original Purchase amount and currency", () => {
    expect(() => buildCapiPayload({ ...event, event_name: "Purchase" }, matching)).toThrow("purchase_value_required");
    expect(() => buildCapiPayload({ ...event, event_name: "Purchase", value: 100, currency: "ZZZ" }, matching)).toThrow("purchase_currency_required");
    expect(buildCapiPayload({ ...event, event_name: "Purchase", value: 125.5, currency: "INR" }, matching).custom_data).toEqual({ value: 125.5, currency: "INR" });
  });
  it("never replaces stale or future timestamps with send time", () => {
    expect(() => buildCapiPayload({ ...event, occurred_at: new Date(Date.now() - 8 * 86400000).toISOString() }, matching)).toThrow("event_time_invalid");
    expect(() => buildCapiPayload({ ...event, occurred_at: new Date(Date.now() + 86400000).toISOString() }, matching)).toThrow("event_time_invalid");
  });
  it("posts to the workspace Dataset and recognizes exactly one accepted event", async () => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v25.0");
    const fetch = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 })));
    vi.stubGlobal("fetch", fetch);
    expect(await transmitCapiEvent({ datasetId: "123456789", token: "fixture-only-token" }, buildCapiPayload(event, matching), "TEST_PHASE3")).toBe(1);
    const [url, init] = fetch.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://graph.facebook.com/v25.0/123456789/events");
    const body = new URLSearchParams(String(init.body));
    expect(body.get("test_event_code")).toBe("TEST_PHASE3");
    expect(body.get("partner_agent")).toBe("lovable");
    expect(String(init.body)).not.toContain("CUSTOMER");
  });
  it.each([0, 2, null])("does not mark ambiguous receipt %s as accepted", async (count) => {
    vi.stubEnv("META_GRAPH_API_VERSION", "v25.0"); vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ events_received: count }))));
    await expect(transmitCapiEvent({ datasetId: "123456789", token: "fixture" }, buildCapiPayload(event, matching))).rejects.toThrow("meta_response_unconfirmed");
  });
  it.each([[190, "meta_token_invalid"], [200, "meta_permission_denied"], [10, "meta_permission_denied"], [100, "meta_payload_rejected"]])("classifies provider code %s without exposing customer data or tokens", (code, reason) => {
    expect(capiFailureCode(new MetaApiError(400, Number(code), "sensitive provider details"))).toBe(reason);
  });
  it("dispatches once and never automatically repeats sent or in-flight events", async () => {
    const db = store(), send = vi.fn(async () => 1);
    const results = await Promise.all([dispatchCapiEvent(db, event.organization_id, event.id, send), dispatchCapiEvent(db, event.organization_id, event.id, send)]);
    expect(send).toHaveBeenCalledTimes(1); expect(results.map(r => r.status).sort()).toEqual(["not_eligible", "sent"]);
    expect(db.reserve).toHaveBeenCalledWith(event.organization_id, event.id, false);
    expect(db.finish).toHaveBeenCalledWith(event, "sent", null, 1);
  });
  it.each(["consent missing", "withdrawal", "GPC", "matching refused", "disabled production", "ineligible Dataset"])("blocks %s before reading matching fields", async () => {
    const db = store(); db.preflight = vi.fn(async () => false); const send = vi.fn(async () => 1);
    expect((await dispatchCapiEvent(db, event.organization_id, event.id, send)).status).toBe("blocked"); expect(send).not.toHaveBeenCalled(); expect(db.matching).not.toHaveBeenCalled();
  });
  it("sends the same outbox ID and original timestamp to Meta Test Events without production mode", async () => {
    const db = store();
    db.reserve = vi.fn(async (_org, _id, testEvent) => testEvent ? { ...event, test_event: true } : null);
    const send = vi.fn(async (_credentials: { datasetId: string; token: string }, _payload: ReturnType<typeof buildCapiPayload>, _testEventCode?: string) => 1);
    const result = await dispatchCapiEvent(db, event.organization_id, event.id, send, "TEST_PHASE3");
    expect(result).toEqual({ status: "sent", eventsReceived: 1 });
    expect(db.reserve).toHaveBeenCalledWith(event.organization_id, event.id, true);
    expect(db.preflight).toHaveBeenCalledWith(expect.objectContaining({ test_event: true }), expect.anything(), true);
    expect(send.mock.calls[0]?.[2]).toBe("TEST_PHASE3");
    expect(send.mock.calls[0]?.[1]).toMatchObject({ event_id: event.id, event_time: Math.floor(Date.parse(event.occurred_at) / 1000) });
  });
  it("rejects a reservation whose test and production delivery modes differ", async () => {
    const db = store(), send = vi.fn(async () => 1);
    const result = await dispatchCapiEvent(db, event.organization_id, event.id, send, "TEST_PHASE3");
    expect(result.errorCode).toBe("delivery_mode_mismatch");
    expect(send).not.toHaveBeenCalled();
    expect(db.credentials).not.toHaveBeenCalled();
  });
  it("rechecks withdrawal immediately before transmission", async () => {
    const db = store(); db.preflight = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false); const send = vi.fn(async () => 1);
    await dispatchCapiEvent(db, event.organization_id, event.id, send); expect(send).not.toHaveBeenCalled(); expect(db.preflight).toHaveBeenCalledTimes(2);
  });
  it("blocks missing tokens", async () => {
    const db = store(); db.credentials = vi.fn(async () => ({ datasetId: "123456789", token: "" })); const send = vi.fn(async () => 1);
    expect((await dispatchCapiEvent(db, event.organization_id, event.id, send)).status).toBe("blocked"); expect(send).not.toHaveBeenCalled();
  });
  it("never reroutes an event to a different Dataset", async () => {
    const db = store(); db.credentials = vi.fn(async () => ({ datasetId: "987654321", token: "fixture" })); const send = vi.fn(async () => 1);
    expect((await dispatchCapiEvent(db, event.organization_id, event.id, send)).errorCode).toBe("configuration_changed"); expect(send).not.toHaveBeenCalled();
  });
  it("does not read credentials or send another workspace's event", async () => {
    const db = store(), send = vi.fn(async () => 1);
    expect((await dispatchCapiEvent(db, "workspace-b", event.id, send)).status).toBe("not_eligible"); expect(db.credentials).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("persists rejected payloads with safe failure codes", async () => {
    const db = store(); const send = vi.fn(async () => { throw new MetaApiError(400, 100, "private details"); });
    expect(await dispatchCapiEvent(db, event.organization_id, event.id, send)).toEqual({ status: "failed", eventsReceived: 0, errorCode: "meta_payload_rejected" });
  });
});