import { createHash } from "node:crypto";
import { z } from "zod";
import { MetaApiError, metaRequest } from "@/lib/meta-api.server";

export class CapiDispatchError extends Error {
  constructor(public reason: string) { super(reason); }
}

export type CapiEvent = {
  id: string; organization_id: string; lead_id: string; event_name: string;
  occurred_at: string; action_source: string; value: number | null; currency: string | null;
  status: string; sent_dataset_id: string | null;
};
export type CapiCredentials = { datasetId: string; token: string };
export type CapiMatching = { email: string | null; phone: string | null };
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

export function capiFailureCode(error: unknown) {
  if (error instanceof CapiDispatchError) return error.reason;
  if (error instanceof MetaApiError) return error.code === 190 ? "meta_token_invalid" : error.code === 200 || error.code === 10 ? "meta_permission_denied" : error.status === 429 ? "meta_rate_limited" : error.status >= 500 ? "meta_unavailable" : "meta_payload_rejected";
  return "transmission_unconfirmed";
}

export interface CapiDispatchStore {
  reserve(organizationId: string, eventId: string): Promise<CapiEvent | null>;
  credentials(event: CapiEvent): Promise<CapiCredentials>;
  matching(event: CapiEvent): Promise<CapiMatching>;
  preflight(event: CapiEvent, credentials: CapiCredentials): Promise<boolean>;
  finish(event: CapiEvent, status: "sent" | "blocked" | "failed", code: string | null, received?: number): Promise<void>;
}

/** A single explicit dispatch, not a worker: uncertain results are never automatically replayed. */
export async function dispatchCapiEvent(store: CapiDispatchStore, organizationId: string, eventId: string, transmit: (credentials: CapiCredentials, payload: ReturnType<typeof buildCapiPayload>) => Promise<number> = transmitCapiEvent) {
  const event = await store.reserve(organizationId, eventId);
  if (!event) return { status: "not_eligible", eventsReceived: 0 };
  if (event.organization_id !== organizationId || event.id !== eventId) throw new CapiDispatchError("workspace_mismatch");
  try {
    const credentials = await store.credentials(event);
    if (!credentials.token || credentials.datasetId !== event.sent_dataset_id) throw new CapiDispatchError("configuration_changed");
    // Check permission before reading any customer matching fields.
    if (!await store.preflight(event, credentials)) throw new CapiDispatchError("consent_or_configuration_blocked");
    const payload = buildCapiPayload(event, await store.matching(event));
    // Last awaited operation before POST rechecks original/latest consent and configuration.
    if (!await store.preflight(event, credentials)) throw new CapiDispatchError("consent_or_configuration_blocked");
    const received = await transmit(credentials, payload);
    if (received !== 1) throw new CapiDispatchError("meta_response_unconfirmed");
    try { await store.finish(event, "sent", null, received); }
    catch { return { status: "receipt_persistence_failed", eventsReceived: received, errorCode: "receipt_persistence_failed" }; }
    return { status: "sent", eventsReceived: received };
  } catch (error) {
    const code = capiFailureCode(error);
    const status = error instanceof CapiDispatchError && code !== "meta_response_unconfirmed" ? "blocked" : "failed";
    await store.finish(event, status, code);
    return { status, eventsReceived: 0, errorCode: code };
  }
}