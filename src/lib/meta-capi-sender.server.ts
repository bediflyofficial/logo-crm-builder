import { createHash } from "node:crypto";
import { z } from "zod";
import { MetaApiError, metaRequest } from "@/lib/meta-api.server";

export const CAPI_MAX_ATTEMPTS = 8;

export class CapiDispatchError extends Error {
  constructor(public reason: string) { super(reason); }
}

export type CapiEvent = {
  id: string; organization_id: string; lead_id: string; event_name: string;
  occurred_at: string; action_source: string; value: number | null; currency: string | null;
  status: string; sent_dataset_id: string | null; test_event: boolean;
  attempts: number; lease_token: string | null;
};
export type CapiCredentials = { datasetId: string; token: string };
export type CapiMatching = { email: string | null; phone: string | null };
export type CapiFailureKind = "temporary" | "permanent" | "uncertain";
export type CapiTransmit = (credentials: CapiCredentials, payload: ReturnType<typeof buildCapiPayload>, testEventCode?: string) => Promise<number>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Never infer a phone country code from a workspace or salesperson's location. */
export function normalizeMetaPhone(value: string | null) {
  if (!value || !/^\+[\d\s().-]+$/.test(value.trim())) return null;
  const digits = value.replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function buildCapiPayload(event: CapiEvent, matching: CapiMatching, now = Date.now()) {
  const time = Math.floor(Date.parse(event.occurred_at) / 1000);
  if (!Number.isFinite(time) || time > Math.floor(now / 1000) || time < Math.floor(now / 1000) - 7 * 86400) throw new CapiDispatchError("event_time_invalid");
  if (!["QualifiedLead", "Purchase"].includes(event.event_name)) throw new CapiDispatchError("event_name_invalid");
  if (event.action_source !== "system_generated") throw new CapiDispatchError("action_source_invalid");
  const email = matching.email?.trim().toLowerCase();
  const phone = normalizeMetaPhone(matching.phone);
  const user_data = {
    ...(email && z.string().email().safeParse(email).success ? { em: [hash(email)] } : {}),
    ...(phone ? { ph: [hash(phone)] } : {}),
  };
  if (!Object.keys(user_data).length) throw new CapiDispatchError("matching_data_missing");
  let custom_data: { value: number; currency: string } | undefined;
  if (event.event_name === "Purchase") {
    if (event.value === null || !Number.isFinite(event.value) || event.value < 0) throw new CapiDispatchError("purchase_value_required");
    if (!event.currency || !/^[A-Z]{3}$/.test(event.currency) || !Intl.supportedValuesOf("currency").includes(event.currency)) throw new CapiDispatchError("purchase_currency_required");
    custom_data = { value: event.value, currency: event.currency };
  }
  return { event_name: event.event_name, event_time: time, event_id: event.id, action_source: "system_generated", user_data, ...(custom_data ? { custom_data } : {}) };
}

export async function transmitCapiEvent(credentials: CapiCredentials, payload: ReturnType<typeof buildCapiPayload>, testEventCode?: string) {
  const response = await metaRequest(`${credentials.datasetId}/events`, credentials.token, {
    data: JSON.stringify([payload]), partner_agent: "lovable", ...(testEventCode ? { test_event_code: testEventCode } : {}),
  }, "POST");
  const parsed = z.object({ events_received: z.literal(1) }).safeParse(response);
  if (!parsed.success) throw new CapiDispatchError("meta_response_unconfirmed");
  return parsed.data.events_received;
}

function isRateLimit(error: MetaApiError) {
  return error.status === 429 || [4, 17, 32, 613].includes(error.code ?? 0);
}

export function capiFailureCode(error: unknown) {
  if (error instanceof CapiDispatchError) return error.reason;
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) return "meta_timeout";
  if (error instanceof MetaApiError) {
    if (error.code === 190) return "meta_token_invalid";
    if (error.code === 200 || error.code === 10) return "meta_permission_denied";
    if (isRateLimit(error)) return "meta_rate_limited";
    if (error.status >= 500) return "meta_unavailable";
    return "meta_payload_rejected";
  }
  return "transmission_unconfirmed";
}

