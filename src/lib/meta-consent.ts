import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const META_CONSENT_SOURCES = [
  "crm_manual",
  "customer_form",
  "phone",
  "email",
  "import",
  "api",
  "global_privacy_control",
  "withdrawal",
] as const;

const consentEvidenceFields = {
  organizationId: z.string().uuid(),
  leadId: z.string().uuid(),
  noticeVersion: z
    .string()
    .trim()
    .min(1, "Enter the privacy notice version shown to the customer.")
    .max(100),
  evidenceReference: z
    .string()
    .trim()
    .min(1, "Enter a resolvable consent evidence reference.")
    .max(200),
  region: z.string().trim().min(1, "Enter the customer consent region.").max(100),
  consentSource: z.enum(META_CONSENT_SOURCES),
};

export const metaConsentSchema = z
  .object({
    ...consentEvidenceFields,
    advertisingAccepted: z.boolean(),
    matchingAccepted: z.boolean(),
    globalPrivacyControl: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.globalPrivacyControl && (value.advertisingAccepted || value.matchingAccepted)) {
      context.addIssue({
        code: "custom",
        message: "Global Privacy Control cannot be combined with consent acceptance.",
        path: ["globalPrivacyControl"],
      });
    }
  });

export const metaConsentWithdrawalSchema = z.object({
  ...consentEvidenceFields,
  globalPrivacyControl: z.boolean().default(false),
});

export type MetaConsentRecord = Database["public"]["Tables"]["meta_consent_evidence"]["Row"];
export type MetaConsentLead = Pick<
  Database["public"]["Tables"]["leads"]["Row"],
  "id" | "full_name" | "status" | "quality"
>;
export type MetaConsentListResponse = { leads: MetaConsentLead[]; records: MetaConsentRecord[] };

export type MetaConsentBlockReason =
  | "consent_missing"
  | "global_privacy_control"
  | "consent_withdrawn"
  | "advertising_consent_required"
  | "matching_consent_required";

/** Mirrors the database gate for UI explanations; the database remains authoritative. */
export function metaConsentBlockReason(
  consent: MetaConsentRecord | null | undefined,
): MetaConsentBlockReason | null {
  if (!consent) return "consent_missing";
  if (consent.global_privacy_control) return "global_privacy_control";
  if (consent.withdrawn_at) return "consent_withdrawn";
  if (!consent.advertising_accepted) return "advertising_consent_required";
  if (!consent.matching_accepted) return "matching_consent_required";
  return null;
}

export function latestMetaConsent(records: readonly MetaConsentRecord[], leadId: string) {
  return (
    records
      .filter((record) => record.lead_id === leadId)
      .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at) || b.id.localeCompare(a.id))[0] ??
    null
  );
}

export function shouldEnqueueMetaConversion(
  previous: { status: string; quality: string } | null,
  next: { status: string; quality: string },
) {
  return previous === null || previous.status !== next.status || previous.quality !== next.quality;
}

export function metaOutcomeReference(leadId: string) {
  return `lead:${leadId}`;
}
