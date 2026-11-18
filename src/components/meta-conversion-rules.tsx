import { useState } from "react";
import { LoaderCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { callMetaApi } from "@/lib/meta-api-client";
import type { MetaOverview } from "@/lib/meta-api-rules";

const QUALITIES = ["Hot", "Warm", "Cold", "Junk"];
type Rule = MetaOverview["conversionRules"][number];

type Entry = { triggerType: "status" | "quality"; triggerValue: string };

export function MetaConversionRules({ organizationId, statuses, rules, onSaved }: {
  organizationId: string;
  statuses: string[];
  rules: Rule[];
  onSaved: () => Promise<void>;
}) {
  const entries: Entry[] = [
    ...statuses.map((triggerValue) => ({ triggerType: "status" as const, triggerValue })),
    ...QUALITIES.map((triggerValue) => ({ triggerType: "quality" as const, triggerValue })),
  ];
  return <section className="rounded-md border border-border bg-card p-5">
    <div>
      <h3 className="font-semibold">Lifecycle conversion rules</h3>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Choose which workspace status or quality can map to a Meta event. Rules are disabled by default and this phase does not create or send conversion events.</p>
    </div>
    <div className="mt-5 divide-y divide-border border-y border-border">
      {entries.map((entry) => {
        const rule = rules.find((item) => item.trigger_type === entry.triggerType && item.trigger_value === entry.triggerValue);
        return <RuleRow key={`${entry.triggerType}-${entry.triggerValue}-${rule?.updated_at ?? "empty"}`} organizationId={organizationId} entry={entry} rule={rule} onSaved={onSaved} />;
      })}
    </div>
    <p className="mt-4 text-xs text-muted-foreground">Purchase rules will additionally require an actual lead value and currency. Dataset eligibility, customer consent, and the workspace’s production setting remain separate mandatory checks.</p>
  </section>;
}

function RuleRow({ organizationId, entry, rule, onSaved }: { organizationId: string; entry: Entry; rule?: Rule | undefined; onSaved: () => Promise<void> }) {
  const [eventName, setEventName] = useState(rule?.event_name ?? "");
  const [enabled, setEnabled] = useState(rule?.enabled ?? false);
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await callMetaApi("save-conversion-rule", {
        organizationId,
        triggerType: entry.triggerType,
        triggerValue: entry.triggerValue,
        eventName: eventName || null,
        enabled: Boolean(eventName && enabled),
      });
      toast.success(`${entry.triggerValue} conversion rule saved.`);
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Conversion rule could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  return <div className="grid gap-3 py-3 sm:grid-cols-[minmax(150px,1fr)_minmax(160px,1fr)_auto_auto] sm:items-center">
    <div><p className="text-sm font-medium">{entry.triggerValue}</p><p className="text-xs capitalize text-muted-foreground">{entry.triggerType}</p></div>
    <select aria-label={`${entry.triggerValue} Meta event`} className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={eventName} disabled={busy} onChange={(event) => setEventName(event.target.value)}>
      <option value="">No Meta event</option>
      <option value="QualifiedLead">QualifiedLead</option>
      <option value="Purchase">Purchase</option>
    </select>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(eventName && enabled)} disabled={busy || !eventName} onChange={(event) => setEnabled(event.target.checked)} />Enabled</label>
    <Button size="sm" variant="outline" disabled={busy} onClick={() => void save()}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Save</Button>
  </div>;
}
