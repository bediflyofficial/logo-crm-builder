import { describe, expect, it } from "vitest";
import { analyticsDateRange, analyticsIsEmpty, analyticsToExclusive, metaAnalyticsQuerySchema, metaAnalyticsSchema, type MetaAnalytics } from "@/lib/meta-analytics";

const ORG = "11111111-1111-4111-8111-111111111111";
const empty: MetaAnalytics = {
  summary: { eventsCreated: 0, pending: 0, delivered: 0, blocked: 0, failed: 0, manualReview: 0, qualifiedLead: 0, purchase: 0, productionEvents: 0, testEvents: 0, deliverySuccessRate: null, failureRate: null },
  byType: [], trend: [], workspaces: [],
};

describe("Phase 5 analytics date filters", () => {
  it("builds inclusive 7, 30 and 90 day UTC ranges", () => {
    const now = new Date("2026-11-18T12:00:00.000Z");
    expect(analyticsDateRange(7, now)).toEqual({ from: "2026-11-12", to: "2026-11-18" });
    expect(analyticsDateRange(30, now)).toEqual({ from: "2026-10-20", to: "2026-11-18" });
    expect(analyticsDateRange(90, now)).toEqual({ from: "2026-08-21", to: "2026-11-18" });
  });

  it("turns the inclusive end date into an exclusive backend boundary", () => {
    expect(analyticsToExclusive("2026-11-18")).toBe("2026-11-19T00:00:00.000Z");
  });

  it("rejects reversed, impossible and overlong ranges", () => {
    expect(metaAnalyticsQuerySchema.safeParse({ organizationId: ORG, from: "2026-11-18", to: "2026-11-17", eventName: "all", environment: "production" }).success).toBe(false);
    expect(metaAnalyticsQuerySchema.safeParse({ organizationId: ORG, from: "2026-02-30", to: "2026-11-17", eventName: "all", environment: "production" }).success).toBe(false);
    expect(metaAnalyticsQuerySchema.safeParse({ organizationId: ORG, from: "2025-11-17", to: "2026-11-18", eventName: "all", environment: "production" }).success).toBe(false);
  });

  it("accepts a 366-day range and all supported event/mode filters", () => {
    expect(metaAnalyticsQuerySchema.safeParse({ organizationId: null, from: "2025-11-19", to: "2026-11-18", eventName: "all", environment: "all" }).success).toBe(true);
    expect(metaAnalyticsQuerySchema.safeParse({ organizationId: ORG, from: "2026-11-01", to: "2026-11-18", eventName: "QualifiedLead", environment: "test" }).success).toBe(true);
    expect(metaAnalyticsQuerySchema.safeParse({ organizationId: ORG, from: "2026-11-01", to: "2026-11-18", eventName: "Purchase", environment: "production" }).success).toBe(true);
  });
});

describe("Phase 5 analytics response safety and empty state", () => {
  it("recognizes an empty analytics result with undefined rates", () => {
    expect(metaAnalyticsSchema.parse(empty)).toEqual(empty);
    expect(analyticsIsEmpty(empty)).toBe(true);
    expect(empty.summary.deliverySuccessRate).toBeNull();
    expect(empty.summary.failureRate).toBeNull();
  });

  it("does not treat zero-filled trend rows as an empty result", () => {
    const populated = { ...empty, trend: [{ date: "2026-11-18", qualifiedLead: 0, purchase: 0, pending: 0, delivered: 0, blocked: 0, failed: 0 }] };
    expect(analyticsIsEmpty(populated)).toBe(false);
  });

  it("strips unexpected fields instead of forwarding provider or customer data", () => {
    const parsed = metaAnalyticsSchema.parse({ ...empty, rawProviderResponse: "secret", customerEmail: "person@example.com" });
    expect(parsed).not.toHaveProperty("rawProviderResponse");
    expect(parsed).not.toHaveProperty("customerEmail");
  });
});
