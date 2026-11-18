import { describe, expect, it } from "vitest";
import {
  latestMetaConsent,
  metaConsentBlockReason,
  metaConsentSchema,
  metaConsentWithdrawalSchema,
  metaOutcomeReference,
  shouldEnqueueMetaConversion,
  type MetaConsentRecord,
} from "@/lib/meta-consent";

const WORKSPACE = "11111111-1111-4111-8111-111111111111";
const LEAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const input = {
  organizationId: WORKSPACE,
  leadId: LEAD,
  advertisingAccepted: true,
  matchingAccepted: true,
  noticeVersion: "Privacy Notice v1",
  evidenceReference: "form-123",
  region: "IN",
  consentSource: "customer_form",
  globalPrivacyControl: false,
};

function consent(overrides: Partial<MetaConsentRecord> = {}): MetaConsentRecord {
  return {
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    organization_id: WORKSPACE,
    lead_id: LEAD,
    advertising_accepted: true,
    matching_accepted: true,
    notice_version: "Privacy Notice v1",
    evidence_reference: "form-123",
    region: "IN",
    recorded_at: "2026-11-18T10:00:00Z",
    withdrawn_at: null,
    consent_source: "customer_form",
    global_privacy_control: false,
    recorded_by: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    ...overrides,
  };
}

describe("consent evidence and event gating", () => {
  it("blocks a lead with no consent evidence", () =>
    expect(metaConsentBlockReason(null)).toBe("consent_missing"));
  it("accepts advertising and matching consent independently recorded", () =>
    expect(metaConsentBlockReason(consent())).toBeNull());
  it("blocks withdrawn consent", () =>
    expect(metaConsentBlockReason(consent({ withdrawn_at: "2026-11-18T11:00:00Z" }))).toBe(
      "consent_withdrawn",
    ));
  it("blocks matching identifiers when matching consent is refused", () =>
    expect(metaConsentBlockReason(consent({ matching_accepted: false }))).toBe(
      "matching_consent_required",
    ));
  it("blocks advertising consent refusal", () =>
    expect(metaConsentBlockReason(consent({ advertising_accepted: false }))).toBe(
      "advertising_consent_required",
    ));
  it("gives Global Privacy Control priority over saved acceptance", () =>
    expect(metaConsentBlockReason(consent({ global_privacy_control: true }))).toBe(
      "global_privacy_control",
    ));
  it("rejects acceptance recorded together with Global Privacy Control", () => {
    expect(metaConsentSchema.safeParse({ ...input, globalPrivacyControl: true }).success).toBe(
      false,
    );
    expect(
      metaConsentSchema.safeParse({
        ...input,
        advertisingAccepted: false,
        matchingAccepted: false,
        globalPrivacyControl: true,
        consentSource: "global_privacy_control",
      }).success,
    ).toBe(true);
  });
  it("requires resolvable evidence for both consent and withdrawal", () => {
    expect(metaConsentSchema.safeParse({ ...input, evidenceReference: "" }).success).toBe(false);
    expect(metaConsentWithdrawalSchema.safeParse({ ...input, evidenceReference: "" }).success).toBe(
      false,
    );
    expect(metaConsentWithdrawalSchema.safeParse(input).success).toBe(true);
  });
  it("uses the latest choice for withdrawal and privacy checks", () => {
    const earlier = consent({
      id: "00000000-0000-4000-8000-000000000001",
      recorded_at: "2026-11-18T09:00:00Z",
    });
    const later = consent({
      id: "00000000-0000-4000-8000-000000000002",
      recorded_at: "2026-11-18T11:00:00Z",
      withdrawn_at: "2026-11-18T11:00:00Z",
    });
    expect(latestMetaConsent([earlier, later], LEAD)).toEqual(later);
    expect(metaConsentBlockReason(latestMetaConsent([earlier, later], LEAD))).toBe(
      "consent_withdrawn",
    );
  });
});

describe("transactional trigger decision and stable deduplication", () => {
  it("enqueues on creation and actual status or quality changes", () => {
    expect(shouldEnqueueMetaConversion(null, { status: "Qualified", quality: "Warm" })).toBe(true);
    expect(
      shouldEnqueueMetaConversion(
        { status: "New Lead", quality: "Warm" },
        { status: "Qualified", quality: "Warm" },
      ),
    ).toBe(true);
    expect(
      shouldEnqueueMetaConversion(
        { status: "New Lead", quality: "Warm" },
        { status: "New Lead", quality: "Hot" },
      ),
    ).toBe(true);
  });
  it("does not enqueue when an update leaves status and quality unchanged", () => {
    expect(
      shouldEnqueueMetaConversion(
        { status: "Qualified", quality: "Warm" },
        { status: "Qualified", quality: "Warm" },
      ),
    ).toBe(false);
  });
  it("keeps one stable outcome reference across repeated status changes", () => {
    const first = metaOutcomeReference(LEAD);
    expect(
      shouldEnqueueMetaConversion(
        { status: "Qualified", quality: "Warm" },
        { status: "Contacted", quality: "Warm" },
      ),
    ).toBe(true);
    expect(metaOutcomeReference(LEAD)).toBe(first);
    expect(first).toBe(`lead:${LEAD}`);
  });
});
