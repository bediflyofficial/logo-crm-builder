import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Enter a valid calendar date.");

export const metaAnalyticsQuerySchema = z.object({
  organizationId: z.string().uuid().nullable(),
  from: dateSchema,
  to: dateSchema,
  eventName: z.enum(["all", "QualifiedLead", "Purchase"]).default("all"),
  environment: z.enum(["production", "test", "all"]).default("production"),
}).superRefine((value, context) => {
  const from = Date.parse(`${value.from}T00:00:00.000Z`);
  const to = Date.parse(`${value.to}T00:00:00.000Z`);
  if (from > to) context.addIssue({ code: "custom", path: ["to"], message: "The end date must be on or after the start date." });
  if (to - from >= 366 * 86_400_000) context.addIssue({ code: "custom", path: ["to"], message: "Choose a date range of 366 days or fewer." });
});

const metricsSchema = z.object({
  eventsCreated: z.number().int().nonnegative(),
  pending: z.number().int().nonnegative(),
  delivered: z.number().int().nonnegative(),
  blocked: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  manualReview: z.number().int().nonnegative(),
});

const ratesSchema = z.object({
  deliverySuccessRate: z.number().min(0).max(100).nullable(),
  failureRate: z.number().min(0).max(100).nullable(),
});

export const metaAnalyticsSchema = z.object({
  summary: metricsSchema.extend(ratesSchema.shape).extend({
    qualifiedLead: z.number().int().nonnegative(),
    purchase: z.number().int().nonnegative(),
    productionEvents: z.number().int().nonnegative(),
    testEvents: z.number().int().nonnegative(),
  }),
  byType: z.array(metricsSchema.extend({
    eventName: z.enum(["QualifiedLead", "Purchase"]),
    environment: z.enum(["production", "test"]),
  })),
  trend: z.array(z.object({
    date: dateSchema,
    qualifiedLead: z.number().int().nonnegative(),
    purchase: z.number().int().nonnegative(),
    pending: z.number().int().nonnegative(),
    delivered: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
  })),
  workspaces: z.array(metricsSchema.extend(ratesSchema.shape).extend({
    organizationId: z.string().uuid(),
    organizationName: z.string(),
  })),
});

export type MetaAnalytics = z.infer<typeof metaAnalyticsSchema>;
export type MetaAnalyticsQuery = z.infer<typeof metaAnalyticsQuerySchema>;

/** Inclusive UTC calendar dates; the backend converts the end to an exclusive timestamp. */
export function analyticsDateRange(days: number, now = new Date()) {
  const to = now.toISOString().slice(0, 10);
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1))).toISOString().slice(0, 10);
  return { from, to };
}

export function analyticsToExclusive(to: string) {
  return new Date(Date.parse(`${to}T00:00:00.000Z`) + 86_400_000).toISOString();
}

export function analyticsIsEmpty(analytics: MetaAnalytics) {
  return analytics.summary.eventsCreated === 0 && analytics.byType.length === 0 && analytics.trend.length === 0;
}
