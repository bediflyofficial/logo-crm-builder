import type { Database } from "@/integrations/supabase/types";
import type { CapiStatus } from "@/lib/meta-rules";

export const META_ORG_ACTIONS = [
  "save-settings",
  "save-conversion-rule",
  "consent-list",
  "save-consent",
  "withdraw-consent",
  "start-oauth",
  "complete-oauth",
  "refresh-assets",
  "select-asset",
  "disconnect-connection",
  "check-connection",
  "log-oauth-error",
  "capi-config",
  "save-capi",
  "test-capi",
  "send-capi-test",
  "set-capi-enabled",
  "review-dataset-eligibility",
  "send-conversion",
  "send-conversion-test",
  "retry-conversion",
  "disconnect-capi",
] as const;

export const META_PLATFORM_ACTIONS = ["app-status", "test-app", "client-statuses"] as const;
export const META_ACTIONS = ["overview", ...META_ORG_ACTIONS, ...META_PLATFORM_ACTIONS] as const;
export type MetaAction = (typeof META_ACTIONS)[number];

export class MetaApiAuthorizationError extends Error {
  constructor(message: string, public status = 403) {
    super(message);
  }
}

export type MetaAuthorizationCaller = {
  supabase: {
    rpc: (name: "is_org_admin" | "is_platform_admin", args?: { _organization_id: string }) => PromiseLike<{ data: unknown; error: unknown }>;
  };
};

/** Authorization is repeated on the Lovable API for every action, never inferred from the browser UI. */
export async function authorizeMetaAction(
  caller: MetaAuthorizationCaller,
  action: MetaAction,
  organizationId: string | null,
) {
  const platformOnly = action === "overview" && organizationId === null
    || (META_PLATFORM_ACTIONS as readonly string[]).includes(action);
  if (platformOnly) {
    const { data, error } = await caller.supabase.rpc("is_platform_admin");
    if (error || !data) throw new MetaApiAuthorizationError("Only the Bedifly platform administrator can do this.");
    return;
  }
  if (!organizationId) throw new MetaApiAuthorizationError("A client workspace is required.", 400);
  const { data, error } = await caller.supabase.rpc("is_org_admin", { _organization_id: organizationId });
  if (error || !data) throw new MetaApiAuthorizationError("Only an administrator of this workspace can do this.");
}

type ConnectionView = Pick<Database["public"]["Tables"]["meta_connections"]["Row"], "id" | "organization_id" | "facebook_name" | "connection_status" | "token_expires_at" | "last_sync_at" | "granted_permissions">;
type ConversionEventView = Pick<Database["public"]["Tables"]["meta_conversion_events"]["Row"], "id" | "organization_id" | "lead_id" | "consent_id" | "event_name" | "outcome_reference" | "status" | "occurred_at" | "value" | "currency" | "error_code" | "test_event" | "sent_dataset_id" | "provider_received_at" | "provider_events_received" | "attempts" | "next_attempt_at" | "failure_kind" | "last_attempt_at" | "lease_until" | "retry_requested_at">;
type ConversionAttemptView = Pick<Database["public"]["Tables"]["meta_conversion_delivery_attempts"]["Row"], "id" | "event_id" | "organization_id" | "attempt_number" | "status" | "error_code" | "failure_kind" | "dataset_id" | "test_event" | "provider_events_received" | "started_at" | "finished_at">;

export type MetaOverview = {
  connections: ConnectionView[];
  assets: Database["public"]["Tables"]["meta_assets"]["Row"][];
  logs: Database["public"]["Tables"]["meta_sync_logs"]["Row"][];
  events: ConversionEventView[];
  deliveryAttempts: ConversionAttemptView[];
  settings: Database["public"]["Tables"]["meta_integration_settings"]["Row"] | null;
  conversionRules: Database["public"]["Tables"]["meta_conversion_rules"]["Row"][];
  missingConfiguration: string[];
  oauthImplemented: true;
  processorImplemented: true;
};

export type MetaCapiConfigView = {
  datasetId: string;
  hasToken: boolean;
  testEventCode: string;
  enabled: boolean;
  status: CapiStatus;
  lastTestedAt: string | null;
  lastTestEventAt: string | null;
  lastError: string | null;
  updatedAt: string | null;
  datasetEligible: boolean;
  eligibilityReviewedAt: string | null;
};

export type MetaAppStatus = {
  settings: { name: string; configured: boolean }[];
  missing: string[];
  checkedAt: string;
  appIdHint: string | null;
  graphVersion: string | null;
  redirectUri: string | null;
  expectedRedirectUri: string;
  redirectMatches: boolean;
  webhookUrl: string;
  webhookPath: string;
};

export type MetaClientIntegrationStatus = {
  organizationId: string;
  name: string;
  workspaceStatus: string;
  facebook: string;
  facebookName: string | null;
  capiStatus: CapiStatus;
  capiEnabled: boolean;
  datasetId: string | null;
  lastTestEventAt: string | null;
  lastError: string | null;
  events: { sent: number; failed: number; pending: number; blocked: number };
};
