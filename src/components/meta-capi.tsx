import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Facebook, FlaskConical, LoaderCircle, PlugZap, Save, Send, Settings2, Unplug, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callMetaApi } from "@/lib/meta-api-client";
import type { MetaAppStatus, MetaCapiConfigView, MetaClientIntegrationStatus } from "@/lib/meta-api-rules";
import type { CapiStatus } from "@/lib/meta-rules";

const LABELS: Record<CapiStatus, string> = { not_connected: "Not Connected", configuration_required: "Configuration Required", connected: "Connected", test_successful: "Test Successful", production_active: "Production Active", connection_error: "Connection Error" };
const TONE: Record<CapiStatus, string> = { not_connected: "border-border text-muted-foreground", configuration_required: "border-accent text-accent-foreground bg-accent/30", connected: "border-primary/40 text-primary", test_successful: "border-primary text-primary bg-primary/10", production_active: "border-primary bg-primary text-primary-foreground", connection_error: "border-destructive text-destructive bg-destructive/10" };

export function StatusBadge({ status }: { status: CapiStatus }) {
  return <span className={`inline-flex shrink-0 items-center rounded-md border px-2 py-1 text-xs font-medium ${TONE[status]}`}>{LABELS[status]}</span>;
}
function errorText(error: unknown) { return error instanceof Error ? error.message : "Action failed."; }

export function MetaAppPanel() {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const query = useQuery({ queryKey: ["meta-app-status"], queryFn: () => callMetaApi<MetaAppStatus>("app-status"), enabled: open, retry: false, staleTime: 0, gcTime: 0 });
  const missing = query.data?.settings.filter((s) => !s.configured) ?? [];
  const status: CapiStatus = missing.length ? "configuration_required" : result?.ok === false ? "connection_error" : result?.ok ? "connected" : "not_connected";
  async function test() {
    setTesting(true);
    try { const r = await callMetaApi<{ appName: string }>("test-app"); setResult({ ok: true, text: `Meta accepted the app credentials (${r.appName}).` }); toast.success("Meta App credentials verified."); }
    catch (error) { setResult({ ok: false, text: errorText(error) }); toast.error(errorText(error)); }
    finally { setTesting(false); }
  }
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}><Settings2 className="size-4" />Configure Meta App</Button>;
  return <section className="w-full rounded-md border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><h3 className="font-semibold">Meta Developer App</h3>{query.data && <StatusBadge status={status} />}</div><Button variant="ghost" size="icon" aria-label="Close Meta App configuration" onClick={() => setOpen(false)}><X className="size-4" /></Button></div>
    {query.isPending ? <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Checking backend settings</p> : query.error ? <p className="mt-4 text-sm text-destructive">{query.error.message}</p> : <>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{query.data.settings.map((s) => <div key={s.name} className="flex items-center justify-between gap-2 border-b border-border py-2 text-sm"><code className="text-xs">{s.name}</code><span className={s.configured ? "text-primary" : "text-destructive"}>{s.configured ? "Saved" : "Missing"}</span></div>)}</div>
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">App ID</dt><dd>{query.data.appIdHint ?? "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Graph API version</dt><dd>{query.data.graphVersion ?? "—"}</dd></div><div className="min-w-0"><dt className="text-xs text-muted-foreground">Saved callback (META_REDIRECT_URI)</dt><dd className="break-all">{query.data.redirectUri ?? "—"}</dd></div></dl>
      {query.data.missing.length > 0 && <div role="alert" className="mt-4 border-l-2 border-destructive p-3 text-sm text-destructive">Add these backend secrets: {query.data.missing.join(", ")}</div>}
      <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2"><div className="min-w-0"><dt className="text-xs text-muted-foreground">OAuth callback URL (use in Meta → Facebook Login → Valid OAuth Redirect URIs)</dt><dd className="break-all"><code className="text-xs">{query.data.expectedRedirectUri}</code>{query.data.redirectUri && !query.data.redirectMatches && <span className="block text-xs text-destructive">META_REDIRECT_URI does not match this address.</span>}</dd></div><div className="min-w-0"><dt className="text-xs text-muted-foreground">Webhook callback URL (use in Meta → Webhooks → Page)</dt><dd className="break-all"><code className="text-xs">{query.data.webhookUrl}</code></dd></div></dl>
      <p className="mt-2 text-xs text-muted-foreground">Last checked {new Date(query.data.checkedAt).toLocaleTimeString()}</p>
      <p className="mt-4 text-xs text-muted-foreground">App ID and App Secret are stored only as backend secrets and are never sent to the browser. Change them in your project's backend secret settings. Webhook path: {query.data.webhookPath}</p>
      {result && <p className={`mt-3 text-sm ${result.ok ? "text-primary" : "text-destructive"}`}>{result.text}</p>}
      <div className="mt-4 flex gap-2"><Button disabled={testing} onClick={() => void test()}>{testing ? <LoaderCircle className="size-4 animate-spin" /> : <PlugZap className="size-4" />}Test Meta App</Button><Button variant="outline" disabled={query.isFetching} onClick={() => { setResult(null); void query.refetch(); }}>{query.isFetching && <LoaderCircle className="size-4 animate-spin" />}Refresh status</Button></div>
    </>}
  </section>;
}

