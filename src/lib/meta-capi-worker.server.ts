import { capiDispatchStore } from "@/lib/meta-capi-store.server";
import { dispatchReservedCapiEvent, transmitCapiEvent, type CapiDispatchStore, type CapiTransmit } from "@/lib/meta-capi-sender.server";

/** One event per invocation stays within the scheduled request's short runtime and outbound budget. */
export async function processMetaConversionJobs(
  store: CapiDispatchStore = capiDispatchStore,
  transmit: CapiTransmit = transmitCapiEvent,
) {
  const events = await store.claim(1);
  const results = [];
  for (const event of events) results.push(await dispatchReservedCapiEvent(store, event, transmit));
  return {
    claimed: events.length,
    sent: results.filter((result) => result.status === "sent").length,
    failed: results.filter((result) => ["failed", "failure_persistence_failed", "receipt_persistence_failed"].includes(result.status)).length,
    blocked: results.filter((result) => result.status === "blocked").length,
  };
}
