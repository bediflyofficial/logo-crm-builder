import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, CalendarDays, ChartNoAxesCombined, ExternalLink, LoaderCircle, RefreshCw } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { callMetaApi } from "@/lib/meta-api-client";
import { analyticsDateRange, analyticsIsEmpty, metaAnalyticsQuerySchema, type MetaAnalytics } from "@/lib/meta-analytics";

const trendConfig = {
  qualifiedLead: { label: "QualifiedLead created", color: "var(--chart-1)" },
  purchase: { label: "Purchase created", color: "var(--chart-2)" },
  delivered: { label: "Delivered", color: "var(--chart-3)" },
};
const outcomeConfig = {
  delivered: { label: "Delivered", color: "var(--chart-2)" },
  failed: { label: "Failed", color: "var(--chart-5)" },
  blocked: { label: "Blocked", color: "var(--chart-4)" },
  pending: { label: "Pending", color: "var(--chart-1)" },
};
const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";

function Rate({ value }: { value: number | null }) {
  return value === null ? <span>—</span> : <span>{value.toFixed(1)}%</span>;
}

export function MetaConversionAnalytics({ organizationId, onOpenWorkspace }: { organizationId: string | null; onOpenWorkspace?: ((id: string) => void) | undefined }) {
  const initial = analyticsDateRange(30);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [filters, setFilters] = useState({ ...initial, eventName: "all" as const, environment: "production" as const });
  const query = useQuery({
    queryKey: ["meta-conversion-analytics", organizationId, filters],
    queryFn: () => callMetaApi<MetaAnalytics>("conversion-analytics", { organizationId, ...filters }),
    retry: false,
  });

  function choosePeriod(days: number) {
    const range = analyticsDateRange(days);
    setFrom(range.from);
    setTo(range.to);
    setFilters((current) => ({ ...current, ...range }));
  }

  function applyDates() {
    const parsed = metaAnalyticsQuerySchema.safeParse({ organizationId, ...filters, from, to });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Choose a valid date range.");
      return;
    }
    setFilters((current) => ({ ...current, from, to }));
  }

  const analytics = query.data;
  return <section className="space-y-5 rounded-md border border-border bg-card p-5" aria-labelledby="conversion-analytics-title">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 id="conversion-analytics-title" className="flex items-center gap-2 font-semibold"><BarChart3 className="size-4 text-primary" />Conversion analytics</h3>
        <p className="mt-1 text-sm text-muted-foreground">{organizationId ? "This workspace only" : "All client workspaces"} · Event creation dates use UTC.</p>
      </div>
      <a href="#conversion-events" className="inline-flex items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">Delivery monitoring<ExternalLink className="size-3" /></a>
    </div>

    <div className="grid gap-4 border-y border-border py-4 lg:grid-cols-[1fr_auto]">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5"><Label htmlFor="analytics-from">From</Label><Input id="analytics-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
        <div className="grid gap-1.5"><Label htmlFor="analytics-to">To</Label><Input id="analytics-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
        <Button variant="outline" onClick={applyDates}><CalendarDays className="size-4" />Apply dates</Button>
        <div className="flex gap-1" aria-label="Quick date filters">{[7, 30, 90].map((days) => <Button key={days} size="sm" variant="ghost" onClick={() => choosePeriod(days)}>{days} days</Button>)}</div>
      </div>
      <div className="flex flex-wrap gap-3">
        <label className="grid gap-1.5 text-sm">Event type<select aria-label="Analytics event type" className={selectClass} value={filters.eventName} onChange={(event) => setFilters((current) => ({ ...current, eventName: event.target.value as typeof current.eventName }))}><option value="all">QualifiedLead + Purchase</option><option value="QualifiedLead">QualifiedLead</option><option value="Purchase">Purchase</option></select></label>
        <label className="grid gap-1.5 text-sm">Delivery mode<select aria-label="Analytics delivery mode" className={selectClass} value={filters.environment} onChange={(event) => setFilters((current) => ({ ...current, environment: event.target.value as typeof current.environment }))}><option value="production">Production events</option><option value="test">Meta Test Events</option><option value="all">Production + test</option></select></label>
      </div>
    </div>

    {query.isPending ? <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Calculating conversion analytics</p> : query.error ? <div role="alert" className="text-sm text-destructive">{query.error.message}<Button className="ml-3" size="sm" variant="outline" onClick={() => void query.refetch()}><RefreshCw className="size-4" />Retry</Button></div> : analytics && <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>{analytics.summary.productionEvents} production · {analytics.summary.testEvents} test events in this view</span>{filters.environment !== "production" && <span className="rounded-md border border-accent bg-accent/20 px-2 py-1 text-accent-foreground">Test receipts are not production delivery</span>}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Events created", analytics.summary.eventsCreated],
          ["QualifiedLead", analytics.summary.qualifiedLead],
          ["Purchase", analytics.summary.purchase],
          ["Pending / processing", analytics.summary.pending],
          ["Delivered", analytics.summary.delivered],
          ["Blocked", analytics.summary.blocked],
          ["Failed", analytics.summary.failed],
          ["Manual review", analytics.summary.manualReview],
        ].map(([label, value]) => <div key={label} className="border-l-2 border-border pl-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border p-4"><p className="text-xs text-muted-foreground">Delivery success rate</p><p className="mt-2 text-2xl font-semibold text-primary"><Rate value={analytics.summary.deliverySuccessRate} /></p><p className="mt-1 text-xs text-muted-foreground">Delivered ÷ delivered + failed</p></div>
        <div className="rounded-md border border-border p-4"><p className="text-xs text-muted-foreground">Failure rate</p><p className="mt-2 text-2xl font-semibold"><Rate value={analytics.summary.failureRate} /></p><p className="mt-1 text-xs text-muted-foreground">Pending and blocked events are excluded</p></div>
      </div>

      {analyticsIsEmpty(analytics) ? <div className="py-12 text-center"><ChartNoAxesCombined className="mx-auto size-8 text-muted-foreground" /><h4 className="mt-3 text-sm font-semibold">No conversion events in this period</h4><p className="mt-2 text-sm text-muted-foreground">Try another date range, event type, or delivery mode. No customer data has been exposed.</p></div> : <>
        <div className="grid gap-5 xl:grid-cols-2">
          <div><h4 className="text-sm font-semibold">Creation and delivery trend</h4><ChartContainer config={trendConfig} className="mt-3 h-[280px] w-full"><LineChart data={analytics.trend}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(value: string) => value.slice(5)} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} /><Line type="monotone" dataKey="qualifiedLead" stroke="var(--color-qualifiedLead)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="purchase" stroke="var(--color-purchase)" strokeWidth={2} dot={false} /><Line type="monotone" dataKey="delivered" stroke="var(--color-delivered)" strokeWidth={2} dot={false} /></LineChart></ChartContainer></div>
          <div><h4 className="text-sm font-semibold">Daily delivery outcomes</h4><ChartContainer config={outcomeConfig} className="mt-3 h-[280px] w-full"><BarChart data={analytics.trend}><CartesianGrid vertical={false} /><XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(value: string) => value.slice(5)} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} /><ChartTooltip content={<ChartTooltipContent />} /><ChartLegend content={<ChartLegendContent />} /><Bar dataKey="delivered" fill="var(--color-delivered)" stackId="outcomes" /><Bar dataKey="failed" fill="var(--color-failed)" stackId="outcomes" /><Bar dataKey="blocked" fill="var(--color-blocked)" stackId="outcomes" /><Bar dataKey="pending" fill="var(--color-pending)" stackId="outcomes" radius={[3, 3, 0, 0]} /></BarChart></ChartContainer></div>
        </div>

        <div className="overflow-x-auto"><h4 className="mb-2 text-sm font-semibold">Event type and date breakdown</h4><table className="w-full min-w-[680px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">UTC date</th><th className="py-2 pr-3 font-medium">QualifiedLead created</th><th className="py-2 pr-3 font-medium">Purchase created</th><th className="py-2 pr-3 font-medium">Delivered</th><th className="py-2 pr-3 font-medium">Failed</th><th className="py-2 pr-3 font-medium">Pending</th><th className="py-2 pr-3 font-medium">Blocked</th></tr></thead><tbody>{analytics.trend.map((day) => <tr key={day.date} className="border-b border-border"><td className="py-2 pr-3">{day.date}</td><td className="py-2 pr-3">{day.qualifiedLead}</td><td className="py-2 pr-3">{day.purchase}</td><td className="py-2 pr-3">{day.delivered}</td><td className="py-2 pr-3">{day.failed}</td><td className="py-2 pr-3">{day.pending}</td><td className="py-2 pr-3">{day.blocked}</td></tr>)}</tbody></table></div>
      </>}

      {!organizationId && analytics.workspaces.length > 0 && <div className="overflow-x-auto border-t border-border pt-4"><h4 className="mb-2 text-sm font-semibold">Workspace performance</h4><table className="w-full min-w-[850px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">Workspace</th><th className="py-2 pr-3 font-medium">Created</th><th className="py-2 pr-3 font-medium">Delivered</th><th className="py-2 pr-3 font-medium">Pending</th><th className="py-2 pr-3 font-medium">Blocked</th><th className="py-2 pr-3 font-medium">Failed</th><th className="py-2 pr-3 font-medium">Manual review</th><th className="py-2 pr-3 font-medium">Success</th><th /></tr></thead><tbody>{analytics.workspaces.map((workspace) => <tr key={workspace.organizationId} className="border-b border-border"><td className="py-3 pr-3 font-medium">{workspace.organizationName}</td><td className="py-3 pr-3">{workspace.eventsCreated}</td><td className="py-3 pr-3">{workspace.delivered}</td><td className="py-3 pr-3">{workspace.pending}</td><td className="py-3 pr-3">{workspace.blocked}</td><td className="py-3 pr-3">{workspace.failed}</td><td className="py-3 pr-3">{workspace.manualReview}</td><td className="py-3 pr-3"><Rate value={workspace.deliverySuccessRate} /></td><td className="py-3">{onOpenWorkspace && <Button size="sm" variant="ghost" onClick={() => onOpenWorkspace(workspace.organizationId)}>Open</Button>}</td></tr>)}</tbody></table></div>}
    </>}
  </section>;
}