export function ClientStatusTable({ onOpenWorkspace }: { onOpenWorkspace?: ((id: string) => void) | undefined }) {
  const query = useQuery({ queryKey: ["meta-client-statuses"], queryFn: () => callMetaApi<MetaClientIntegrationStatus[]>("client-statuses"), retry: false });
  if (query.isPending) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading client integrations</p>;
  if (query.error) return <p className="text-sm text-destructive">{query.error.message}</p>;
  if (!query.data.length) return <p className="py-6 text-sm text-muted-foreground">No client workspaces yet.</p>;
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr className="border-b border-border"><th className="py-2 pr-3 font-medium">Client</th><th className="pr-3 font-medium">Facebook</th><th className="pr-3 font-medium">Conversions API</th><th className="pr-3 font-medium">Events (30 days)</th><th className="pr-3 font-medium">Last test event</th><th /></tr></thead><tbody>{query.data.map((row) => <tr key={row.organizationId} className="border-b border-border align-top"><td className="py-3 pr-3"><p className="font-medium">{row.name}</p><p className="text-xs text-muted-foreground">{row.workspaceStatus}</p></td><td className="py-3 pr-3"><StatusBadge status={row.facebook === "connected" ? "connected" : row.facebook === "not_connected" || row.facebook === "disconnected" ? "not_connected" : "connection_error"} />{row.facebookName && <p className="mt-1 text-xs text-muted-foreground">{row.facebookName}</p>}</td><td className="py-3 pr-3"><StatusBadge status={row.capiStatus} />{row.lastError && <p className="mt-1 max-w-[220px] break-words text-xs text-destructive">{row.lastError}</p>}</td><td className="py-3 pr-3 text-xs"><span className="text-primary">{row.events.sent} sent</span> · <span className="text-destructive">{row.events.failed} failed</span> · {row.events.pending} pending · {row.events.blocked} blocked</td><td className="py-3 pr-3 text-xs text-muted-foreground">{row.lastTestEventAt ? new Date(row.lastTestEventAt).toLocaleString() : "Never"}</td><td className="py-3">{onOpenWorkspace && <Button size="sm" variant="outline" onClick={() => onOpenWorkspace(row.organizationId)}><Facebook className="size-4" />{row.facebook === "connected" ? "Manage" : "Connect Meta Account"}</Button>}</td></tr>)}</tbody></table></div>;
}

