import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoaderCircle, Save, ShieldCheck, ShieldX, UserRoundCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { callMetaApi } from "@/lib/meta-api-client";
import {
  latestMetaConsent,
  META_CONSENT_SOURCES,
  metaConsentBlockReason,
  metaConsentSchema,
  metaConsentWithdrawalSchema,
  type MetaConsentRecord,
} from "@/lib/meta-consent";
import type { MetaConsentListResponse } from "@/lib/meta-consent";

const reasonLabels = {
  consent_missing: "Consent missing",
  global_privacy_control: "Global Privacy Control",
  consent_withdrawn: "Consent withdrawn",
  advertising_consent_required: "Advertising refused",
  matching_consent_required: "Matching data refused",
};

export function MetaConsentManager({ organizationId }: { organizationId: string }) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["meta-consent", organizationId],
    queryFn: () => callMetaApi<MetaConsentListResponse>("consent-list", { organizationId }),
    retry: false,
  });
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<"save" | "withdraw" | null>(null);
  const [advertisingAccepted, setAdvertisingAccepted] = useState(false);
  const [matchingAccepted, setMatchingAccepted] = useState(false);
  const [globalPrivacyControl, setGlobalPrivacyControl] = useState(false);
  const [noticeVersion, setNoticeVersion] = useState("Bedifly Privacy Notice v1");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [region, setRegion] = useState("IN");
  const [consentSource, setConsentSource] =
    useState<(typeof META_CONSENT_SOURCES)[number]>("crm_manual");
  const data = query.data;
  const leads = useMemo(
    () =>
      (data?.leads ?? []).filter(
        (lead) =>
          !search.trim() ||
          `${lead.full_name} ${lead.status} ${lead.quality}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
      ),
    [data?.leads, search],
  );
  const selectedLead = data?.leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const records = useMemo(
    () => (data?.records ?? []).filter((record) => record.lead_id === selectedLeadId),
    [data?.records, selectedLeadId],
  );
  const latest = data ? latestMetaConsent(data.records, selectedLeadId) : null;
  const latestReason = metaConsentBlockReason(latest);

  useEffect(() => {
    if (!selectedLeadId && data?.leads.length) setSelectedLeadId(data.leads[0]!.id);
  }, [data?.leads, selectedLeadId]);

  useEffect(() => {
    setAdvertisingAccepted(false);
    setMatchingAccepted(false);
    setGlobalPrivacyControl(false);
    setNoticeVersion(latest?.notice_version ?? "Bedifly Privacy Notice v1");
    setEvidenceReference("");
    setRegion(latest?.region ?? "IN");
    setConsentSource("crm_manual");
  }, [selectedLeadId, latest]);

  async function refresh() {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["meta-consent", organizationId] }),
      cache.invalidateQueries({ queryKey: ["meta-overview", organizationId] }),
    ]);
  }

  function evidence() {
    return {
      organizationId,
      leadId: selectedLeadId,
      noticeVersion,
      evidenceReference,
      region,
      consentSource,
    };
  }

  async function save() {
    const parsed = metaConsentSchema.safeParse({
      ...evidence(),
      advertisingAccepted,
      matchingAccepted,
      globalPrivacyControl,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the consent evidence.");
      return;
    }
    setBusy("save");
    try {
      await callMetaApi("save-consent", parsed.data);
      toast.success("Customer consent choice recorded.");
      setEvidenceReference("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Consent could not be recorded.");
    } finally {
      setBusy(null);
    }
  }

  async function withdraw() {
    if (!latest || latestReason === "consent_withdrawn") return;
    if (
      !window.confirm(
        "Record consent withdrawal for this lead? All unsent conversion events will be blocked.",
      )
    )
      return;
    const parsed = metaConsentWithdrawalSchema.safeParse({
      ...evidence(),
      consentSource: consentSource === "global_privacy_control" ? "withdrawal" : consentSource,
      globalPrivacyControl,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the withdrawal evidence.");
      return;
    }
    setBusy("withdraw");
    try {
      await callMetaApi("withdraw-consent", parsed.data);
      toast.success("Consent withdrawal recorded. Unsent events are blocked.");
      setEvidenceReference("");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Withdrawal could not be recorded.");
    } finally {
      setBusy(null);
    }
  }

  if (query.isPending)
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle className="size-4 animate-spin" />
        Loading consent records
      </div>
    );
  if (query.error)
    return (
      <div role="alert" className="border-l-2 border-destructive p-4 text-sm text-destructive">
        {query.error.message}
        <Button variant="outline" className="ml-3" onClick={() => void query.refetch()}>
          Retry
        </Button>
      </div>
    );

  return (
    <section className="space-y-5">
      <div>
        <h3 className="font-semibold">Customer consent</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Record advertising and matching-data choices separately. Every save creates new evidence;
          earlier records remain available for event-time checks.
        </p>
      </div>
      <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="rounded-md border border-border bg-card p-4">
          <Input
            aria-label="Search leads for consent"
            placeholder="Search leads"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="mt-3 max-h-[560px] divide-y divide-border overflow-y-auto">
            {leads.map((lead) => {
              const reason = metaConsentBlockReason(
                latestMetaConsent(data?.records ?? [], lead.id),
              );
              return (
                <button
                  key={lead.id}
                  type="button"
                  data-active={selectedLeadId === lead.id}
                  onClick={() => setSelectedLeadId(lead.id)}
                  className="flex w-full items-start justify-between gap-3 py-3 text-left data-[active=true]:text-primary"
                >
                  <span>
                    <span className="block text-sm font-medium">{lead.full_name}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {lead.status} · {lead.quality}
                    </span>
                  </span>
                  <span
                    className={`mt-1 size-2 shrink-0 rounded-full ${reason ? "bg-destructive" : "bg-primary"}`}
                    aria-label={reason ? reasonLabels[reason] : "Consent granted"}
                  />
                </button>
              );
            })}
            {!leads.length && (
              <p className="py-8 text-center text-sm text-muted-foreground">No matching leads.</p>
            )}
          </div>
        </div>
        <div className="space-y-5">
          {selectedLead ? (
            <>
              <div className="rounded-md border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-medium">{selectedLead.full_name}</h4>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedLead.status} · {selectedLead.quality}
                    </p>
                  </div>
                  <span
                    className={`rounded-md px-3 py-1 text-xs font-medium ${latestReason ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground"}`}
                  >
                    {latestReason ? reasonLabels[latestReason] : "Consent granted"}
                  </span>
                </div>
                {latest && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Latest choice: {new Date(latest.recorded_at).toLocaleString()} ·{" "}
                    {latest.consent_source.replaceAll("_", " ")} · {latest.region}
                  </p>
                )}
              </div>
              <div className="rounded-md border border-border bg-card p-5">
                <h4 className="font-medium">Record a new choice</h4>
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-3 rounded-md border border-border p-4">
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={advertisingAccepted}
                        disabled={globalPrivacyControl || Boolean(busy)}
                        onChange={(event) => setAdvertisingAccepted(event.target.checked)}
                      />
                      <span>
                        <span className="font-medium">Advertising consent</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Permits eligible CRM conversion events.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-3 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={matchingAccepted}
                        disabled={globalPrivacyControl || Boolean(busy)}
                        onChange={(event) => setMatchingAccepted(event.target.checked)}
                      />
                      <span>
                        <span className="font-medium">Matching-data consent</span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Permits approved identifiers for Meta matching. Refusal blocks this
                          identifier-based outbox.
                        </span>
                      </span>
                    </label>
                  </div>
                  <label className="flex items-start gap-3 rounded-md border border-border p-4 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={globalPrivacyControl}
                      disabled={Boolean(busy)}
                      onChange={(event) => {
                        setGlobalPrivacyControl(event.target.checked);
                        if (event.target.checked) {
                          setAdvertisingAccepted(false);
                          setMatchingAccepted(false);
                          setConsentSource("global_privacy_control");
                        } else setConsentSource("crm_manual");
                      }}
                    />
                    <span>
                      <span className="font-medium">Global Privacy Control received</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Blocks event creation and any delayed processing immediately.
                      </span>
                    </span>
                  </label>
                  <Field label="Consent source">
                    <select
                      aria-label="Consent source"
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={consentSource}
                      disabled={globalPrivacyControl || Boolean(busy)}
                      onChange={(event) =>
                        setConsentSource(
                          event.target.value as (typeof META_CONSENT_SOURCES)[number],
                        )
                      }
                    >
                      {META_CONSENT_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {source.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Region">
                    <Input
                      value={region}
                      maxLength={100}
                      disabled={Boolean(busy)}
                      onChange={(event) => setRegion(event.target.value)}
                      placeholder="IN"
                    />
                  </Field>
                  <Field label="Privacy notice version">
                    <Input
                      value={noticeVersion}
                      maxLength={100}
                      disabled={Boolean(busy)}
                      onChange={(event) => setNoticeVersion(event.target.value)}
                    />
                  </Field>
                  <Field label="Evidence reference">
                    <Input
                      value={evidenceReference}
                      maxLength={200}
                      disabled={Boolean(busy)}
                      onChange={(event) => setEvidenceReference(event.target.value)}
                      placeholder="Form submission, call log, or receipt ID"
                    />
                  </Field>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  The backend records the server timestamp and signed-in administrator. No consent
                  is inferred from receiving a lead.
                </p>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button disabled={Boolean(busy)} onClick={() => void save()}>
                    {busy === "save" ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save consent choice
                  </Button>
                  <Button
                    variant="outline"
                    disabled={Boolean(busy) || !latest || latestReason === "consent_withdrawn"}
                    onClick={() => void withdraw()}
                  >
                    {busy === "withdraw" ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : (
                      <ShieldX className="size-4" />
                    )}
                    Withdraw consent
                  </Button>
                </div>
              </div>
              <ConsentHistory records={records} />
            </>
          ) : (
            <div className="rounded-md border border-border bg-card py-16 text-center">
              <UserRoundCheck className="mx-auto size-8 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">Choose a lead to manage consent.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ConsentHistory({ records }: { records: MetaConsentRecord[] }) {
  return (
    <div className="rounded-md border border-border bg-card p-5">
      <h4 className="flex items-center gap-2 font-medium">
        <ShieldCheck className="size-4" />
        Consent evidence history
      </h4>
      <div className="mt-4 divide-y divide-border">
        {records.map((record) => {
          const reason = metaConsentBlockReason(record);
          return (
            <div key={record.id} className="grid gap-2 py-3 text-sm md:grid-cols-[1fr_auto]">
              <div>
                <p className="font-medium">
                  {reason ? reasonLabels[reason] : "Advertising and matching accepted"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {record.consent_source.replaceAll("_", " ")} · {record.region} ·{" "}
                  {record.notice_version}
                </p>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  Evidence: {record.evidence_reference}
                </p>
              </div>
              <div className="text-xs text-muted-foreground md:text-right">
                <p>{new Date(record.recorded_at).toLocaleString()}</p>
                <p className="mt-1">
                  Advertising: {record.advertising_accepted ? "accepted" : "refused"} · Matching:{" "}
                  {record.matching_accepted ? "accepted" : "refused"}
                </p>
                {record.withdrawn_at && (
                  <p className="mt-1 text-destructive">
                    Withdrawn {new Date(record.withdrawn_at).toLocaleString()}
                  </p>
                )}
                {record.global_privacy_control && (
                  <p className="mt-1 text-destructive">Global Privacy Control</p>
                )}
              </div>
            </div>
          );
        })}
        {!records.length && (
          <p className="py-6 text-sm text-muted-foreground">
            No consent evidence has been recorded for this lead.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Label className="grid gap-2 text-sm font-normal">
      <span>{label}</span>
      {children}
    </Label>
  );
}