export function capiFailureKind(error: unknown): CapiFailureKind {
  if (error instanceof MetaApiError) {
    if (isRateLimit(error) || error.status === 408 || error.status >= 500 || [1, 2].includes(error.code ?? 0)) return "temporary";
    return "permanent";
  }
  if (error instanceof CapiDispatchError) return error.reason === "meta_response_unconfirmed" ? "uncertain" : "permanent";
  return "uncertain";
}

/** Only confirmed temporary provider failures retry automatically; uncertain outcomes need review. */
export function automaticRetryDelaySeconds(attempts: number, kind: CapiFailureKind, rateLimited = false) {
  if (kind !== "temporary" || attempts < 1 || attempts >= CAPI_MAX_ATTEMPTS) return null;
  const base = rateLimited ? 300 : 60;
  const cap = rateLimited ? 21_600 : 3_600;
  return Math.min(cap, base * 2 ** (attempts - 1));
}

export interface CapiDispatchStore {
  reserve(organizationId: string, eventId: string, testEvent: boolean): Promise<CapiEvent | null>;
  claim(limit: number): Promise<CapiEvent[]>;
  credentials(event: CapiEvent): Promise<CapiCredentials>;
  matching(event: CapiEvent): Promise<CapiMatching>;
  preflight(event: CapiEvent, credentials: CapiCredentials, testEvent: boolean): Promise<boolean>;
  finish(event: CapiEvent, status: "sent" | "blocked" | "failed", code: string | null, received?: number, failure?: { kind: CapiFailureKind; retryDelaySeconds: number | null }): Promise<void>;
}

/** Dispatches an event already claimed by the database; no second reservation is made. */
export async function dispatchReservedCapiEvent(store: CapiDispatchStore, event: CapiEvent, transmit: CapiTransmit = transmitCapiEvent, testEventCode?: string) {
  const testEvent = Boolean(testEventCode);
  try {
    if (event.test_event !== testEvent) throw new CapiDispatchError("delivery_mode_mismatch");
    const credentials = await store.credentials(event);
    if (!credentials.token || credentials.datasetId !== event.sent_dataset_id) throw new CapiDispatchError("configuration_changed");
    // Check workspace, Dataset and permission before reading any customer matching fields.
    if (!await store.preflight(event, credentials, testEvent)) throw new CapiDispatchError("consent_or_configuration_blocked");
    const payload = buildCapiPayload(event, await store.matching(event));
    // Last awaited operation before POST rechecks original/latest consent and configuration.
    if (!await store.preflight(event, credentials, testEvent)) throw new CapiDispatchError("consent_or_configuration_blocked");
    const received = await transmit(credentials, payload, testEventCode);
    if (received !== 1) throw new CapiDispatchError("meta_response_unconfirmed");
    try { await store.finish(event, "sent", null, received); }
    catch { return { status: "receipt_persistence_failed", eventsReceived: received, errorCode: "receipt_persistence_failed" }; }
    return { status: "sent", eventsReceived: received };
  } catch (error) {
    const code = capiFailureCode(error);
    const kind = capiFailureKind(error);
    const status = error instanceof CapiDispatchError && code !== "meta_response_unconfirmed" ? "blocked" : "failed";
    const retryDelaySeconds = status === "failed" ? automaticRetryDelaySeconds(event.attempts, kind, code === "meta_rate_limited") : null;
    try {
      await store.finish(event, status, code, 0, { kind, retryDelaySeconds });
    } catch {
      return { status: "failure_persistence_failed", eventsReceived: 0, errorCode: "failure_persistence_failed" };
    }
    return { status, eventsReceived: 0, errorCode: code };
  }
}

export async function dispatchCapiEvent(store: CapiDispatchStore, organizationId: string, eventId: string, transmit: CapiTransmit = transmitCapiEvent, testEventCode?: string) {
  const testEvent = Boolean(testEventCode);
  const event = await store.reserve(organizationId, eventId, testEvent);
  if (!event) return { status: "not_eligible", eventsReceived: 0 };
  if (event.organization_id !== organizationId || event.id !== eventId) throw new CapiDispatchError("workspace_mismatch");
  return dispatchReservedCapiEvent(store, event, transmit, testEventCode);
}