export function CapiConfigForm({ organizationId }: { organizationId: string }) {
  const cache = useQueryClient();
  const key = ["meta-capi", organizationId];
  const query = useQuery({ queryKey: key, queryFn: () => callMetaApi<MetaCapiConfigView>("capi-config", { organizationId }), retry: false });
  const [editing, setEditing] = useState(false);
  const [datasetId, setDatasetId] = useState("");
  const [token, setToken] = useState("");
  const [testCode, setTestCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  async function run(name: string, action: () => Promise<unknown>, success: (r: never) => string) {
    setBusy(name);
    try { const r = await action(); toast.success(success(r as never)); return true; }
    catch (error) { toast.error(errorText(error)); return false; }
    finally { await cache.invalidateQueries({ queryKey: key }); await cache.invalidateQueries({ queryKey: ["meta-client-statuses"] }); setBusy(null); }
  }
  if (query.isPending) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading Conversions API settings</p>;
  if (query.error) return <p role="alert" className="text-sm text-destructive">{query.error.message}</p>;
  const c = query.data;
  const showForm = editing || (!c.datasetId && !c.hasToken);
  function startEdit() { setDatasetId(c.datasetId); setTestCode(c.testEventCode); setToken(""); setEditing(true); }
  const spin = (name: string) => busy === name ? <LoaderCircle className="size-4 animate-spin" /> : null;
  return <section className="rounded-md border border-border bg-card p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-semibold">Configure Dataset / Pixel</h3><p className="mt-1 text-sm text-muted-foreground">Credentials are encrypted on the backend and never shown again.</p></div><StatusBadge status={c.status} /></div>
    {c.lastError && <p className="mt-3 break-words text-sm text-destructive">Last error: {c.lastError}</p>}
    {showForm ? <form className="mt-5 grid max-w-xl gap-4" onSubmit={(event) => { event.preventDefault(); void run("save", () => callMetaApi("save-capi", { organizationId, datasetId, accessToken: token, testEventCode: testCode }), () => "Configuration saved. Test the connection next.").then((ok) => { if (ok) { setEditing(false); setToken(""); } }); }}>
      <div className="grid gap-2"><Label htmlFor="capi-dataset">Dataset ID / Pixel ID</Label><Input id="capi-dataset" inputMode="numeric" required value={datasetId} onChange={(e) => setDatasetId(e.target.value)} placeholder="e.g. 123456789012345" /></div>
      <div className="grid gap-2"><Label htmlFor="capi-token">CAPI Access Token</Label><Input id="capi-token" type="password" autoComplete="new-password" required={!c.hasToken} value={token} onChange={(e) => setToken(e.target.value)} placeholder={c.hasToken ? "Saved — leave blank to keep current token" : "Paste token from Events Manager"} /></div>
      <div className="grid gap-2"><Label htmlFor="capi-test">Test Event Code</Label><Input id="capi-test" value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="e.g. TEST12345" /></div>
      <div className="flex gap-2"><Button type="submit" disabled={Boolean(busy)}>{spin("save") ?? <Save className="size-4" />}Save Configuration</Button>{editing && <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>}</div>
    </form> : <>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted-foreground">Dataset ID / Pixel ID</dt><dd>{c.datasetId || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">CAPI Access Token</dt><dd>{c.hasToken ? "Saved securely" : "Missing"}</dd></div><div><dt className="text-xs text-muted-foreground">Test Event Code</dt><dd>{c.testEventCode || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Last connection test</dt><dd>{c.lastTestedAt ? new Date(c.lastTestedAt).toLocaleString() : "Never"}</dd></div><div><dt className="text-xs text-muted-foreground">Last test event</dt><dd>{c.lastTestEventAt ? new Date(c.lastTestEventAt).toLocaleString() : "Never"}</dd></div></dl>
      <label className="mt-5 flex items-center gap-3 text-sm"><input type="checkbox" checked={c.enabled} disabled={Boolean(busy)} onChange={(e) => void run("toggle", () => callMetaApi("set-capi-enabled", { organizationId, enabled: e.target.checked }), () => e.target.checked ? "Conversions API enabled." : "Conversions API disabled.")} />Enable Conversions API {busy === "toggle" && <LoaderCircle className="size-4 animate-spin" />}</label>
      <p className="mt-1 text-xs text-muted-foreground">Requires a successful test event and Dataset eligibility review. Original and latest customer consent must both permit each conversion.</p>
      <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" checked={c.datasetEligible} disabled={Boolean(busy)} onChange={(e) => { const eligible = e.target.checked; void run("eligibility", () => callMetaApi("review-dataset-eligibility", { organizationId, eligible }), () => "Dataset eligibility review saved."); }} />I reviewed this Dataset's Events Manager restrictions, accepted Meta Business Tools Terms, and confirmed these outcomes contain no restricted sensitive data or data about children under 13.</label>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="outline" disabled={Boolean(busy)} onClick={startEdit}><Settings2 className="size-4" />Edit</Button>
        <Button variant="outline" disabled={Boolean(busy) || !c.hasToken} onClick={() => void run("test", () => callMetaApi<{ datasetName: string }>("test-capi", { organizationId }), (r: { datasetName: string }) => `Connected to ${r.datasetName}.`)}>{spin("test") ?? <FlaskConical className="size-4" />}Test Connection</Button>
        <Button variant="outline" disabled={Boolean(busy) || !c.hasToken || !c.testEventCode} title={c.testEventCode ? "Send a test event to Meta" : "Add a Test Event Code first"} onClick={() => void run("event", () => callMetaApi("send-capi-test", { organizationId }), () => "Meta received the test event. Check Events Manager → Test events.")}>{spin("event") ?? <Send className="size-4" />}Send Test Event</Button>
        <Button variant="outline" disabled={Boolean(busy)} onClick={() => { if (window.confirm("Remove this Dataset configuration and its saved token?")) void run("remove", () => callMetaApi("disconnect-capi", { organizationId }), () => "Conversions API disconnected."); }}>{spin("remove") ?? <Unplug className="size-4" />}Disconnect</Button>
      </div>
      {c.status === "production_active" && <p className="mt-4 flex items-center gap-2 text-sm text-primary"><CheckCircle2 className="size-4" />Production active</p>}
    </>}
  </section>;
}
