import { describe, expect, it } from "vitest";
import { canEnableCapi, capiConfigSchema, capiStatusAfterSave } from "@/lib/meta-rules";

describe("Conversions API configuration rules", () => {
  it("cannot enable production before a test event succeeds", () => {
    expect(canEnableCapi("connected", true, true)).toBe(false);
    expect(canEnableCapi("configuration_required", true, true)).toBe(false);
    expect(canEnableCapi("connection_error", true, true)).toBe(false);
    expect(canEnableCapi("test_successful", true, true)).toBe(true);
  });
  it("cannot enable without a saved token", () => {
    expect(canEnableCapi("test_successful", true, false)).toBe(false);
  });
  it("saving new credentials requires re-testing", () => {
    expect(capiStatusAfterSave(true, true)).toBe("configuration_required");
    expect(capiStatusAfterSave(false, false)).toBe("not_connected");
  });
  it("rejects non-numeric dataset IDs", () => {
    expect(capiConfigSchema.safeParse({ organizationId: crypto.randomUUID(), datasetId: "abc", testEventCode: "" }).success).toBe(false);
    expect(capiConfigSchema.safeParse({ organizationId: crypto.randomUUID(), datasetId: "123456789012", testEventCode: "TEST1" }).success).toBe(true);
  });
});
