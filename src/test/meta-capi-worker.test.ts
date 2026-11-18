import { describe, expect, it, vi } from "vitest";
import { MetaApiError } from "@/lib/meta-api.server";
import {
  automaticRetryDelaySeconds,
  capiFailureKind,
  CAPI_MAX_ATTEMPTS,
  buildCapiPayload,
  dispatchReservedCapiEvent,
  type CapiCredentials,
  type CapiDispatchStore,
  type CapiEvent,
} from "@/lib/meta-capi-sender.server";
import { processMetaConversionJobs } from "@/lib/meta-capi-worker.server";

const event: CapiEvent = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "workspace-a",
  lead_id: "lead-a",
  event_name: "QualifiedLead",
  occurred_at: new Date().toISOString(),
  action_source: "system_generated",
  value: null,
  currency: null,
  status: "processing",
  sent_dataset_id: "123456789",
  test_event: false,
  attempts: 1,
  lease_token: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

function store(claimed: CapiEvent[] = []): CapiDispatchStore {
  return {
    reserve: vi.fn(async () => null),
    claim: vi.fn(async () => claimed),
    credentials: vi.fn(async () => ({ datasetId: "123456789", token: "fixture-only-token" })),
    matching: vi.fn(async () => ({ email: "customer@example.com", phone: "+12025550123" })),
    preflight: vi.fn(async () => true),
    finish: vi.fn(async () => {}),
  };
}

describe("Phase 4 retry and failure policy", () => {
  it("uses bounded exponential backoff for confirmed temporary failures", () => {
    expect(CAPI_MAX_ATTEMPTS).toBe(8);
    expect(automaticRetryDelaySeconds(1, "temporary")).toBe(60);
    expect(automaticRetryDelaySeconds(2, "temporary")).toBe(120);
    expect(automaticRetryDelaySeconds(7, "temporary")).toBe(3600);
    expect(automaticRetryDelaySeconds(8, "temporary")).toBeNull();
  });

  it("uses longer bounded backoff for rate limits", () => {
    expect(automaticRetryDelaySeconds(1, "temporary", true)).toBe(300);
    expect(automaticRetryDelaySeconds(2, "temporary", true)).toBe(600);
    expect(automaticRetryDelaySeconds(7, "temporary", true)).toBe(19200);
    expect(automaticRetryDelaySeconds(8, "temporary", true)).toBeNull();
  });

  it("never automatically retries permanent or uncertain failures", () => {
    expect(automaticRetryDelaySeconds(1, "permanent")).toBeNull();
    expect(automaticRetryDelaySeconds(1, "uncertain")).toBeNull();
  });

  it.each([
    [new MetaApiError(429, 17, "private provider response"), "temporary"],
    [new MetaApiError(503, 2, "private provider response"), "temporary"],
    [new MetaApiError(400, 100, "private provider response"), "permanent"],
    [new MetaApiError(401, 190, "private provider response"), "permanent"],
  ])("classifies Meta responses without exposing their contents", (error, kind) => {
    expect(capiFailureKind(error)).toBe(kind);
  });

  it("treats timeouts as uncertain and does not schedule an automatic replay", async () => {
    const db = store();
    const timeout = new Error("token and customer details must not be logged");
    timeout.name = "TimeoutError";
    const result = await dispatchReservedCapiEvent(db, event, vi.fn(async () => { throw timeout; }));
    expect(result).toEqual({ status: "failed", eventsReceived: 0, errorCode: "meta_timeout" });
    expect(db.finish).toHaveBeenCalledWith(event, "failed", "meta_timeout", 0, { kind: "uncertain", retryDelaySeconds: null });
  });

  it("schedules the same stable event after a confirmed rate-limit response", async () => {
    const db = store();
    const result = await dispatchReservedCapiEvent(db, event, vi.fn(async () => { throw new MetaApiError(429, 17, "sensitive details"); }));
    expect(result.errorCode).toBe("meta_rate_limited");
    expect(db.finish).toHaveBeenCalledWith(event, "failed", "meta_rate_limited", 0, { kind: "temporary", retryDelaySeconds: 300 });
  });

  it("stops automatic retry at the eight-attempt limit", async () => {
    const db = store();
    const exhausted = { ...event, attempts: CAPI_MAX_ATTEMPTS };
    await dispatchReservedCapiEvent(db, exhausted, vi.fn(async () => { throw new MetaApiError(503, 2, "sensitive details"); }));
    expect(db.finish).toHaveBeenCalledWith(exhausted, "failed", "meta_unavailable", 0, { kind: "temporary", retryDelaySeconds: null });
  });
});

describe("Phase 4 background conversion worker", () => {
  it("does nothing when no production events are claimable", async () => {
    const db = store();
    const send = vi.fn(async () => 1);
    expect(await processMetaConversionJobs(db, send)).toEqual({ claimed: 0, sent: 0, failed: 0, blocked: 0 });
    expect(db.claim).toHaveBeenCalledWith(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("dispatches only the leased event with its stable ID and workspace Dataset", async () => {
    const db = store([event]);
    const send = vi.fn(async (_credentials: CapiCredentials, _payload: ReturnType<typeof buildCapiPayload>) => 1);
    expect(await processMetaConversionJobs(db, send)).toEqual({ claimed: 1, sent: 1, failed: 0, blocked: 0 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toEqual({ datasetId: "123456789", token: "fixture-only-token" });
    expect(send.mock.calls[0]?.[1]).toMatchObject({ event_id: event.id, event_time: Math.floor(Date.parse(event.occurred_at) / 1000) });
    expect(db.reserve).not.toHaveBeenCalled();
  });

  it("rechecks withdrawal or GPC immediately before sending", async () => {
    const db = store([event]);
    db.preflight = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const send = vi.fn(async () => 1);
    expect(await processMetaConversionJobs(db, send)).toEqual({ claimed: 1, sent: 0, failed: 0, blocked: 1 });
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a test-mode event if it somehow reaches the production worker", async () => {
    const testEvent = { ...event, test_event: true };
    const db = store([testEvent]);
    const send = vi.fn(async () => 1);
    expect(await processMetaConversionJobs(db, send)).toEqual({ claimed: 1, sent: 0, failed: 0, blocked: 1 });
    expect(send).not.toHaveBeenCalled();
    expect(db.credentials).not.toHaveBeenCalled();
  });
});
