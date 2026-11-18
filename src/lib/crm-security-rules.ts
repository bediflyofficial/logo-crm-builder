import { z } from "zod";

export const SECURITY_ACTIONS = [
  "generate-recovery-codes",
  "recover-mfa",
  "retention-overview",
  "retention-dry-run",
  "retention-execute",
  "set-retention-automatic",
  "set-retention-hold",
] as const;
export type SecurityAction = (typeof SECURITY_ACTIONS)[number];

export const RETENTION_APPROVAL_PHRASE = "DELETE EXPIRED RECORDS";
export const RETENTION_PERIODS = {
  deliveryHistory: { months: 13, label: "Delivery history" },
  conversionEvents: { months: 25, label: "Conversion events" },
  incomingMetaData: { days: 90, label: "Incoming Meta data" },
} as const;

export type MfaRequirement = "not_required" | "enroll" | "challenge" | "ready";

/** Mirrors the enrollment-grace and subsequent-session rules enforced by the database. */
export function resolveSuperAdminMfa(input: {
  isPlatformAdmin: boolean;
  currentLevel: "aal1" | "aal2" | null;
  verifiedFactorCount: number;
}): MfaRequirement {
  if (!input.isPlatformAdmin) return "not_required";
  if (input.currentLevel === "aal2") return "ready";
  return input.verifiedFactorCount > 0 ? "challenge" : "enroll";
}

export function canPlatformAdminAccess(input: {
  hasPlatformRole: boolean;
  currentLevel: "aal1" | "aal2" | null;
  verifiedFactorCount: number;
}): boolean {
  return input.hasPlatformRole && (input.currentLevel === "aal2" || input.verifiedFactorCount === 0);
}

export function normalizeRecoveryCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function isValidRecoveryCode(value: string): boolean {
  return /^BDY[A-Z2-9]{20}$/.test(normalizeRecoveryCode(value));
}

export function formatRecoveryCode(value: string): string {
  const normalized = normalizeRecoveryCode(value);
  if (!isValidRecoveryCode(normalized)) return value;
  return [normalized.slice(0, 3), ...Array.from({ length: 4 }, (_, index) => normalized.slice(3 + index * 5, 8 + index * 5))].join("-");
}

export const recoveryCodeInput = z.object({ code: z.string().max(80) }).refine((value) => isValidRecoveryCode(value.code), { message: "Enter a valid Bedifly recovery code." });
export const retentionOrganizationInput = z.object({ organizationId: z.string().uuid() });
export const retentionExecuteInput = retentionOrganizationInput.extend({ approvalPhrase: z.literal(RETENTION_APPROVAL_PHRASE) });
export const retentionAutomaticInput = retentionOrganizationInput.extend({ enabled: z.boolean(), approvalPhrase: z.string().max(80).default("") });
export const retentionHoldInput = retentionOrganizationInput.extend({ hold: z.boolean(), reason: z.string().trim().max(500).default("") });

export type RetentionCategory = "deliveryHistory" | "conversionEvents" | "incomingMetaData";
export type RetentionCounts = Record<RetentionCategory, number>;
export type RetentionCandidate = { id: string; timestamp: string };
export type RetentionRunResult = {
  organizationId: string;
  dryRun: boolean;
  legalHold: boolean;
  cutoffs: Record<RetentionCategory, string>;
  candidates: Record<RetentionCategory, RetentionCandidate[]>;
  candidateCounts: RetentionCounts;
  deletedCounts: RetentionCounts;
  protected: string[];
};

export const retentionRunResultSchema = z.object({
  organizationId: z.string().uuid(),
  dryRun: z.boolean(),
  legalHold: z.boolean(),
  cutoffs: z.object({ deliveryHistory: z.string(), conversionEvents: z.string(), incomingMetaData: z.string() }),
  candidates: z.object({
    deliveryHistory: z.array(z.object({ id: z.string().uuid(), timestamp: z.string() })),
    conversionEvents: z.array(z.object({ id: z.string().uuid(), timestamp: z.string() })),
    incomingMetaData: z.array(z.object({ id: z.string().uuid(), timestamp: z.string() })),
  }),
  candidateCounts: z.object({ deliveryHistory: z.number(), conversionEvents: z.number(), incomingMetaData: z.number() }),
  deletedCounts: z.object({ deliveryHistory: z.number(), conversionEvents: z.number(), incomingMetaData: z.number() }),
  protected: z.array(z.string()),
}) satisfies z.ZodType<RetentionRunResult>;
