import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Cable, CheckCircle2, Clock3, Facebook, LoaderCircle, RefreshCw, Save, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callMetaApi } from "@/lib/meta-api-client";
import type { MetaClientIntegrationStatus, MetaOverview } from "@/lib/meta-api-rules";
import { waitForMetaOAuth } from "@/lib/meta-oauth-client";
import { CapiConfigForm, ClientStatusTable, MetaAppPanel, StatusBadge } from "@/components/meta-capi";
import type { Database } from "@/integrations/supabase/types";

type Settings = Database["public"]["Tables"]["meta_integration_settings"]["Row"];
type Executive = { user_id: string; full_name: string | null; is_active: boolean; user_roles: { role: string }[] };

export function MetaIntegration({ organizationId, members, statuses, onOpenWorkspace }: { organizationId: string | null; members: Executive[]; statuses: string[]; onOpenWorkspace?: ((id: string) => void) | undefined }) {
  const cache = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["meta-overview", organizationId], queryFn: () => callMetaApi<MetaOverview>("overview", { organizationId }), retry: false });
  const [tab, setTab] = useState("overview");
  const tabs = ["overview", "assets", "lead forms", "sync settings", "sync history", "conversions"];
  const [pickedWorkspace, setPickedWorkspace] = useState("");
  const invalidate = () => cache.invalidateQueries({ queryKey: ["meta-overview", organizationId] });
  async function connectFacebook() {
    if (!organizationId || busy) return;
    const popup = window.open("", "bedifly-facebook", "width=600,height=720");
    if (!popup) { toast.error("Allow popups to connect Facebook."); return; }
    setBusy("connect");
    try {
      const { authorizationUrl, state, callbackOrigin } = await callMetaApi<{ authorizationUrl: string; state: string; callbackOrigin: string }>("start-oauth", { organizationId, origin: window.location.origin });
      const completion = waitForMetaOAuth(popup, state, callbackOrigin);
      popup.location.href = authorizationUrl;
      const response = await completion;
      const result = await callMetaApi<{ connectionId: string; missingPermissions: string[] }>("complete-oauth", { organizationId, ...response });
      toast.success("Facebook account connected.");
      if (result.missingPermissions.length) toast.warning("Facebook access is incomplete. Review the missing permissions shown under your account.");
      await invalidate();
      const assets = await callMetaApi<{ count: number; warnings: string[] }>("refresh-assets", { organizationId, connectionId: result.connectionId });
      if (assets.warnings.length) toast.warning("Some Facebook assets could not be retrieved. Check synchronization history.");
      else toast.success(`${assets.count} Facebook assets retrieved.`);
    } catch (error) { popup.close(); const message = error instanceof Error ? error.message : "Facebook connection failed."; toast.error(message); await callMetaApi("log-oauth-error", { organizationId, message: message.slice(0, 500) }).catch(() => undefined); }
    finally { await invalidate(); setBusy(null); }
  }
  async function runAction(key: string, action: () => Promise<unknown>, success: string) {
    if (busy) return;
    setBusy(key);
    try { await action(); toast.success(success); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Facebook action failed."); }
    finally { await invalidate(); setBusy(null); }
  }
  if (query.isPending) return <div className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading Meta integrations</div>;
  if (query.error) return <div role="alert" className="border-l-2 border-destructive p-4 text-sm text-destructive">{query.error.message}<Button variant="outline" className="ml-3" onClick={() => void query.refetch()}>Retry</Button></div>;
  const data = query.data;
  const selected = data.assets.filter((asset) => asset.selected);
  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase text-muted-foreground">Integrations</p><h2 className="mt-1 text-2xl font-semibold">Meta Ads</h2><p className="mt-2 text-sm text-muted-foreground">Facebook & Instagram · {organizationId ? "Client workspace" : "All client workspaces"}</p></div><StatusBadge status={data.missingConfiguration.length ? "configuration_required" : data.connections.some((c) => c.connection_status === "connected") ? "connected" : data.connections.some((c) => c.connection_status === "error" || c.connection_status === "expired") ? "connection_error" : "not_connected"} /></div>
    {!organizationId && <MetaAppPanel />}
    <div className="border-l-2 border-accent bg-accent/20 px-4 py-3"><h3 className="text-sm font-semibold">{data.missingConfiguration.length ? "Meta Developer App setup required" : data.settings?.auto_sync_enabled ? "Automatic lead sync enabled" : "Automatic lead sync paused"}</h3><p className="mt-1 text-sm text-muted-foreground">{data.missingConfiguration.length ? "Facebook connection requires your Meta Developer App settings." : "Only selected forms from subscribed Pages can send leads to this workspace."} Conversions are sent only from workspaces with an active, tested Dataset and recorded customer consent.</p></div>
    <div className="flex gap-1 overflow-x-auto border-b border-border" role="tablist" aria-label="Meta integration sections">{tabs.map((item) => <Button key={item} variant="ghost" role="tab" aria-selected={tab === item} className={`shrink-0 rounded-none border-b-2 capitalize ${tab === item ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setTab(item)}>{item}</Button>)}</div>
    {tab === "overview" && <>
      {!organizationId && <section><h3 className="mb-3 font-semibold">Client integrations</h3><ClientStatusTable onOpenWorkspace={onOpenWorkspace} /></section>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[["Connected clients", data.connections.filter((item) => item.connection_status === "connected").length], ["Selected Pages", selected.filter((item) => item.asset_type === "page").length], ["Selected ad accounts", selected.filter((item) => item.asset_type === "ad_account").length], ["Selected lead forms", selected.filter((item) => item.asset_type === "form").length]].map(([label, value]) => <div key={label} className="rounded-md border border-border bg-card p-5"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p></div>)}</div>
      <section className="border-t border-border pt-5"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Facebook accounts</h3>{organizationId && <Button disabled={Boolean(busy) || data.missingConfiguration.some((name) => name !== "META_WEBHOOK_VERIFY_TOKEN")} title={data.missingConfiguration.length ? "Meta Developer App settings are required" : "Connect your Facebook account"} onClick={() => void connectFacebook()}>{busy === "connect" ? <LoaderCircle className="size-4 animate-spin" /> : <Facebook className="size-4" />}Connect Facebook Account</Button>}{!organizationId && onOpenWorkspace && <div className="flex flex-wrap items-center gap-2"><select aria-label="Client workspace to connect" className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={pickedWorkspace} onChange={(event) => setPickedWorkspace(event.target.value)}><option value="">Choose client workspace</option><WorkspaceOptions /></select><Button disabled={!pickedWorkspace} onClick={() => onOpenWorkspace(pickedWorkspace)}><Facebook className="size-4" />Connect Facebook Account</Button></div>}</div>{data.connections.length ? data.connections.map((connection) => {
        const missing = ["leads_retrieval", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "pages_manage_metadata", "ads_read"].filter((permission) => !connection.granted_permissions.includes(permission));
        return <div key={connection.id} className="mt-3 flex flex-wrap items-start justify-between gap-3 border-b border-border py-3 text-sm"><div><p className="font-medium">{connection.facebook_name ?? "Facebook account"}</p><p className="mt-1 text-muted-foreground">{connection.connection_status.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">Last successful sync: {connection.last_sync_at ? new Date(connection.last_sync_at).toLocaleString() : "Never"}</p>{connection.token_expires_at && <p className="mt-1 text-xs text-muted-foreground">Access expires {new Date(connection.token_expires_at).toLocaleDateString()}</p>}{missing.length > 0 && connection.connection_status === "connected" && <p className="mt-2 max-w-lg break-words text-xs text-destructive">Missing permissions: {missing.join(", ")}. Reconnect after Meta approval or Page access is updated.</p>}</div>{organizationId && <div className="flex gap-2"><Button variant="outline" size="sm" disabled={Boolean(busy) || data.missingConfiguration.some((name) => name !== "META_WEBHOOK_VERIFY_TOKEN")} onClick={() => void connectFacebook()}><Facebook className="size-4" />Reconnect</Button><Button variant="outline" size="sm" disabled={Boolean(busy) || connection.connection_status !== "connected"} onClick={() => void runAction(connection.id, async () => { const result = await callMetaApi<{ warnings: string[] }>("refresh-assets", { organizationId, connectionId: connection.id }); if (result.warnings.length) throw new Error("Some assets could not be retrieved. Check synchronization history."); }, "Facebook assets refreshed.")}><RefreshCw className="size-4" />Refresh assets</Button><Button variant="outline" size="icon" disabled={Boolean(busy) || connection.connection_status === "disconnected"} aria-label={`Disconnect ${connection.facebook_name ?? "Facebook account"}`} title="Disconnect Facebook account" onClick={() => { if (window.confirm("Disconnect this Facebook account and pause its selected forms?")) void runAction(connection.id, () => callMetaApi("disconnect-connection", { organizationId, connectionId: connection.id }), "Facebook disconnected. Its selected forms are paused."); }}><Unplug className="size-4" /></Button></div>}</div>;
      }) : <div className="flex flex-col items-start gap-3 py-6"><Facebook className="size-8 text-primary" /><p className="text-sm text-muted-foreground">No Facebook accounts connected.</p></div>}</section>
      <section className="border-t border-border pt-5"><h3 className="font-semibold">Setup checklist</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{["Meta Developer App credentials", "Approved lead retrieval permissions", "Published callback and webhook addresses", "Client-owned Facebook authorization", "Background lead processor", "Live lead-sync verification"].map((label) => <div key={label} className="flex items-center gap-2 text-sm text-muted-foreground"><Clock3 className="size-4 shrink-0" />{label}</div>)}</div><p className="mt-4 text-xs text-muted-foreground">Webhook path: /api/public/meta/webhook</p></section>
    </>}
    {(tab === "assets" || tab === "lead forms") && <section><h3 className="font-semibold">{tab === "lead forms" ? "Meta Lead Forms" : "Business assets"}</h3>{data.assets.filter((asset) => tab === "lead forms" ? asset.asset_type === "form" : asset.asset_type !== "form").map((asset) => <div key={asset.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 text-sm"><div className="min-w-0"><p className="break-words">{asset.name}</p><p className="text-xs text-muted-foreground">{asset.asset_type} · {asset.external_id}</p>{asset.parent_external_id && <p className="text-xs text-muted-foreground">{data.assets.find((parent) => parent.external_id === asset.parent_external_id)?.name ?? asset.parent_external_id}</p>}{asset.asset_type === "page" && <p className="text-xs text-muted-foreground">{asset.webhook_subscribed ? "Webhook subscribed" : "Webhook not subscribed"}</p>}</div>{organizationId && asset.asset_type !== "dataset" ? <label className="flex shrink-0 items-center gap-2"><input type="checkbox" aria-label={`Select ${asset.name}`} checked={asset.selected} disabled={Boolean(busy)} onChange={(event) => void runAction(asset.id, () => callMetaApi("select-asset", { organizationId, assetId: asset.id, selected: event.target.checked }), "Facebook asset selection saved.")} />Selected</label> : <span>{asset.selected ? "Selected" : "Not selected"}</span>}</div>)}{!data.assets.length && <Empty icon="assets" title={tab === "lead forms" ? "No forms retrieved" : "No assets retrieved"} detail="Connect Facebook and refresh assets to retrieve available Pages and forms." />}</section>}
    {tab === "sync settings" && (organizationId ? <SyncSettings key={`${organizationId}-${data.settings?.updated_at ?? "new"}`} organizationId={organizationId} settings={data.settings} members={members} statuses={statuses} /> : <Empty title="Select a client workspace" detail="Synchronization settings belong to an individual client." />)}
    {tab === "sync history" && <section><h3 className="font-semibold">Synchronization history</h3>{data.logs.length ? data.logs.map((log) => <div key={log.id} className="grid gap-2 border-b border-border py-4 text-sm sm:grid-cols-3"><span>{log.sync_type}</span><span>{log.status} · {log.records_processed} leads</span><span className="text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>{log.error_message && <span className="break-words text-xs text-destructive sm:col-span-3">{log.error_message}</span>}</div>) : <Empty title="No synchronization runs" detail="Runs will appear here once the lead processor is activated." />}</section>}
    {tab === "conversions" && <section className="space-y-5"><div><h3 className="font-semibold">Conversions API</h3><p className="mt-2 text-sm text-muted-foreground">QualifiedLead · Purchase · Pixel / Dataset</p></div>{organizationId ? <CapiConfigForm organizationId={organizationId} /> : <><p className="text-sm text-muted-foreground">CAPI status and event delivery for every client workspace.</p><ClientStatusTable onOpenWorkspace={onOpenWorkspace} /></>}<h4 className="pt-2 text-sm font-semibold">Recent conversion events</h4>{data.events.length ? data.events.map((event) => <div key={event.id} className="flex justify-between border-b border-border py-3 text-sm"><span>{event.event_name}</span><span>{event.status}{event.error_code ? ` · ${event.error_code}` : ""}</span></div>) : <Empty title="No conversion events" detail="No customer data has been transmitted to Meta." />}</section>}
  </div>;
}

function Empty({ title, detail, icon }: { title: string; detail: string; icon?: string }) {
  return <div className="py-12 text-center">{icon === "assets" ? <Cable className="mx-auto size-7 text-muted-foreground" /> : <Clock3 className="mx-auto size-7 text-muted-foreground" />}<h4 className="mt-4 text-sm font-semibold">{title}</h4><p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">{detail}</p></div>;
}

function SyncSettings({ organizationId, settings, members, statuses }: { organizationId: string; settings: Settings | null; members: Executive[]; statuses: string[] }) {
  const cache = useQueryClient();
  const [status, setStatus] = useState(settings?.default_status ?? "New Lead");
  const [quality, setQuality] = useState<"Hot" | "Warm" | "Cold" | "Junk">((settings?.default_quality as "Hot" | "Warm" | "Cold" | "Junk") ?? "Warm");
  const [mode, setMode] = useState<"manual" | "fixed" | "round_robin">((settings?.assignment_mode as "manual" | "fixed" | "round_robin") ?? "manual");
  const [ids, setIds] = useState<string[]>(settings?.executive_ids ?? []);
  const [duplicate, setDuplicate] = useState<"keep_separate" | "flag">((settings?.duplicate_handling as "keep_separate" | "flag") ?? "keep_separate");
  const [notify, setNotify] = useState(settings?.notifications_enabled ?? true);
  const [autoSync, setAutoSync] = useState(settings?.auto_sync_enabled ?? false);
  const [busy, setBusy] = useState(false);
  const executives = members.filter((member) => member.is_active && member.user_roles.some((role) => role.role === "sales_exec"));
  const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm";
  return <form className="max-w-3xl space-y-6" onSubmit={async (event) => { event.preventDefault(); setBusy(true); try { await callMetaApi("save-settings", { organizationId, defaultStatus: status, defaultQuality: quality, assignmentMode: mode, executiveIds: mode === "manual" ? [] : ids, duplicateHandling: duplicate, notificationsEnabled: notify, autoSyncEnabled: autoSync }); toast.success("Meta synchronization preferences saved."); await cache.invalidateQueries({ queryKey: ["meta-overview", organizationId] }); } catch (error) { toast.error(error instanceof Error ? error.message : "Settings could not be saved."); } finally { setBusy(false); } }}>
    <h3 className="font-semibold">Lead synchronization preferences</h3>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={autoSync} onChange={(event) => setAutoSync(event.target.checked)} />Enable automatic synchronization</label>
    <div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-2 text-sm">Default lead status<select className={selectClass} value={status} onChange={(event) => setStatus(event.target.value)}>{statuses.map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-2 text-sm">Default quality<select className={selectClass} value={quality} onChange={(event) => { const value = event.target.value; if (value === "Hot" || value === "Warm" || value === "Cold" || value === "Junk") setQuality(value); }}>{["Hot", "Warm", "Cold", "Junk"].map((item) => <option key={item}>{item}</option>)}</select></label><label className="grid gap-2 text-sm">Assignment<select className={selectClass} value={mode} onChange={(event) => { const value = event.target.value; if (value === "manual" || value === "fixed" || value === "round_robin") { setMode(value); setIds([]); } }}><option value="manual">Manual assignment</option><option value="fixed">One sales executive</option><option value="round_robin">Round-robin</option></select></label><label className="grid gap-2 text-sm">Duplicate phone or email<select className={selectClass} value={duplicate} onChange={(event) => { const value = event.target.value; if (value === "flag" || value === "keep_separate") setDuplicate(value); }}><option value="keep_separate">Keep separate submissions</option><option value="flag">Flag duplicate contact details</option></select></label></div>
    {mode !== "manual" && <fieldset className="space-y-3"><legend className="mb-3 text-sm font-medium">Sales executives</legend>{executives.length ? executives.map((member) => <label key={member.user_id} className="flex items-center gap-2 text-sm"><input type={mode === "fixed" ? "radio" : "checkbox"} name="executives" checked={ids.includes(member.user_id)} onChange={(event) => setIds(mode === "fixed" ? [member.user_id] : event.target.checked ? [...ids, member.user_id] : ids.filter((id) => id !== member.user_id))} />{member.full_name ?? "Sales executive"}</label>) : <p className="text-sm text-muted-foreground">No active sales executives in this workspace.</p>}</fieldset>}
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={notify} onChange={(event) => setNotify(event.target.checked)} />Notify the assigned executive or client administrator</label>
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5"><Button disabled={busy}>{busy ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}Save preferences</Button><span className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="size-4" />{settings?.auto_sync_enabled ? "Automatic sync enabled" : "Automatic sync paused"}</span></div>
  </form>;
}
function WorkspaceOptions() {
  const query = useQuery({ queryKey: ["meta-client-statuses"], queryFn: () => callMetaApi<MetaClientIntegrationStatus[]>("client-statuses"), retry: false });
  return <>{(query.data ?? []).map((client) => <option key={client.organizationId} value={client.organizationId}>{client.name}</option>)}</>;
}
