import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { extractLeadNotifications, canSendMetaConversion, metaSettingsSchema, mapMetaLead, metaRetryDelay } from "@/lib/meta-rules";
import { verifyMetaSignature } from "@/lib/meta-webhook.server";

describe("Meta webhook security", () => {
  it("rejects missing or invalid signatures", () => {
    expect(verifyMetaSignature("{}", null, "test-only")).toBe(false);
    expect(verifyMetaSignature("{}", "sha256=" + "0".repeat(64), "test-only")).toBe(false);
  });
  it("accepts a signature only for the original body", () => {
    const signature = "sha256=" + createHmac("sha256", "test-only").update("{}").digest("hex");
    expect(verifyMetaSignature("{}", signature, "test-only")).toBe(true);
    expect(verifyMetaSignature('{"changed":true}', signature, "test-only")).toBe(false);
  });
  it("deduplicates Meta lead IDs and preserves page and form routing", () => {
    const change = { field: "leadgen", value: { leadgen_id: "123", form_id: "456" } };
    expect(extractLeadNotifications({ object: "page", entry: [{ id: "789", changes: [change, change] }] })).toEqual([{ leadgen_id: "123", form_id: "456", page_id: "789" }]);
  });
});
describe("Conversion permission", () => {
  const allowed = { enabled: true, eligible: true, eventAccepted: true, latestAccepted: true, withdrawn: false, matchingAccepted: true, globalPrivacyControl: false };
  it("requires event-time and current acceptance", () => {
    expect(canSendMetaConversion(allowed)).toBe(true);
    expect(canSendMetaConversion({ ...allowed, eventAccepted: false })).toBe(false);
    expect(canSendMetaConversion({ ...allowed, latestAccepted: false })).toBe(false);
  });
  it("blocks withdrawn consent", () => expect(canSendMetaConversion({ ...allowed, withdrawn: true })).toBe(false));
  it("blocks Global Privacy Control", () => expect(canSendMetaConversion({ ...allowed, globalPrivacyControl: true })).toBe(false));
  it("does not assume dataset eligibility", () => expect(canSendMetaConversion({ ...allowed, eligible: false })).toBe(false));
});
it("fixed assignment requires exactly one executive", () => {
  expect(metaSettingsSchema.safeParse({ organizationId: "00000000-0000-4000-8000-000000000001", defaultStatus: "New Lead", defaultQuality: "Warm", assignmentMode: "fixed", executiveIds: [], duplicateHandling: "flag", notificationsEnabled: true }).success).toBe(false);
});

it("maps real Meta form fields and preserves the original lead time", () => {
  expect(mapMetaLead({ id: "123", created_time: "2026-11-15T10:00:00Z", field_data: [{ name: "full_name", values: ["Test Lead"] }, { name: "phone_number", values: ["+919876543210"] }, { name: "email", values: ["test@example.com"] }] })).toMatchObject({ id: "123", full_name: "Test Lead", phone: "+919876543210", email: "test@example.com", created_time: "2026-11-15T10:00:00.000Z" });
});
it("does not fabricate missing advertising attribution", () => expect(mapMetaLead({ id: "123", created_time: "2026-11-15T10:00:00Z", field_data: [] })).not.toHaveProperty("ad_id"));
it("backs off temporary failures and waits fifteen minutes after rate limits", () => {
  expect(metaRetryDelay(1, false)).toBe(60000);
  expect(metaRetryDelay(2, false)).toBe(120000);
  expect(metaRetryDelay(1, true)).toBe(900000);
});
it("defaults automatic synchronization to disabled", () => expect(metaSettingsSchema.parse({ organizationId: "00000000-0000-4000-8000-000000000001", defaultStatus: "New Lead", defaultQuality: "Warm", assignmentMode: "manual", executiveIds: [], duplicateHandling: "flag", notificationsEnabled: true }).autoSyncEnabled).toBe(false));