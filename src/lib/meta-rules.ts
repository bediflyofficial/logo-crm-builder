import { z } from "zod";

export const metaSettingsSchema = z.object({
  organizationId: z.string().uuid(),
  defaultStatus: z.string().trim().min(1).max(100),
  defaultQuality: z.enum(["Hot", "Warm", "Cold", "Junk"]),
  assignmentMode: z.enum(["manual", "fixed", "round_robin"]),
  executiveIds: z.array(z.string().uuid()).max(100),
  duplicateHandling: z.enum(["keep_separate", "flag"]),
  notificationsEnabled: z.boolean(),
  autoSyncEnabled: z.boolean().default(false),
}).superRefine((value, context) => {
  if (value.assignmentMode === "fixed" && value.executiveIds.length !== 1) {
    context.addIssue({ code: "custom", message: "Choose one sales executive for fixed assignment.", path: ["executiveIds"] });
  }
  if (value.assignmentMode === "round_robin" && value.executiveIds.length === 0) {
    context.addIssue({ code: "custom", message: "Choose sales executives for round-robin assignment.", path: ["executiveIds"] });
  }
});

export function canSendMetaConversion(input: { enabled: boolean; eligible: boolean; eventAccepted: boolean; latestAccepted: boolean; withdrawn: boolean; matchingAccepted: boolean; globalPrivacyControl: boolean }) {
  return input.enabled && input.eligible && input.eventAccepted && input.latestAccepted && !input.withdrawn && input.matchingAccepted && !input.globalPrivacyControl;
}

export const webhookSchema = z.object({
  object: z.literal("page"),
  entry: z.array(z.object({
    id: z.string().regex(/^\d+$/).max(100),
    changes: z.array(z.object({ field: z.string().max(100), value: z.record(z.string(), z.unknown()) })).max(100),
  })).max(100),
});

export function extractLeadNotifications(input: unknown) {
  const payload = webhookSchema.parse(input);
  const notifications: { leadgen_id: string; page_id: string; form_id: string }[] = [];
  const idSchema = z.string().regex(/^\d+$/).max(100);
  for (const entry of payload.entry) for (const change of entry.changes) {
    if (change.field !== "leadgen") continue;
    const lead = idSchema.parse(change.value["leadgen_id"]);
    const form = idSchema.parse(change.value["form_id"]);
    const page = idSchema.parse(change.value["page_id"] ?? entry.id);
    notifications.push({ leadgen_id: lead, page_id: page, form_id: form });
  }
  return [...new Map(notifications.map((item) => [item.leadgen_id, item])).values()];
}

export const metaLeadSchema = z.object({ id: z.string().regex(/^\d+$/), created_time: z.string().refine((value) => Number.isFinite(Date.parse(value))), field_data: z.array(z.object({ name: z.string().max(200), values: z.array(z.string().max(10000)).max(100) })).max(200), ad_id: z.string().regex(/^\d+$/).optional(), form_id: z.string().regex(/^\d+$/).optional() });

export function mapMetaLead(input: unknown) {
  const lead = metaLeadSchema.parse(input);
  const fields = new Map(lead.field_data.map((field) => [field.name.toLowerCase(), field.values[0] ?? ""]));
  return { id: lead.id, created_time: new Date(lead.created_time).toISOString(), full_name: fields.get("full_name") || [fields.get("first_name"), fields.get("last_name")].filter(Boolean).join(" ") || "Unnamed Meta lead", phone: fields.get("phone_number") ?? "", email: fields.get("email") ?? "", city: fields.get("city") ?? "", state: fields.get("state") ?? "", country: fields.get("country") ?? "", ...(lead.ad_id ? { ad_id: lead.ad_id } : {}) };
}

export function metaRetryDelay(attempt: number, rateLimited: boolean) {
  return rateLimited ? 15 * 60_000 : Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt - 1));
}