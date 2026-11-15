import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Download,
  FileSpreadsheet,
  Filter,
  Flame,
  LayoutDashboard,
  ListFilter,
  LoaderCircle,
  LogOut,
  Mail,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Phone,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  UsersRound,
  Workflow,
  X,
} from "lucide-react";
import {
  CartesianGrid,
  Cell as RechartCell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { createClientWorkspace, ensureBediflyAdminAccess, inviteSalesExecutive } from "@/lib/crm.functions";
import { hasCrmWorkspaceAccess, isWithinDateFilter, resolveWorkspaceSelection } from "@/lib/crm-access";
import { createXlsx, normalizeHeader, normalizeLeadPhone, parseCsv, parseLeadDate, parseXlsx } from "@/lib/crm-spreadsheets";
import type { Database } from "@/integrations/supabase/types";
import bediflyLogo from "@/assets/bedifly-logo-trim.png.asset.json";
import { MetaIntegration } from "@/components/meta-integration";

type Organization = Database["public"]["Tables"]["organizations"]["Row"];
type Lead = Database["public"]["Tables"]["leads"]["Row"];
type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
type LeadNote = Database["public"]["Tables"]["lead_notes"]["Row"];
type LeadActivity = Database["public"]["Tables"]["lead_activities"]["Row"];
type FollowUp = Database["public"]["Tables"]["follow_ups"]["Row"];
type Member = Database["public"]["Tables"]["organization_members"]["Row"] & {
  user_roles: { role: Database["public"]["Enums"]["app_role"] }[];
};
type Role = Database["public"]["Tables"]["user_roles"]["Row"];
type ScoringRow = Database["public"]["Tables"]["lead_scoring_settings"]["Row"];
type ScoringValues = Pick<ScoringRow, "valid_phone_points" | "valid_email_points" | "responded_call_points" | "expressed_interest_points" | "meeting_scheduled_points" | "converted_points" | "invalid_number_points" | "duplicate_points" | "junk_lead_points">;
type PageKey = "overview" | "clients" | "leads" | "pipeline" | "team" | "follow-ups" | "reports" | "activity" | "settings" | "meta";

const STATUSES = [
  "New Lead", "Contacted", "Interested", "Qualified", "Meeting Scheduled", "Negotiation", "Converted",
  "Not Interested", "Invalid Number", "Duplicate", "Junk Lead",
];
const QUALITIES = ["Hot", "Warm", "Cold", "Junk"] as const;
const DEFAULT_SCORING: ScoringValues = {
  valid_phone_points: 10, valid_email_points: 5, responded_call_points: 15,
  expressed_interest_points: 20, meeting_scheduled_points: 25, converted_points: 50,
  invalid_number_points: -50, duplicate_points: -100, junk_lead_points: -100,
};
const SCORING_FIELDS: { key: keyof ScoringValues; label: string; min: number; max: number }[] = [
  { key: "valid_phone_points", label: "Valid phone number", min: 0, max: 100 },
  { key: "valid_email_points", label: "Valid email address", min: 0, max: 100 },
  { key: "responded_call_points", label: "Responded to call", min: 0, max: 100 },
  { key: "expressed_interest_points", label: "Expressed interest", min: 0, max: 100 },
  { key: "meeting_scheduled_points", label: "Meeting scheduled", min: 0, max: 100 },
  { key: "converted_points", label: "Converted", min: 0, max: 100 },
  { key: "invalid_number_points", label: "Invalid number", min: -100, max: 0 },
  { key: "duplicate_points", label: "Duplicate", min: -100, max: 0 },
  { key: "junk_lead_points", label: "Junk lead", min: -100, max: 0 },
];
const organizationSchema = z.object({
  name: z.string().trim().min(2, "Enter a company name.").max(120),
  contactPerson: z.string().trim().min(2, "Enter a contact person.").max(120),
  email: z.string().trim().email("Enter a valid email address.").max(254),
  phone: z.string().trim().max(40),
  businessCategory: z.string().trim().max(120),
  website: z.string().trim().max(255),
  address: z.string().trim().max(500),
  city: z.string().trim().max(120),
  country: z.string().trim().max(120),
});
const leadSchema = z.object({
  full_name: z.string().trim().min(2, "Enter the lead’s name.").max(150),
  phone: z.string().trim().max(40), email: z.string().trim().email("Enter a valid email address.").max(254).or(z.literal("")),
  whatsapp_number: z.string().trim().max(40), city: z.string().trim().max(120), state: z.string().trim().max(120),
  country: z.string().trim().max(120), source: z.string().trim().min(1).max(120), form_name: z.string().trim().max(160), source_reference_id: z.string().trim().max(200), campaign_name: z.string().trim().max(160),
  ad_set_name: z.string().trim().max(160), ad_name: z.string().trim().max(160), lead_created_at: z.string().trim().max(10), status: z.string().trim().min(1).max(100),
  quality: z.enum(QUALITIES), assigned_to: z.string(), lead_value: z.string().refine((value) => value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0), "Enter a positive lead value."),
});

const emptyLead = {
  full_name: "", phone: "", email: "", whatsapp_number: "", city: "", state: "", country: "", source: "Manual",
  form_name: "", source_reference_id: "", campaign_name: "", ad_set_name: "", ad_name: "", lead_created_at: "", status: "New Lead", quality: "Warm" as (typeof QUALITIES)[number], assigned_to: "", lead_value: "",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bedifly CRM — Client & Lead Workspace" },
      { name: "description", content: "Manage Bedifly client workspaces, sales leads, follow-ups, and team performance." },
      { property: "og:title", content: "Bedifly CRM — Client & Lead Workspace" },
      { property: "og:description", content: "Secure client workspaces for Bedifly sales teams and lead management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "preload", href: bediflyLogo.url, as: "image" }],
  }),
  component: BediflyCRM,
});

function BediflyCRM() {
  const queryClient = useQueryClient();
  const makeClient = useServerFn(createClientWorkspace);
  const verifyPlatformAccess = useServerFn(ensureBediflyAdminAccess);
  const inviteEmployee = useServerFn(inviteSalesExecutive);
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState("");
  const [role, setRole] = useState<Role["role"] | "">("");
  const [hasWorkspaceAccess, setHasWorkspaceAccess] = useState<boolean | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [allLeads, setAllLeads] = useState<Lead[]>([]);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [scoringValues, setScoringValues] = useState<ScoringValues>(DEFAULT_SCORING);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [page, setPage] = useState<PageKey>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All statuses");
  const [qualityFilter, setQualityFilter] = useState("All qualities");
  const [sourceFilter, setSourceFilter] = useState("All sources");
  const [assigneeFilter, setAssigneeFilter] = useState("All executives");
  const [dateFilter, setDateFilter] = useState("Last 30 days");
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [view, setView] = useState<"table" | "kanban">("table");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [showCreateClient, setShowCreateClient] = useState(false);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [editingLeadId, setEditingLeadId] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [editingClient, setEditingClient] = useState<Organization | null>(null);
  const [saving, setSaving] = useState(false);
  const [clientForm, setClientForm] = useState({ name: "", contactPerson: "", email: "", phone: "", businessCategory: "", website: "", address: "", city: "", country: "" });
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [employeeForm, setEmployeeForm] = useState({ fullName: "", email: "", phone: "" });
  const [noteDraft, setNoteDraft] = useState("");
  const [followUpDraft, setFollowUpDraft] = useState({ scheduledAt: "", note: "" });
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [customStatus, setCustomStatus] = useState("");

  const isMaster = role === "platform_admin";
  const [statusCatalog, setStatusCatalog] = useState<string[]>(STATUSES);
  const statusOptions = useMemo(() => Array.from(new Set([...STATUSES, ...statusCatalog, ...allLeads.map((lead) => lead.status)])), [statusCatalog, allLeads]);
  const activeOrganization = organizations.find((organization) => organization.id === activeOrganizationId) ?? organizations[0] ?? null;
  const membersById = useMemo(() => Object.fromEntries(members.map((member) => [member.user_id, member])), [members]);
  const scopedLeads = useMemo(() => isMaster && activeOrganizationId ? allLeads.filter((lead) => lead.organization_id === activeOrganizationId) : allLeads, [allLeads, isMaster, activeOrganizationId]);
  const sourceOptions = useMemo(() => Array.from(new Set(scopedLeads.map((lead) => lead.source).filter(Boolean))).sort(), [scopedLeads]);
  const visibleLeads = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scopedLeads.filter((lead) => {
      const matchesSearch = !term || [lead.full_name, lead.phone, lead.email, lead.source, lead.campaign_name]
        .some((value) => value?.toLowerCase().includes(term));
      return matchesSearch && (statusFilter === "All statuses" || lead.status === statusFilter) &&
        (qualityFilter === "All qualities" || lead.quality === qualityFilter) &&
        (sourceFilter === "All sources" || lead.source === sourceFilter) &&
        (assigneeFilter === "All executives" || (assigneeFilter === "Unassigned" ? !lead.assigned_to : lead.assigned_to === assigneeFilter)) &&
        isWithinDateFilter(lead.lead_created_at || lead.created_at, dateFilter, customDateStart, customDateEnd);
    });
  }, [scopedLeads, search, statusFilter, qualityFilter, sourceFilter, assigneeFilter, dateFilter, customDateStart, customDateEnd]);
  const stats = useMemo(() => getLeadStats(scopedLeads), [scopedLeads]);
  const chartTrend = useMemo(() => getLeadTrend(scopedLeads), [scopedLeads]);
  const statusBreakdown = useMemo(() => statusOptions.map((status) => ({ name: status, value: scopedLeads.filter((lead) => lead.status === status).length })).filter((entry) => entry.value), [statusOptions, scopedLeads]);
  const qualityBreakdown = useMemo(() => QUALITIES.map((quality) => ({ name: quality, value: scopedLeads.filter((lead) => lead.quality === quality).length })).filter((entry) => entry.value), [scopedLeads]);
  const selectedOrganization = useMemo(() => organizations.find((organization) => organization.id === activeOrganizationId) ?? organizations[0], [organizations, activeOrganizationId]);

  async function loadWorkspace(currentUser: { id: string; email: string }, nextOrgId?: string, scopeLeadsToSelected = false) {
    setLoadingData(true);
    setHasWorkspaceAccess(null);
    setLoadError("");
    try {
      const { data: roles, error: roleError } = await supabase.from("user_roles").select("id, user_id, organization_id, role, created_at").eq("user_id", currentUser.id);
      if (roleError) throw roleError;
      const userRoles = (roles ?? []) as Role[];
      let platformRole = userRoles.find((item) => item.role === "platform_admin");
      if (!platformRole) {
        const verifiedAdmin = await verifyPlatformAccess();
        if (verifiedAdmin.isPlatformAdmin) {
          platformRole = { id: "", user_id: currentUser.id, organization_id: null, role: "platform_admin", created_at: "" };
        }
      }
      const currentRole = platformRole?.role ?? userRoles[0]?.role ?? "";
      setRole(currentRole);
      if (!currentRole) {
        setHasWorkspaceAccess(false);
        setOrganizations([]); setAllLeads([]); setMembers([]); setFollowUps([]);
        setLoadError("This account has no Bedifly workspace access yet. Ask a Bedifly administrator to invite you.");
        return;
      }
      const orgQuery = supabase.from("organizations").select("*").is("deleted_at", null).order("name");
      const { data: orgRows, error: orgError } = platformRole
        ? await orgQuery
        : await orgQuery.in("id", userRoles.map((item) => item.organization_id).filter((id): id is string => Boolean(id)));
      if (orgError) throw orgError;
      const accessibleOrganizations = (orgRows ?? []) as Organization[];
      setHasWorkspaceAccess(hasCrmWorkspaceAccess(Boolean(platformRole), accessibleOrganizations.length));
      setOrganizations(accessibleOrganizations);
      const targetId = resolveWorkspaceSelection(
        Boolean(platformRole),
        nextOrgId,
        activeOrganizationId,
        accessibleOrganizations.map((organization) => organization.id),
      );
      setActiveOrganizationId(targetId);
      const scoringResult = targetId
        ? await supabase.from("lead_scoring_settings").select("*").eq("organization_id", targetId).maybeSingle()
        : { data: null, error: null };
      if (scoringResult.error) throw scoringResult.error;
      if (scoringResult.data) {
        const { id: _id, organization_id: _organizationId, created_at: _createdAt, updated_at: _updatedAt, ...values } = scoringResult.data;
        setScoringValues(values);
      } else setScoringValues(DEFAULT_SCORING);
      const leadQuery = supabase.from("leads").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      const { data: leadRows, error: leadError } = targetId && (!platformRole || scopeLeadsToSelected)
        ? await leadQuery.eq("organization_id", targetId).limit(1000)
        : await leadQuery.limit(1000);
      if (leadError) throw leadError;
      setAllLeads((leadRows ?? []) as Lead[]);

      const orgIds = platformRole ? accessibleOrganizations.map((org) => org.id) : targetId ? [targetId] : [];
      if (orgIds.length) {
        const [memberResult, roleResult, followResult, statusResult] = await Promise.all([
          supabase.from("organization_members").select("*").in("organization_id", orgIds).order("joined_at", { ascending: false }),
          supabase.from("user_roles").select("user_id, role, organization_id").in("organization_id", orgIds),
          supabase.from("follow_ups").select("*").in("organization_id", orgIds).order("scheduled_at").limit(500),
          supabase.from("lead_statuses").select("name").in("organization_id", orgIds).order("position"),
        ]);
        if (memberResult.error) throw memberResult.error;
        if (roleResult.error) throw roleResult.error;
        if (followResult.error) throw followResult.error;
        if (statusResult.error) throw statusResult.error;
        const roleRows = roleResult.data ?? [];
        setMembers((memberResult.data ?? []).map((member) => ({
          ...member,
          user_roles: roleRows.filter((item) => item.user_id === member.user_id && item.organization_id === member.organization_id).map((item) => ({ role: item.role })),
        })) as Member[]);
        setFollowUps((followResult.data ?? []) as FollowUp[]);
        setStatusCatalog((statusResult.data ?? []).map((item) => item.name));
      } else { setMembers([]); setFollowUps([]); setStatusCatalog(STATUSES); }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The workspace could not be loaded.";
      setLoadError(message); toast.error(message);
    } finally { setLoadingData(false); }
  }

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!alive) return;
      if (error && error.message !== "Auth session missing!") setAuthError(error.message);
      const current = data.user ? { id: data.user.id, email: data.user.email ?? "" } : null;
      setUser(current); setAuthReady(true);
      if (current) void loadWorkspace(current);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive || !["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      const current = session?.user ? { id: session.user.id, email: session.user.email ?? "" } : null;
      setUser(current);
      if (current) void loadWorkspace(current);
      else { setRole(""); setHasWorkspaceAccess(false); setOrganizations([]); setAllLeads([]); setMembers([]); setFollowUps([]); }
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  async function refresh(nextOrgId?: string, scopeLeadsToSelected = false) {
    if (user) await loadWorkspace(user, nextOrgId, scopeLeadsToSelected);
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAuthBusy(true); setAuthError("");
    try {
      if (authMode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(authEmail.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("Password reset instructions sent. Check your inbox."); setAuthMode("signin"); return;
      }
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(), password: authPassword,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) { toast.success("Check your email to confirm your Bedifly CRM account."); setAuthMode("signin"); return; }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sign-in could not be completed.";
      setAuthError(message);
    } finally { setAuthBusy(false); }
  }

  async function signInWith(provider: "google" | "lovable") {
    setAuthBusy(true); setAuthError("");
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Sign-in could not be completed."); }
    finally { setAuthBusy(false); }
  }

  async function signOut() {
    await queryClient.cancelQueries(); queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) { toast.error(error.message); return; }
    setUser(null); setRole(""); setOrganizations([]); setAllLeads([]); setMembers([]); setFollowUps([]);
    setHasWorkspaceAccess(false);
    setPage("overview");
  }

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = organizationSchema.safeParse(clientForm);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check the workspace details."); return; }
    setSaving(true);
    try {
      const created = await makeClient({ data: parsed.data });
      toast.success(`${created.name} workspace created. Admin invitation sent.`);
      setShowCreateClient(false); setClientForm({ name: "", contactPerson: "", email: "", phone: "", businessCategory: "", website: "", address: "", city: "", country: "" });
      await refresh(created.id);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Workspace could not be created."); }
    finally { setSaving(false); }
  }

  async function saveOrganizationStatus(organization: Organization) {
    const nextStatus = organization.status === "active" ? "suspended" : "active";
    const { error } = await supabase.from("organizations").update({ status: nextStatus }).eq("id", organization.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${organization.name} is ${nextStatus}.`); await refresh();
  }

  async function submitLead(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeOrganization || !user) return;
    const parsed = leadSchema.safeParse(leadForm);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check the lead details."); return; }
    setSaving(true);
    const value = parsed.data;
    const normalizedPhone = normalizeLeadPhone(value.phone);
    const normalizedEmail = value.email.trim().toLowerCase();
    const duplicate = allLeads.filter((existing) => existing.organization_id === activeOrganization.id).find((existing) =>
      (normalizedPhone.length >= 7 && normalizeLeadPhone(existing.phone) === normalizedPhone) ||
      (normalizedEmail.length > 0 && existing.email?.toLowerCase() === normalizedEmail),
    );
    if (duplicate && !window.confirm(`A lead with similar contact details already exists: ${duplicate.full_name}. Add this as a separate lead?`)) {
      setSaving(false);
      return;
    }
    const payload = {
      full_name: value.full_name,
      phone: value.phone || null,
      email: value.email || null,
      whatsapp_number: value.whatsapp_number || null,
      city: value.city || null,
      state: value.state || null,
      country: value.country || null,
      source: value.source,
      form_name: value.form_name || null,
      source_reference_id: value.source_reference_id || null,
      ...(value.lead_created_at ? { lead_created_at: new Date(`${value.lead_created_at}T12:00:00`).toISOString() } : {}),
      campaign_name: value.campaign_name || null,
      ad_set_name: value.ad_set_name || null,
      ad_name: value.ad_name || null,
      status: value.status,
      quality: value.quality,
      assigned_to: value.assigned_to || null,
      lead_value: value.lead_value ? Number(value.lead_value) : null,
    };
    const currentEditId = editingLeadId;
    const { data, error } = currentEditId
      ? await supabase.from("leads").update(payload).eq("id", currentEditId).select().single()
      : await supabase.from("leads").insert({ ...payload, organization_id: activeOrganization.id, created_by: user.id }).select().single();
    if (error) toast.error(error.message);
    else { toast.success(currentEditId ? "Lead details updated." : "Lead added to your workspace."); setShowCreateLead(false); setEditingLeadId(null); setLeadForm(emptyLead); setActiveLead(data); await refresh(); }
    setSaving(false);
  }

  async function updateLead(lead: Lead, changes: Database["public"]["Tables"]["leads"]["Update"], eventName?: string) {
    const { error } = await supabase.from("leads").update(changes).eq("id", lead.id);
    if (error) { toast.error(error.message); return; }
    if (eventName) toast.success(eventName);
    await refresh();
    setActiveLead((current) => current?.id === lead.id ? { ...current, ...changes, updated_at: new Date().toISOString() } : current);
  }

  async function deleteLead(lead: Lead) {
    if (!window.confirm(`Remove ${lead.full_name} from this workspace?`)) return;
    const { error } = await supabase.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", lead.id);
    if (error) toast.error(error.message);
    else { toast.success("Lead removed."); setActiveLead(null); setSelectedIds((ids) => ids.filter((id) => id !== lead.id)); await refresh(); }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeLead || !activeOrganization || !user || !noteDraft.trim()) return;
    const { error } = await supabase.from("lead_notes").insert({ organization_id: activeOrganization.id, lead_id: activeLead.id, user_id: user.id, content: noteDraft.trim() });
    if (error) { toast.error(error.message); return; }
    setNoteDraft(""); toast.success("Note added to the lead."); await loadLeadDetails(activeLead.id);
  }

  async function loadLeadDetails(leadId: string) {
    const [notesResult, activityResult] = await Promise.all([
      supabase.from("lead_notes").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
      supabase.from("lead_activities").select("*").eq("lead_id", leadId).order("created_at", { ascending: false }),
    ]);
    if (notesResult.error) toast.error(notesResult.error.message);
    if (activityResult.error) toast.error(activityResult.error.message);
    setNotes((notesResult.data ?? []) as LeadNote[]); setActivities((activityResult.data ?? []) as LeadActivity[]);
  }

  async function openLead(lead: Lead) {
    setActiveLead(lead); await loadLeadDetails(lead.id);
  }

  async function submitFollowUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeLead || !activeOrganization || !user || !followUpDraft.scheduledAt) return;
    const assignee = activeLead.assigned_to ?? user.id;
    const { error } = await supabase.from("follow_ups").insert({
      organization_id: activeOrganization.id, lead_id: activeLead.id, assigned_to: assignee,
      scheduled_at: new Date(followUpDraft.scheduledAt).toISOString(), note: followUpDraft.note.trim(), created_by: user.id,
    });
    if (error) { toast.error(error.message); return; }
    const { error: leadError } = await supabase.from("leads").update({ follow_up_at: new Date(followUpDraft.scheduledAt).toISOString() }).eq("id", activeLead.id);
    if (leadError) toast.error(leadError.message);
    else toast.success("Follow-up scheduled.");
    setFollowUpDraft({ scheduledAt: "", note: "" }); await refresh();
  }

  async function completeFollowUp(followUp: FollowUp) {
    const { error } = await supabase.from("follow_ups").update({ completed_at: new Date().toISOString() }).eq("id", followUp.id);
    if (error) toast.error(error.message); else { toast.success("Follow-up completed."); await refresh(); }
  }

  async function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeOrganization) return;
    const input = z.object({ fullName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254), phone: z.string().trim().max(40) }).safeParse(employeeForm);
    if (!input.success) { toast.error(input.error.issues[0]?.message ?? "Check the invitation details."); return; }
    setSaving(true);
    try {
      await inviteEmployee({ data: { ...input.data, organizationId: activeOrganization.id } });
      toast.success("Sales executive invitation sent."); setShowInvite(false); setEmployeeForm({ fullName: "", email: "", phone: "" }); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "The invitation could not be sent."); }
    finally { setSaving(false); }
  }

  async function bulkUpdate(changes: Database["public"]["Tables"]["leads"]["Update"]) {
    if (!selectedIds.length) return;
    const { error } = await supabase.from("leads").update(changes).in("id", selectedIds);
    if (error) toast.error(error.message);
    else { toast.success(`${selectedIds.length} lead${selectedIds.length === 1 ? "" : "s"} updated.`); setSelectedIds([]); await refresh(); }
  }

  async function bulkDelete() {
    if (!selectedIds.length || !window.confirm(`Remove ${selectedIds.length} selected lead${selectedIds.length === 1 ? "" : "s"} from this workspace?`)) return;
    const { error } = await supabase.from("leads").update({ deleted_at: new Date().toISOString() }).in("id", selectedIds);
    if (error) toast.error(error.message);
    else { toast.success(`${selectedIds.length} leads removed.`); setSelectedIds([]); await refresh(); }
  }

  async function moveLead(lead: Lead, status: string) {
    await updateLead(lead, { status }, "Lead status updated.");
  }

  function startEditLead(lead: Lead) {
    setActiveLead(null);
    setEditingLeadId(lead.id);
    setLeadForm({
      full_name: lead.full_name, phone: lead.phone ?? "", email: lead.email ?? "", whatsapp_number: lead.whatsapp_number ?? "",
      city: lead.city ?? "", state: lead.state ?? "", country: lead.country ?? "", source: lead.source, form_name: lead.form_name ?? "", source_reference_id: lead.source_reference_id ?? "", campaign_name: lead.campaign_name ?? "",
      lead_created_at: new Date(lead.lead_created_at).toISOString().slice(0, 10),
      ad_set_name: lead.ad_set_name ?? "", ad_name: lead.ad_name ?? "", status: lead.status,
      quality: lead.quality as (typeof QUALITIES)[number], assigned_to: lead.assigned_to ?? "", lead_value: lead.lead_value?.toString() ?? "",
    });
    setShowCreateLead(true);
  }

  async function setMemberActive(member: Member) {
    const nextState = !member.is_active;
    const { error } = await supabase.from("organization_members").update({ is_active: nextState }).eq("id", member.id);
    if (error) toast.error(error.message);
    else { toast.success(`${member.full_name || member.email || "Team member"} ${nextState ? "activated" : "deactivated"}.`); await refresh(); }
  }

  async function addStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = customStatus.trim().slice(0, 60);
    if (!activeOrganization || name.length < 2) return;
    const { error } = await supabase.from("lead_statuses").insert({ organization_id: activeOrganization.id, name, position: statusOptions.length, is_default: false, is_terminal: false });
    if (error) toast.error(error.message); else { toast.success("Status added to this workspace."); setCustomStatus(""); await refresh(); }
  }

  async function saveScoringSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeOrganization) return;
    setSaving(true);
    const { error } = await supabase.from("lead_scoring_settings").upsert({
      organization_id: activeOrganization.id,
      ...scoringValues,
    }, { onConflict: "organization_id" });
    if (error) toast.error(error.message);
    else {
      toast.success("Scoring rules saved. Existing leads have been rescored.");
      await refresh(activeOrganization.id, true);
    }
    setSaving(false);
  }

  async function importCsv(file?: File) {
    if (!file || !activeOrganization || !user) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Choose a CSV file smaller than 5 MB."); return; }
    setSaving(true);
    try {
      const rows = (file.name.toLowerCase().endsWith(".xlsx") ? await parseXlsx(await file.arrayBuffer()) : parseCsv(await file.text())).slice(0, 501);
    if (rows.length < 2) throw new Error("The spreadsheet needs a header row and at least one lead.");
      const headers = rows[0]?.map(normalizeHeader) ?? [];
      const idx = (names: string[]) => headers.findIndex((header) => names.includes(header));
      const nameIndex = idx(["full name", "name", "lead name"]);
      if (nameIndex < 0) throw new Error("Add a Full Name or Name column to the CSV.");
      const phoneIndex = idx(["phone", "phone number", "mobile"]);
      const emailIndex = idx(["email", "email address"]);
      const sourceIndex = idx(["source", "lead source"]);
      const formIndex = idx(["form name", "form"]);
      const referenceIndex = idx(["source reference id", "reference id", "lead id"]);
      const campaignIndex = idx(["campaign", "campaign name"]);
      const adSetIndex = idx(["ad set", "ad set name"]);
      const adIndex = idx(["ad", "ad name"]);
      const statusIndex = idx(["status", "lead status"]);
      const qualityIndex = idx(["quality", "lead quality"]);
      const cityIndex = idx(["city"]);
      const stateIndex = idx(["state"]);
      const countryIndex = idx(["country"]);
      const whatsappIndex = idx(["whatsapp", "whatsapp number"]);
      const createdDateIndex = idx(["lead created date", "created date", "lead date"]);
      const candidates = rows.slice(1, 501).map((row): LeadInsert | null => {
        const name = row[nameIndex]?.trim() ?? "";
        if (!name) return null;
        const phone = phoneIndex >= 0 ? row[phoneIndex]?.trim() ?? "" : "";
        const email = emailIndex >= 0 ? row[emailIndex]?.trim() ?? "" : "";
        if (email && !z.string().email().safeParse(email).success) return null;
        const statusValue = statusIndex >= 0 ? row[statusIndex]?.trim() : "";
        const qualityValue = qualityIndex >= 0 ? row[qualityIndex]?.trim() : "";
        const createdDate = createdDateIndex >= 0 ? parseLeadDate(row[createdDateIndex]?.trim() ?? "") : null;
        return {
          organization_id: activeOrganization.id, created_by: user.id, full_name: name.slice(0, 150), phone: phone.slice(0, 40) || null,
          email: email.slice(0, 254) || null, whatsapp_number: whatsappIndex >= 0 ? row[whatsappIndex]?.trim().slice(0, 40) || null : null,
          city: cityIndex >= 0 ? row[cityIndex]?.trim().slice(0, 120) || null : null,
          state: stateIndex >= 0 ? row[stateIndex]?.trim().slice(0, 120) || null : null,
          country: countryIndex >= 0 ? row[countryIndex]?.trim().slice(0, 120) || null : null,
          source: sourceIndex >= 0 ? row[sourceIndex]?.trim().slice(0, 120) || "Manual" : "CSV import",
          form_name: formIndex >= 0 ? row[formIndex]?.trim().slice(0, 160) || null : null,
          source_reference_id: referenceIndex >= 0 ? row[referenceIndex]?.trim().slice(0, 200) || null : null,
          campaign_name: campaignIndex >= 0 ? row[campaignIndex]?.trim().slice(0, 160) || null : null,
          ad_set_name: adSetIndex >= 0 ? row[adSetIndex]?.trim().slice(0, 160) || null : null,
          ad_name: adIndex >= 0 ? row[adIndex]?.trim().slice(0, 160) || null : null,
          ...(createdDate ? { lead_created_at: createdDate } : {}),
          status: statusValue && statusOptions.includes(statusValue) ? statusValue : "New Lead",
          quality: (QUALITIES.includes(qualityValue as (typeof QUALITIES)[number]) ? qualityValue : "Warm") as (typeof QUALITIES)[number],
        };
      }).filter((row): row is LeadInsert => row !== null);
      if (!candidates.length) throw new Error("No valid lead rows were found in this file.");
    const workspaceLeads = allLeads.filter((lead) => lead.organization_id === activeOrganization.id);
    const existingPhones = new Set(workspaceLeads.map((lead) => normalizeLeadPhone(lead.phone)).filter((phone) => phone.length >= 7));
    const existingEmails = new Set(workspaceLeads.map((lead) => lead.email?.toLowerCase()).filter(Boolean));
      const deduplicated = candidates.filter((row) => {
        const normalizedPhone = normalizeLeadPhone(row.phone);
        if (normalizedPhone.length >= 7 && existingPhones.has(normalizedPhone)) return false;
        if (row.email && existingEmails.has(row.email.toLowerCase())) return false;
        if (normalizedPhone.length >= 7) existingPhones.add(normalizedPhone);
        if (row.email) existingEmails.add(row.email.toLowerCase());
        return true;
      });
      if (deduplicated.length) {
        const { error } = await supabase.from("leads").insert(deduplicated);
        if (error) throw error;
      }
      toast.success(`${deduplicated.length} leads imported${candidates.length !== deduplicated.length ? `; ${candidates.length - deduplicated.length} duplicates skipped` : ""}.`);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "This CSV could not be imported."); }
    finally { setSaving(false); }
  }

  async function exportLeads(rows: Lead[] = visibleLeads, fileName = "bedifly-leads", format: "csv" | "xlsx" = "csv") {
    const header = ["Full Name", "Phone", "Email", "WhatsApp", "City", "State", "Country", "Source", "Form Name", "Source Reference ID", "Campaign", "Ad Set", "Ad", "Lead Created Date", "Status", "Quality", "Lead Score", "Lead Value", "Assigned To", "Created At"];
    const body = rows.map((lead) => [lead.full_name, lead.phone, lead.email, lead.whatsapp_number, lead.city, lead.state, lead.country, lead.source, lead.form_name, lead.source_reference_id, lead.campaign_name, lead.ad_set_name, lead.ad_name, lead.lead_created_at, lead.status, lead.quality, lead.lead_score, lead.lead_value, lead.assigned_to ? memberName(membersById[lead.assigned_to], lead.assigned_to) : "Unassigned", lead.created_at]);
    const baseName = fileName.replace(/\.[^.]+$/, "");
    if (format === "xlsx") await downloadExcel([header, ...body], `${baseName}.xlsx`);
    else downloadCsv([header, ...body], `${baseName}.csv`);
    toast.success(`${rows.length} workspace-scoped leads exported.`);
  }

  const activeFollowUps = followUps.filter((followUp) => !followUp.completed_at);
  const overdueFollowUps = activeFollowUps.filter((followUp) => new Date(followUp.scheduled_at) < new Date());
  const currentNav = isMaster
    ? [
        { key: "overview" as const, label: "Overview", icon: LayoutDashboard }, { key: "clients" as const, label: "Clients", icon: Building2 },
        { key: "leads" as const, label: "All leads", icon: UsersRound }, { key: "team" as const, label: "Team", icon: Users },
        { key: "reports" as const, label: "Reports", icon: BarChart3 }, { key: "activity" as const, label: "Activity logs", icon: Activity },
        { key: "meta" as const, label: "Meta Integrations", icon: Target },
        { key: "settings" as const, label: "Settings", icon: Settings2 },
      ]
    : [
        { key: "overview" as const, label: role === "sales_exec" ? "My dashboard" : "Dashboard", icon: LayoutDashboard },
        { key: "leads" as const, label: role === "sales_exec" ? "My leads" : "Leads", icon: UsersRound },
        { key: "pipeline" as const, label: "Pipeline", icon: Workflow }, { key: "follow-ups" as const, label: "Follow-ups", icon: CalendarClock },
        { key: "team" as const, label: role === "sales_exec" ? "My performance" : "Sales team", icon: Users },
        { key: "reports" as const, label: "Reports", icon: BarChart3 }, { key: "settings" as const, label: "Settings", icon: Settings2 },
        ...(role !== "sales_exec" ? [{ key: "meta" as const, label: "Meta Ads", icon: Target }] : []),
      ];

  if (!authReady) return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" /> Loading Bedifly CRM</div>;
  if (!user) return <AuthScreen mode={authMode} setMode={setAuthMode} email={authEmail} setEmail={setAuthEmail} password={authPassword} setPassword={setAuthPassword} busy={authBusy} error={authError} onSubmit={submitAuth} onProvider={signInWith} />;
  if (hasWorkspaceAccess === null && loadingData) return <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" /> Checking workspace access</div>;
  if (hasWorkspaceAccess === null || !hasWorkspaceAccess) return <WorkspaceAccessScreen email={user.email} verificationFailed={hasWorkspaceAccess === null} onRetry={() => void loadWorkspace(user)} onSignOut={signOut} />;

  return (
    <div className="crm-shell flex">
      <aside className="crm-sidebar hidden w-[240px] shrink-0 flex-col lg:flex">
        <div className="flex h-[72px] items-center gap-3 border-b border-sidebar-border px-6">
          <img src={bediflyLogo.url} alt="Bedifly" className="h-10 w-auto max-w-[132px] object-contain object-left" />
          <span className="border-l border-sidebar-border pl-3 text-[11px] font-semibold uppercase text-muted-foreground">CRM</span>
        </div>
        <div className="px-4 pt-6">
          <p className="mb-3 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Workspace</p>
          {isMaster ? (
            <button className="flex h-11 w-full items-center justify-between rounded-md bg-card px-3 text-left text-sm font-medium text-foreground" onClick={() => setPage("overview")}>
              <span className="flex min-w-0 items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded bg-accent text-accent-foreground"><Building2 className="size-4" /></span><span className="truncate">Bedifly platform</span></span><ChevronDown className="size-4 text-muted-foreground" />
            </button>
          ) : (
            <label className="flex h-11 items-center justify-between rounded-md bg-card px-3 text-sm font-medium text-foreground">
              <span className="flex min-w-0 items-center gap-2"><span className="grid size-7 shrink-0 place-items-center rounded bg-accent text-accent-foreground"><Building2 className="size-4" /></span><span className="truncate">{activeOrganization?.name ?? "Workspace"}</span></span>
              {organizations.length > 1 && <select aria-label="Switch workspace" className="max-w-[74px] bg-transparent text-xs text-muted-foreground" value={activeOrganizationId} onChange={(event) => { setActiveOrganizationId(event.target.value); void refresh(event.target.value); }}>
                {organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}
              </select>}
            </label>
          )}
        </div>
        <nav aria-label="Main navigation" className="mt-7 flex flex-1 flex-col gap-1 px-3">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Manage</p>
          {isMaster && <label className="mb-2 mt-2 grid gap-1 px-3 text-[10px] font-semibold uppercase text-muted-foreground">Client workspace<select aria-label="Open a client workspace" className="h-9 rounded-md border border-border bg-card px-2 text-xs font-normal normal-case text-foreground" value={activeOrganizationId} onChange={(event) => { const id = event.target.value; setActiveOrganizationId(id); setPage("leads"); setSelectedIds([]); void refresh(id); }}><option value="">All client workspaces</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></label>}
          {currentNav.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => { setPage(key); setSelectedIds([]); setMobileNavOpen(false); if (isMaster && key === "overview" && user) void loadWorkspace(user); }} data-active={page === key} className="crm-nav-item flex h-10 items-center gap-3 rounded-md px-3 text-left text-[13px] font-medium"><Icon className="size-[17px]" />{label}{key === "follow-ups" && overdueFollowUps.length > 0 && <span className="ml-auto rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] text-destructive">{overdueFollowUps.length}</span>}</button>)}
        </nav>
        <div className="mx-4 mb-4 rounded-md bg-accent/50 p-3">
          <div className="flex items-center gap-2 text-xs font-medium text-foreground"><CircleHelp className="size-4 text-primary" /> Bedifly CRM</div>
          <p className="mt-1 text-[11px] text-muted-foreground">Sales workspace</p>
        </div>
        <div className="border-t border-sidebar-border px-4 py-4">
          <button onClick={signOut} className="crm-nav-item flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm"><LogOut className="size-4" /> Sign out</button>
          <div className="mt-3 flex items-center gap-3 px-2">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{initials(user.email)}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-foreground">{user.email}</p><p className="text-[11px] capitalize text-muted-foreground">{formatRole(role)}</p></div>
            <MoreHorizontal className="size-4 text-muted-foreground" />
          </div>
        </div>
      </aside>

    <main className="min-w-0 flex-1">
        <header className="crm-topbar sticky top-0 z-20 flex min-h-[72px] items-center justify-between gap-4 px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button aria-label="Open navigation" className="crm-nav-item grid size-9 place-items-center rounded-md lg:hidden" onClick={() => setMobileNavOpen(true)}><Menu className="size-5" /></button>
            <div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-xs text-muted-foreground">{isMaster ? "Bedifly / Platform" : `Workspaces / ${activeOrganization?.name ?? "Workspace"}`}</p>{isMaster && <span className="shrink-0 rounded-sm bg-accent px-2 py-0.5 text-[10px] font-medium text-accent-foreground">Platform</span>}</div><h1 className="truncate text-[16px] font-semibold text-foreground">{pageTitle(page, isMaster)}</h1></div>
          </div>
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <div className="hidden items-center gap-2 rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground sm:flex"><Command className="size-3" /> <span>Bedifly CRM</span></div>
            <Button variant="ghost" size="icon" aria-label="Follow-up reminders" className="relative" onClick={() => setPage(isMaster ? "activity" : "follow-ups")}><Bell className="size-4" />{overdueFollowUps.length > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-destructive" />}</Button>
            {!isMaster && role !== "sales_exec" && <Button onClick={() => { setLeadForm(emptyLead); setShowCreateLead(true); }} size="sm" className="hidden sm:inline-flex"><Plus className="size-4" /> New lead</Button>}
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] px-4 py-7 md:px-8 md:py-8">
          {loadingData && <div className="mb-5 flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Updating workspace</div>}
          {loadError && <div className="mb-5 rounded-md border border-accent bg-accent/50 px-4 py-3 text-sm text-accent-foreground">{loadError}</div>}
          {!activeOrganization && !isMaster && !loadError && <div className="crm-card p-8 text-center"><Building2 className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 text-lg font-semibold">No workspace access</h2><p className="mt-1 text-sm text-muted-foreground">Ask your Bedifly administrator to send you a workspace invitation.</p></div>}
          {(page === "overview") && <OverviewPage isMaster={isMaster} organization={activeOrganization} organizations={organizations} stats={stats} leads={scopedLeads} members={members} followUps={activeFollowUps.filter((item) => !isMaster || !activeOrganizationId || item.organization_id === activeOrganizationId)} trend={chartTrend} statuses={statusBreakdown} qualities={qualityBreakdown} onOpenLead={openLead} onPage={setPage} />}
          {page === "clients" && isMaster && <ClientsPage organizations={organizations} leads={allLeads} stats={stats} onCreate={() => setShowCreateClient(true)} onEdit={(organization) => { setEditingClient(organization); setClientForm({ name: organization.name, contactPerson: organization.contact_person ?? "", email: organization.email ?? "", phone: organization.phone ?? "", businessCategory: organization.business_category ?? "", website: organization.website ?? "", address: organization.address ?? "", city: organization.city ?? "", country: organization.country ?? "" }); setShowCreateClient(true); }} onToggleStatus={saveOrganizationStatus} onOpen={(organization) => { setActiveOrganizationId(organization.id); setPage("leads"); void refresh(organization.id); }} />}
      {(page === "leads" || page === "pipeline") && <LeadsPage page={page} isMaster={isMaster} canManageLeads={role !== "sales_exec"} leads={visibleLeads} members={members} sourceOptions={sourceOptions} stats={getLeadStats(visibleLeads)} search={search} setSearch={setSearch} statusFilter={statusFilter} setStatusFilter={setStatusFilter} qualityFilter={qualityFilter} setQualityFilter={setQualityFilter} sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} assigneeFilter={assigneeFilter} setAssigneeFilter={setAssigneeFilter} dateFilter={dateFilter} setDateFilter={setDateFilter} customDateStart={customDateStart} setCustomDateStart={setCustomDateStart} customDateEnd={customDateEnd} setCustomDateEnd={setCustomDateEnd} view={page === "pipeline" ? "kanban" : view} setView={setView} selectedIds={selectedIds} setSelectedIds={setSelectedIds} statusOptions={statusOptions} onOpenLead={openLead} onCreate={() => { setEditingLeadId(null); setLeadForm(emptyLead); setShowCreateLead(true); }} onExport={() => void exportLeads()} onExportExcel={() => void exportLeads(visibleLeads, "bedifly-leads", "xlsx")} onImport={importCsv} onBulkUpdate={bulkUpdate} onBulkDelete={bulkDelete} onMoveLead={moveLead} bulkAssignee={bulkAssignee} setBulkAssignee={setBulkAssignee} membersById={membersById} />}
          {page === "team" && <TeamPage isMaster={isMaster} canManageTeam={role !== "sales_exec"} organizations={organizations} members={members} leads={allLeads} followUps={activeFollowUps} onInvite={() => setShowInvite(true)} onToggleMember={setMemberActive} />}
          {page === "follow-ups" && <FollowUpsPage followUps={activeFollowUps} leads={allLeads} membersById={membersById} onComplete={completeFollowUp} onOpenLead={(id) => { const lead = allLeads.find((row) => row.id === id); if (lead) void openLead(lead); }} />}
          {page === "reports" && <ReportsPage leads={scopedLeads} members={members} onExport={(rows, name) => void exportLeads(rows, name)} onExportExcel={(rows, name) => void exportLeads(rows, name, "xlsx")} />}
          {page === "activity" && <ActivityPage leads={scopedLeads} stats={stats} organizations={organizations} />}
          {page === "settings" && <SettingsPage organization={activeOrganization} statuses={statusOptions} customStatus={customStatus} setCustomStatus={setCustomStatus} onAddStatus={addStatus} scoringValues={scoringValues} setScoringValues={setScoringValues} onSaveScoring={saveScoringSettings} isMaster={isMaster} canManageSettings={role !== "sales_exec"} saving={saving} />}
          {page === "meta" && role !== "sales_exec" && <MetaIntegration organizationId={isMaster ? activeOrganizationId || null : activeOrganization?.id ?? null} members={members} statuses={statusOptions} />}
        </div>
      </main>

      {mobileNavOpen && <div className="fixed inset-0 z-40 bg-foreground/35 lg:hidden" onClick={() => setMobileNavOpen(false)}><aside className="crm-sidebar flex h-full w-[280px] max-w-[85vw] flex-col shadow-xl" onClick={(event) => event.stopPropagation()}><div className="flex h-[72px] items-center justify-between border-b border-sidebar-border px-5"><img src={bediflyLogo.url} alt="Bedifly CRM" className="h-10 max-w-[145px] object-contain object-left" /><Button variant="ghost" size="icon" aria-label="Close navigation" onClick={() => setMobileNavOpen(false)}><X className="size-4" /></Button></div><nav className="flex flex-1 flex-col gap-1 px-3 py-5">{currentNav.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => { setPage(key); setMobileNavOpen(false); if (isMaster && key === "overview" && user) void loadWorkspace(user); }} data-active={page === key} className="crm-nav-item flex h-11 items-center gap-3 rounded-md px-3 text-left text-sm"><Icon className="size-4" />{label}</button>)}</nav><button onClick={signOut} className="crm-nav-item flex items-center gap-3 border-t border-sidebar-border px-5 py-4 text-sm"><LogOut className="size-4" /> Sign out</button></aside></div>}

      {showCreateClient && <Modal title={editingClient ? "Edit client" : "Add a client workspace"} subtitle="A private workspace for a client team." onClose={() => { setShowCreateClient(false); setEditingClient(null); }}>
        <form onSubmit={editingClient ? async (event) => { event.preventDefault(); if (!editingClient) return; const parsed = organizationSchema.safeParse(clientForm); if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Check the details."); return; } setSaving(true); const { error } = await supabase.from("organizations").update({ name: parsed.data.name, contact_person: parsed.data.contactPerson, email: parsed.data.email, phone: parsed.data.phone || null, business_category: parsed.data.businessCategory || null, website: parsed.data.website || null, address: parsed.data.address || null, city: parsed.data.city || null, country: parsed.data.country || null }).eq("id", editingClient.id); if (error) toast.error(error.message); else { toast.success("Client updated."); setShowCreateClient(false); setEditingClient(null); await refresh(); } setSaving(false); } : createOrganization} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">{clientField("Company name", "name", clientForm, setClientForm, true)}{clientField("Contact person", "contactPerson", clientForm, setClientForm, true)}{clientField("Email address", "email", clientForm, setClientForm, true, "email")}{clientField("Phone number", "phone", clientForm, setClientForm)}{clientField("Business category", "businessCategory", clientForm, setClientForm)}{clientField("Website", "website", clientForm, setClientForm, false, "url")}{clientField("City", "city", clientForm, setClientForm)}{clientField("Country", "country", clientForm, setClientForm)}</div>
          <Field label="Address"><Input value={clientForm.address} onChange={(event) => setClientForm({ ...clientForm, address: event.target.value })} maxLength={500} /></Field>
          {!editingClient && <p className="rounded-md bg-accent/40 p-3 text-xs text-muted-foreground">We’ll send the first workspace administrator a secure email invitation.</p>}
          <div className="flex justify-end gap-2 pt-2"><Button type="button" variant="outline" onClick={() => { setShowCreateClient(false); setEditingClient(null); }}>Cancel</Button><Button disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}{editingClient ? "Save client" : "Create workspace"}</Button></div>
        </form>
      </Modal>}

      {showCreateLead && <Modal title={editingLeadId ? "Edit lead details" : "Add a lead"} subtitle={editingLeadId ? "Update the lead’s workspace information." : "Create a lead in the current client workspace."} onClose={() => { setShowCreateLead(false); setEditingLeadId(null); }} wide>
        <form onSubmit={submitLead} className="space-y-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Full name" required><Input autoFocus value={leadForm.full_name} onChange={(event) => setLeadForm({ ...leadForm, full_name: event.target.value })} maxLength={150} required /></Field>
          <Field label="Phone number"><Input type="tel" value={leadForm.phone} onChange={(event) => setLeadForm({ ...leadForm, phone: event.target.value })} maxLength={40} /></Field>
          <Field label="Email"><Input type="email" value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} maxLength={254} /></Field>
          <Field label="WhatsApp"><Input type="tel" value={leadForm.whatsapp_number} onChange={(event) => setLeadForm({ ...leadForm, whatsapp_number: event.target.value })} maxLength={40} /></Field>
          <Field label="City"><Input value={leadForm.city} onChange={(event) => setLeadForm({ ...leadForm, city: event.target.value })} maxLength={120} /></Field>
          <Field label="State"><Input value={leadForm.state} onChange={(event) => setLeadForm({ ...leadForm, state: event.target.value })} maxLength={120} /></Field>
          <Field label="Country"><Input value={leadForm.country} onChange={(event) => setLeadForm({ ...leadForm, country: event.target.value })} maxLength={120} /></Field>
          <Field label="Lead source"><Input value={leadForm.source} onChange={(event) => setLeadForm({ ...leadForm, source: event.target.value })} maxLength={120} required /></Field>
          <Field label="Form name"><Input value={leadForm.form_name} onChange={(event) => setLeadForm({ ...leadForm, form_name: event.target.value })} maxLength={160} /></Field>
          <Field label="Source reference ID"><Input value={leadForm.source_reference_id} onChange={(event) => setLeadForm({ ...leadForm, source_reference_id: event.target.value })} maxLength={200} /></Field>
          <Field label="Lead created date"><Input type="date" value={leadForm.lead_created_at} onChange={(event) => setLeadForm({ ...leadForm, lead_created_at: event.target.value })} /></Field>
          <Field label="Campaign name"><Input value={leadForm.campaign_name} onChange={(event) => setLeadForm({ ...leadForm, campaign_name: event.target.value })} maxLength={160} /></Field>
          <Field label="Ad set name"><Input value={leadForm.ad_set_name} onChange={(event) => setLeadForm({ ...leadForm, ad_set_name: event.target.value })} maxLength={160} /></Field>
          <Field label="Ad name"><Input value={leadForm.ad_name} onChange={(event) => setLeadForm({ ...leadForm, ad_name: event.target.value })} maxLength={160} /></Field>
          <Field label="Lead value"><Input type="number" min="0" step="0.01" value={leadForm.lead_value} onChange={(event) => setLeadForm({ ...leadForm, lead_value: event.target.value })} /></Field>
          <Field label="Status"><select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={leadForm.status} onChange={(event) => setLeadForm({ ...leadForm, status: event.target.value })}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></Field>
          <Field label="Quality"><select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={leadForm.quality} onChange={(event) => setLeadForm({ ...leadForm, quality: event.target.value as (typeof QUALITIES)[number] })}>{QUALITIES.map((quality) => <option key={quality}>{quality}</option>)}</select></Field>
          <Field label="Assign to"><select className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={leadForm.assigned_to} onChange={(event) => setLeadForm({ ...leadForm, assigned_to: event.target.value })}><option value="">Unassigned</option>{members.filter((member) => member.is_active && member.user_roles?.some((item) => item.role === "sales_exec")).map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email || member.user_id}</option>)}</select></Field>
        </div><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowCreateLead(false)}>Cancel</Button><Button disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}Save lead</Button></div></form>
      </Modal>}

      {showInvite && <Modal title="Invite a sales executive" subtitle="They’ll receive a secure sign-in invitation by email." onClose={() => setShowInvite(false)}>
        <form onSubmit={submitEmployee} className="space-y-4"><Field label="Full name" required><Input value={employeeForm.fullName} onChange={(event) => setEmployeeForm({ ...employeeForm, fullName: event.target.value })} maxLength={120} required /></Field><Field label="Email address" required><Input type="email" value={employeeForm.email} onChange={(event) => setEmployeeForm({ ...employeeForm, email: event.target.value })} maxLength={254} required /></Field><Field label="Phone number"><Input type="tel" value={employeeForm.phone} onChange={(event) => setEmployeeForm({ ...employeeForm, phone: event.target.value })} maxLength={40} /></Field><div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button><Button disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}Send invitation</Button></div></form>
      </Modal>}

      {activeLead && <Modal title={activeLead.full_name} subtitle={`${activeLead.source} · Added ${formatDate(activeLead.created_at)}`} onClose={() => { setActiveLead(null); setNotes([]); setActivities([]); }} wide>
        <LeadDetail lead={activeLead} members={members} statuses={statusOptions} notes={notes} activities={activities} onUpdate={updateLead} onDelete={deleteLead} onEdit={startEditLead} canManageLeads={role !== "sales_exec"} noteDraft={noteDraft} setNoteDraft={setNoteDraft} onAddNote={submitNote} followUpDraft={followUpDraft} setFollowUpDraft={setFollowUpDraft} onSchedule={submitFollowUp} />
      </Modal>}
    </div>
  );
}

function WorkspaceAccessScreen({ email, verificationFailed, onRetry, onSignOut }: { email: string; verificationFailed: boolean; onRetry: () => void; onSignOut: () => void }) {
  return <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
    <section className="crm-card w-full max-w-[460px] p-6 sm:p-8">
      <img src={bediflyLogo.url} alt="Bedifly" className="h-10 max-w-[140px] object-contain object-left" />
      <div className="mt-8 grid size-11 place-items-center rounded-md bg-accent text-accent-foreground"><ShieldCheck className="size-5" /></div>
      <h1 className="mt-5 text-xl font-semibold text-foreground">{verificationFailed ? "Workspace access couldn’t be confirmed" : "Workspace invitation needed"}</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{verificationFailed ? "We couldn’t confirm access to your Bedifly workspace. Try again, or sign out and contact your administrator." : "This account is signed in, but it isn’t assigned to a Bedifly CRM workspace yet. Ask your administrator to send an invitation to this email address."}</p>
      <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-foreground">{email}</p>
      <div className="mt-6 flex flex-wrap gap-2"><Button onClick={onRetry}><LoaderCircle className="size-4" /> Check access again</Button><Button variant="outline" onClick={onSignOut}><LogOut className="size-4" /> Sign out</Button></div>
    </section>
  </main>;
}

function AuthScreen({ mode, setMode, email, setEmail, password, setPassword, busy, error, onSubmit, onProvider }: {
  mode: "signin" | "signup" | "forgot"; setMode: (mode: "signin" | "signup" | "forgot") => void; email: string; setEmail: (value: string) => void;
  password: string; setPassword: (value: string) => void; busy: boolean; error: string; onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onProvider: (provider: "google" | "lovable") => void;
}) {
  return <div className="grid min-h-screen bg-background lg:grid-cols-[minmax(350px,0.9fr)_1.1fr]">
    <div className="flex min-h-screen flex-col px-6 py-7 sm:px-10 lg:px-[max(48px,10vw)]">
      <div className="flex items-center gap-3"><img src={bediflyLogo.url} alt="Bedifly" className="h-12 max-w-[160px] object-contain object-left" /><span className="border-l border-border pl-3 text-xs font-semibold uppercase text-muted-foreground">CRM</span></div>
      <div className="flex flex-1 items-center py-10"><div className="mx-auto w-full max-w-[390px]">
        <div className="mb-8"><p className="mb-3 flex items-center gap-2 text-xs font-medium text-primary"><span className="size-1.5 rounded-full bg-primary" /> Secure workspace access</p><h1 className="text-[30px] font-semibold leading-tight text-foreground">{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Welcome back"}</h1><p className="mt-2 text-sm text-muted-foreground">{mode === "signup" ? "Create a Bedifly CRM login to continue." : mode === "forgot" ? "Enter your email and we’ll send you a secure reset link." : "Sign in to your Bedifly CRM workspace."}</p></div>
        {mode !== "forgot" && <div className="mb-5 grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="h-10 w-full border-border bg-card text-foreground hover:bg-muted" disabled={busy} onClick={() => onProvider("google")}><GoogleMark /> Continue with Google</Button>
          <Button variant="outline" className="h-10 w-full border-border bg-card text-foreground hover:bg-muted" disabled={busy} onClick={() => onProvider("lovable")}><Sparkles className="size-4" /> Continue with Lovable</Button>
        </div>}
        {mode !== "forgot" && <div className="mb-5 flex items-center gap-3 text-[11px] text-muted-foreground"><span className="h-px flex-1 bg-border" /> or continue with email <span className="h-px flex-1 bg-border" /></div>}
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Work email" required><Input autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@company.com" maxLength={254} required /></Field>
          {mode !== "forgot" && <Field label="Password" required><Input autoComplete={mode === "signin" ? "current-password" : "new-password"} type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required /></Field>}
          {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{error}</p>}
          {mode === "signin" && <div className="flex justify-end"><button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setMode("forgot")}>Forgot password?</button></div>}
          <Button disabled={busy} className="h-10 w-full">{busy && <LoaderCircle className="size-4 animate-spin" />}{mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}<ArrowRight className="size-4" /></Button>
        </form>
        <p className="mt-6 text-center text-xs text-muted-foreground">{mode === "signup" ? "Already have an account?" : mode === "forgot" ? "Remember your password?" : "New to Bedifly CRM?"}{" "}<button className="font-medium text-primary hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signup" || mode === "forgot" ? "Sign in" : "Create an account"}</button></p>
        <div className="mt-8 rounded-md border border-border bg-muted/45 p-3 text-[11px] leading-relaxed text-muted-foreground"><ShieldCheck className="mr-1 inline size-3.5 text-primary" /> Your client’s workspace and sales data are protected by role-based access.</div>
      </div></div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground"><span>© {new Date().getFullYear()} Bedifly</span><span>Private client workspaces</span></div>
    </div>
    <div className="relative hidden overflow-hidden border-l border-border bg-primary/[0.035] lg:flex lg:items-center lg:justify-center">
      <div className="absolute inset-y-0 left-0 w-px bg-border" />
      <div className="relative mx-14 max-w-[620px]">
        <div className="mb-8 flex items-center gap-2 rounded-full border border-primary/15 bg-card px-3 py-1.5 text-[11px] font-medium text-primary"><span className="size-1.5 rounded-full bg-primary" /> Bedifly client workspace</div>
        <h2 className="max-w-[580px] text-5xl font-semibold leading-[1.12] text-foreground">A clearer view of every <span className="text-primary">client conversation.</span></h2>
        <p className="mt-5 max-w-[440px] text-sm leading-6 text-muted-foreground">Keep client workspaces separate while your team follows every lead, handoff, and next step in one place.</p>
        <div className="mt-12 grid grid-cols-2 gap-4">
          <div className="crm-card p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Lead tracking</span><Target className="size-4 text-primary" /></div><div className="mt-4 flex items-center gap-2"><span className="size-2 rounded-full bg-chart-2" /><span className="size-2 rounded-full bg-chart-1" /><span className="size-2 rounded-full bg-chart-4" /><span className="size-2 rounded-full bg-chart-5" /><span className="ml-2 text-xs text-foreground">Clear pipeline</span></div><div className="mt-4 h-1 rounded-full bg-muted"><div className="h-full w-2/3 rounded-full bg-primary" /></div></div>
          <div className="crm-card p-4"><div className="flex items-center justify-between text-xs text-muted-foreground"><span>Follow-ups</span><Clock3 className="size-4 text-accent-foreground" /></div><p className="mt-4 text-[15px] font-medium text-foreground">Every next step,</p><p className="text-xs text-muted-foreground">on the right timeline.</p></div>
        </div>
        <div className="mt-5 flex items-center gap-2 text-[11px] text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Tenant-isolated client access <span className="mx-1 text-border">·</span> Built around your sales team</div>
      </div>
    </div>
  </div>;
}

function GoogleMark() {
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>;
}

function OverviewPage({ isMaster, organization, organizations, stats, leads, members, followUps, trend, statuses, qualities, onOpenLead, onPage }: {
  isMaster: boolean; organization: Organization | null; organizations: Organization[]; stats: ReturnType<typeof getLeadStats>; leads: Lead[]; members: Member[]; followUps: FollowUp[];
  trend: { date: string; leads: number }[]; statuses: { name: string; value: number }[]; qualities: { name: string; value: number }[];
  onOpenLead: (lead: Lead) => void; onPage: (page: PageKey) => void;
}) {
  const activeClients = organizations.filter((item) => item.status === "active").length;
  const metrics = isMaster ? [
    { label: "Total clients", value: organizations.length, hint: "Registered workspaces", icon: Building2, tone: "blue" },
    { label: "Active clients", value: activeClients, hint: "Currently in service", icon: ShieldCheck, tone: "green" },
    { label: "Total leads", value: stats.total, hint: "Across accessible clients", icon: UsersRound, tone: "orange" },
    { label: "Received today", value: stats.today, hint: "New client conversations", icon: Sparkles, tone: "blue" },
    { label: "This month", value: stats.month, hint: "Leads created this month", icon: CalendarClock, tone: "violet" },
    { label: "Qualified", value: stats.qualified, hint: "Sales-ready leads", icon: Target, tone: "green" },
    { label: "Converted", value: stats.converted, hint: "Won opportunities", icon: Check, tone: "green" },
    { label: "Junk", value: stats.junk, hint: "Excluded from pipeline", icon: Filter, tone: "red" },
  ] : [
    { label: "Total leads", value: stats.total, hint: "In your workspace", icon: UsersRound, tone: "blue" },
    { label: "New leads", value: stats.new, hint: "Awaiting first contact", icon: Sparkles, tone: "orange" },
    { label: "Contacted", value: stats.contacted, hint: "Reached by your team", icon: MessageSquareText, tone: "blue" },
    { label: "Qualified", value: stats.qualified, hint: "Sales-ready leads", icon: Target, tone: "green" },
    { label: "Converted", value: stats.converted, hint: "Won opportunities", icon: Check, tone: "green" },
    { label: "Junk", value: stats.junk, hint: "Excluded from pipeline", icon: Filter, tone: "red" },
    { label: "Conversion rate", value: `${stats.conversionRate}%`, hint: "Converted / total leads", icon: BarChart3, tone: "violet" },
    { label: "Qualification rate", value: `${stats.qualificationRate}%`, hint: "Qualified / total leads", icon: Flame, tone: "orange" },
  ];
  const sectionTitle = isMaster ? "Platform overview" : `Good ${greeting()},`;
  return <div className="space-y-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary"><span className="size-1.5 rounded-full bg-primary" /> {isMaster ? "MASTER WORKSPACE" : organization?.name ?? "CLIENT WORKSPACE"}</div><h2 className="text-[23px] font-semibold text-foreground">{sectionTitle}</h2><p className="mt-1 text-sm text-muted-foreground">{isMaster ? "A live view of your clients, leads, and sales activity." : "Here’s what’s happening across your sales pipeline."}</p></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" onClick={() => onPage("reports")}><Download className="size-4" /> Export report</Button>{isMaster && <Button size="sm" onClick={() => onPage("clients")}><Plus className="size-4" /> Add client</Button>}</div></div>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{metrics.map((metric) => <MetricTile key={metric.label} {...metric} />)}</div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(290px,0.85fr)]"><section className="crm-card p-5 md:p-6"><SectionHeader title={isMaster ? "Lead activity" : "Lead generation"} detail="New leads over the last 14 days" action={<Button variant="ghost" size="sm" onClick={() => onPage("leads")}>View leads <ArrowRight className="size-4" /></Button>} />{trend.some((item) => item.leads > 0) ? <div className="mt-5 h-[250px] w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={trend} margin={{ left: -14, right: 10, top: 10, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} className="crm-gridline" /><XAxis dataKey="date" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} /><Tooltip contentStyle={{ borderRadius: 6, borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }} /><Line type="monotone" dataKey="leads" name="Leads" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3, fill: "var(--primary)" }} activeDot={{ r: 5 }} /></LineChart></ResponsiveContainer></div> : <EmptyChart label="Your lead activity will appear here." />}</section>
      <section className="crm-card p-5 md:p-6"><SectionHeader title={isMaster ? "Lead status" : "Pipeline status"} detail="Current distribution" action={<Button variant="ghost" size="icon" aria-label="Open leads" onClick={() => onPage("leads")}><ArrowRight className="size-4" /></Button>} />{statuses.length ? <div className="mt-2 h-[250px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={statuses} dataKey="value" nameKey="name" innerRadius={60} outerRadius={89} paddingAngle={2} stroke="var(--card)">{statuses.map((item, index) => <RechartCell key={item.name} fill={["var(--primary)", "var(--chart-2)", "var(--chart-4)", "var(--chart-5)", "var(--chart-3)"][index % 5]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 6, borderColor: "var(--border)", background: "var(--card)", color: "var(--foreground)" }} /><Legend verticalAlign="bottom" height={42} iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 10, color: "var(--muted-foreground)" }} /></PieChart></ResponsiveContainer></div> : <EmptyChart label="Status breakdown will appear when leads arrive." />}</section></div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.75fr)]"><section className="crm-card overflow-hidden"><div className="p-5 md:px-6"><SectionHeader title={isMaster ? "Client workspaces" : "Recent leads"} detail={isMaster ? "Client activity across your platform" : "The latest additions to your workspace"} action={<Button variant="ghost" size="sm" onClick={() => onPage(isMaster ? "clients" : "leads")}>View all <ArrowRight className="size-4" /></Button>} /></div>{isMaster ? <ClientSummary organizations={organizations} leads={leads} onOpen={(organization) => { void organization; onPage("clients"); }} /> : <RecentLeads leads={leads.slice(0, 7)} onOpen={onOpenLead} />}</section>
      <div className="space-y-5"><section className="crm-card p-5"><SectionHeader title="Lead quality" detail="Current pipeline" />{qualities.length ? <div className="mt-4 space-y-3">{qualities.map((item) => <div key={item.name}><div className="mb-1.5 flex justify-between text-xs"><span className="text-foreground">{item.name}</span><span className="text-muted-foreground">{item.value}</span></div><div className="h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${qualityBar(item.name)}`} style={{ width: `${Math.max(6, (item.value / Math.max(stats.total, 1)) * 100)}%` }} /></div></div>)}</div> : <p className="py-6 text-center text-xs text-muted-foreground">No quality data yet.</p>}</section>
        <section className="crm-card p-5"><SectionHeader title="Team snapshot" detail={`${members.length} team member${members.length === 1 ? "" : "s"}`} action={<Button variant="ghost" size="icon" aria-label="View team" onClick={() => onPage("team")}><ArrowRight className="size-4" /></Button>} />{members.length ? <div className="mt-4 space-y-3">{members.slice(0, 4).map((member) => <div key={member.user_id} className="flex items-center gap-3"><div className="grid size-8 place-items-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground">{initials(member.full_name || member.email || "Team")}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-foreground">{member.full_name || member.email || "Team member"}</p><p className="text-[10px] capitalize text-muted-foreground">{formatRole(member.user_roles?.[0]?.role ?? "sales_exec")}</p></div><span className="text-xs font-medium text-foreground">{leads.filter((lead) => lead.assigned_to === member.user_id).length}</span></div>)}</div> : <EmptyInline text="Your team will show here." />}</section></div></div>
    <section className="crm-card p-5 md:p-6"><SectionHeader title="Follow-up queue" detail="Upcoming actions for your team" action={<Button variant="ghost" size="sm" onClick={() => onPage(isMaster ? "activity" : "follow-ups")}>View follow-ups <ArrowRight className="size-4" /></Button>} />{followUps.length ? <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{followUps.slice(0, 3).map((followUp) => { const lead = leads.find((item) => item.id === followUp.lead_id); return <button key={followUp.id} onClick={() => { const matched = leads.find((item) => item.id === followUp.lead_id); if (matched) onOpenLead(matched); }} className="rounded-md border border-border p-3 text-left transition-colors hover:bg-muted/50"><div className="flex items-center justify-between"><span className="text-xs font-medium text-foreground">{lead?.full_name ?? "Lead follow-up"}</span><Clock3 className="size-4 text-primary" /></div><p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(followUp.scheduled_at)}</p></button>; })}</div> : <EmptyInline text="No pending follow-ups." />}</section>
  </div>;
}

function ClientsPage({ organizations, leads, onCreate, onEdit, onToggleStatus, onOpen }: {
  organizations: Organization[]; leads: Lead[]; stats: ReturnType<typeof getLeadStats>; onCreate: () => void; onEdit: (org: Organization) => void;
  onToggleStatus: (org: Organization) => void; onOpen: (org: Organization) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All clients");
  const filtered = organizations.filter((organization) => organization.name.toLowerCase().includes(query.toLowerCase()) && (filter === "All clients" || organization.status === filter.toLowerCase()));
  return <div className="space-y-6"><PageIntro eyebrow="PLATFORM MANAGEMENT" title="Client workspaces" description="Create, review, and manage your client organizations." action={<Button onClick={onCreate}><Plus className="size-4" /> Add client</Button>} />
    <div className="grid gap-4 sm:grid-cols-3"><MetricTile label="Client workspaces" value={organizations.length} hint="Registered with Bedifly" icon={Building2} tone="blue" /><MetricTile label="Active" value={organizations.filter((org) => org.status === "active").length} hint="Access is enabled" icon={ShieldCheck} tone="green" /><MetricTile label="Suspended" value={organizations.filter((org) => org.status !== "active").length} hint="Access is paused" icon={SlidersHorizontal} tone="orange" /></div>
    <section className="crm-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-4 md:p-5"><div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" placeholder="Search clients…" value={query} onChange={(event) => setQuery(event.target.value)} /></div><select aria-label="Filter clients by status" className="h-9 rounded-md border border-input bg-background px-3 text-sm" value={filter} onChange={(event) => setFilter(event.target.value)}><option>All clients</option><option>Active</option><option>Suspended</option><option>Inactive</option></select></div>
      <div className="overflow-x-auto"><table className="crm-table w-full text-left text-xs"><thead><tr><th className="px-5 py-3">Client</th><th className="px-4 py-3">Leads</th><th className="px-4 py-3">Qualified</th><th className="px-4 py-3">Converted</th><th className="px-4 py-3">Conversion</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Created</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>{filtered.map((organization) => { const items = leads.filter((lead) => lead.organization_id === organization.id); const won = items.filter((lead) => lead.status === "Converted").length; return <tr key={organization.id} className="hover:bg-muted/25"><td className="px-5 py-4"><button className="flex items-center gap-3 text-left" onClick={() => onOpen(organization)}><span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><Building2 className="size-4" /></span><span><span className="block font-medium text-foreground">{organization.name}</span><span className="block pt-0.5 text-[10px] text-muted-foreground">{organization.contact_person || organization.email || "Client account"}</span></span></button></td><td className="px-4 py-4 font-medium">{items.length}</td><td className="px-4 py-4">{items.filter((lead) => lead.status === "Qualified").length}</td><td className="px-4 py-4">{won}</td><td className="px-4 py-4">{items.length ? `${Math.round(won / items.length * 100)}%` : "—"}</td><td className="px-4 py-4"><StatusPill label={organization.status} /></td><td className="px-4 py-4 text-muted-foreground">{formatDate(organization.created_at)}</td><td className="px-4 py-4"><div className="flex items-center gap-1"><Button size="icon" variant="ghost" aria-label={`Edit ${organization.name}`} onClick={() => onEdit(organization)}><Settings2 className="size-4" /></Button><Button size="icon" variant="ghost" aria-label={`Open ${organization.name}`} onClick={() => onOpen(organization)}><ArrowRight className="size-4" /></Button><Button size="icon" variant="ghost" aria-label={`${organization.status === "active" ? "Suspend" : "Activate"} ${organization.name}`} onClick={() => onToggleStatus(organization)}><SlidersHorizontal className="size-4" /></Button></div></td></tr>; })}</tbody></table></div>
      {!filtered.length && <EmptyState title={query || filter !== "All clients" ? "No matching clients" : "No client workspaces yet"} message={query || filter !== "All clients" ? "Try a different name or status." : "Add the first client to start organizing workspaces."} action={!organizations.length ? <Button size="sm" onClick={onCreate}><Plus className="size-4" /> Add client</Button> : undefined} />}
    </section>
  </div>;
}

function LeadsPage({ page, isMaster, canManageLeads, leads, members, sourceOptions, stats, search, setSearch, statusFilter, setStatusFilter, qualityFilter, setQualityFilter, sourceFilter, setSourceFilter, assigneeFilter, setAssigneeFilter, dateFilter, setDateFilter, customDateStart, setCustomDateStart, customDateEnd, setCustomDateEnd, view, setView, selectedIds, setSelectedIds, statusOptions, onOpenLead, onCreate, onExport, onExportExcel, onImport, onBulkUpdate, onBulkDelete, onMoveLead, bulkAssignee, setBulkAssignee, membersById }: {
  page: PageKey; isMaster: boolean; canManageLeads: boolean; leads: Lead[]; members: Member[]; sourceOptions: string[]; stats: ReturnType<typeof getLeadStats>; search: string; setSearch: (v: string) => void; statusFilter: string; setStatusFilter: (v: string) => void;
  qualityFilter: string; setQualityFilter: (v: string) => void; sourceFilter: string; setSourceFilter: (v: string) => void; assigneeFilter: string; setAssigneeFilter: (v: string) => void; dateFilter: string; setDateFilter: (v: string) => void; customDateStart: string; setCustomDateStart: (v: string) => void; customDateEnd: string; setCustomDateEnd: (v: string) => void; view: "table" | "kanban"; setView: (v: "table" | "kanban") => void;
  selectedIds: string[]; setSelectedIds: (v: string[] | ((ids: string[]) => string[])) => void; statusOptions: string[]; onOpenLead: (lead: Lead) => void; onCreate: () => void; onExport: () => void; onExportExcel: () => void;
  onImport: (file?: File) => void; onBulkUpdate: (changes: Database["public"]["Tables"]["leads"]["Update"]) => void; bulkAssignee: string; setBulkAssignee: (v: string) => void; membersById: Record<string, Member>;
  onBulkDelete: () => void; onMoveLead: (lead: Lead, status: string) => void;
}) {
  const isPipeline = page === "pipeline";
  const activeFilterCount = Number(statusFilter !== "All statuses") + Number(qualityFilter !== "All qualities") + Number(sourceFilter !== "All sources") + Number(assigneeFilter !== "All executives") + Number(dateFilter !== "Last 30 days");
  const leadTypes = isMaster ? ["New Lead", "Contacted", "Qualified", "Converted"] : ["New Lead", "Contacted", "Qualified", "Converted"];
  return <div className="space-y-6"><PageIntro eyebrow={isMaster ? "PLATFORM LEADS" : "SALES WORKSPACE"} title={isPipeline ? "Lead pipeline" : isMaster ? "All client leads" : "Lead management"} description={isMaster ? "Review lead performance across accessible client workspaces." : "Find, assign, and follow through on every sales opportunity."} action={<div className="flex flex-wrap gap-2">{canManageLeads && <label className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm hover:bg-accent"><ArrowDownToLine className="size-4" /> Import spreadsheet<input type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(event) => { void onImport(event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>}<Button variant="outline" size="sm" onClick={onExport}><Download className="size-4" /> Export CSV</Button><Button variant="outline" size="sm" onClick={onExportExcel}><Download className="size-4" /> Export Excel</Button>{!isMaster && canManageLeads && <Button size="sm" onClick={onCreate}><Plus className="size-4" /> Add lead</Button>}</div>} />
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{leadTypes.map((status) => <MetricTile key={status} label={status} value={leads.filter((lead) => lead.status === status).length} hint={status === "New Lead" ? "Awaiting first contact" : status === "Converted" ? "Won opportunities" : "Current workspace"} icon={status === "Converted" ? Check : status === "Qualified" ? Target : UsersRound} tone={status === "Converted" ? "green" : "blue"} />)}</div>
    <section className="crm-card overflow-hidden"><div className="flex flex-wrap items-center gap-2 border-b border-border p-4"><div className="relative min-w-[200px] flex-1 sm:max-w-sm"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, phone, email…" className="pl-9" /></div>
      <select aria-label="Lead date filter" className="h-9 rounded-md border border-input bg-background px-2.5 text-xs" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)}>{["Today", "Yesterday", "Last 7 days", "Last 30 days", "This month", "All time", "Custom range"].map((date) => <option key={date}>{date}</option>)}</select>
      {dateFilter === "Custom range" && <div className="flex items-center gap-2"><Input aria-label="Lead start date" type="date" value={customDateStart} onChange={(event) => setCustomDateStart(event.target.value)} className="h-9 w-[140px] text-xs" /><Input aria-label="Lead end date" type="date" min={customDateStart || undefined} value={customDateEnd} onChange={(event) => setCustomDateEnd(event.target.value)} className="h-9 w-[140px] text-xs" /></div>}
      <select aria-label="Filter lead status" className="h-9 max-w-[160px] rounded-md border border-input bg-background px-2.5 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All statuses</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select>
      <select aria-label="Filter lead quality" className="h-9 rounded-md border border-input bg-background px-2.5 text-xs" value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)}><option>All qualities</option>{QUALITIES.map((quality) => <option key={quality}>{quality}</option>)}</select>
      <select aria-label="Filter lead source" className="h-9 max-w-[145px] rounded-md border border-input bg-background px-2.5 text-xs" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option>All sources</option>{sourceOptions.map((source) => <option key={source}>{source}</option>)}</select>
      <select aria-label="Filter sales executive" className="h-9 max-w-[170px] rounded-md border border-input bg-background px-2.5 text-xs" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}><option>All executives</option><option value="Unassigned">Unassigned</option>{members.filter((member) => member.user_roles?.some((item) => item.role === "sales_exec")).map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email || member.user_id}</option>)}</select>
      <Button variant="outline" size="sm" onClick={() => { setStatusFilter("All statuses"); setQualityFilter("All qualities"); setSourceFilter("All sources"); setAssigneeFilter("All executives"); setDateFilter("Last 30 days"); setCustomDateStart(""); setCustomDateEnd(""); }}><ListFilter className="size-4" /> {activeFilterCount ? `${activeFilterCount} filters` : "Filters"}</Button>
      <div className="ml-auto flex rounded-md border border-border bg-muted/50 p-0.5"><Button size="sm" variant={view === "table" ? "secondary" : "ghost"} className="h-7 px-2.5 text-[11px]" onClick={() => setView("table")}><FileSpreadsheet className="size-3.5" /> Table</Button><Button size="sm" variant={view === "kanban" ? "secondary" : "ghost"} className="h-7 px-2.5 text-[11px]" onClick={() => setView("kanban")}><Workflow className="size-3.5" /> Board</Button></div>
    </div>
    {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary/[0.035] px-4 py-3"><span className="mr-2 text-xs font-medium text-foreground">{selectedIds.length} selected</span>{canManageLeads && <><select aria-label="Bulk update status" className="h-8 rounded-md border border-input bg-background px-2 text-xs" defaultValue="" onChange={(event) => { if (event.target.value) onBulkUpdate({ status: event.target.value }); }}><option value="">Change status…</option>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select><select aria-label="Bulk assign lead" className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={bulkAssignee} onChange={(event) => { setBulkAssignee(event.target.value); if (event.target.value) onBulkUpdate({ assigned_to: event.target.value }); }}><option value="">Assign to…</option>{members.filter((member) => member.is_active && member.user_roles?.some((item) => item.role === "sales_exec")).map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email || member.user_id}</option>)}</select><Button variant="outline" size="sm" className="text-destructive" onClick={onBulkDelete}><X className="size-4" /> Delete selected</Button></>}<Button variant="ghost" size="sm" onClick={() => setSelectedIds([])}>Clear</Button></div>}
    {view === "kanban" ? <KanbanBoard leads={leads} membersById={membersById} onOpen={onOpenLead} onMove={onMoveLead} selectedIds={selectedIds} setSelectedIds={setSelectedIds} statusOptions={statusOptions} /> : <div className="overflow-x-auto"><table className="crm-table w-full min-w-[850px] text-left text-xs"><thead><tr><th className="w-10 px-4 py-3"><input aria-label="Select all visible leads" type="checkbox" checked={Boolean(leads.length && leads.every((lead) => selectedIds.includes(lead.id)))} onChange={(event) => setSelectedIds(event.target.checked ? [...new Set([...selectedIds, ...leads.map((lead) => lead.id)])] : selectedIds.filter((id) => !leads.some((lead) => lead.id === id)))} /></th><th className="px-3 py-3">Name</th><th className="px-3 py-3">Contact</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Quality</th><th className="px-3 py-3">Assignee</th><th className="px-3 py-3">Added</th><th className="px-3 py-3">Score</th></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} className="cursor-pointer hover:bg-muted/25" onClick={() => onOpenLead(lead)}><td className="px-4 py-3" onClick={(event) => event.stopPropagation()}><input aria-label={`Select ${lead.full_name}`} type="checkbox" checked={selectedIds.includes(lead.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, lead.id] : selectedIds.filter((id) => id !== lead.id))} /></td><td className="px-3 py-3"><span className="font-medium text-foreground">{lead.full_name}</span><span className="block pt-1 text-[10px] text-muted-foreground">{lead.city || "—"}</span></td><td className="px-3 py-3"><span className="text-foreground">{lead.phone || "—"}</span><span className="block pt-1 text-[10px] text-muted-foreground">{lead.email || ""}</span></td><td className="px-3 py-3">{lead.source || "Manual"}</td><td className="px-3 py-3"><StatusPill label={lead.status} /></td><td className="px-3 py-3"><QualityPill quality={lead.quality} /></td><td className="px-3 py-3 text-muted-foreground">{lead.assigned_to ? memberName(membersById[lead.assigned_to], lead.assigned_to) : "Unassigned"}</td><td className="px-3 py-3 text-muted-foreground">{formatDate(lead.created_at)}</td><td className="px-3 py-3"><span className="rounded bg-muted px-2 py-1 text-[10px]">{lead.lead_score}</span></td></tr>)}</tbody></table>{!leads.length && <EmptyState title="No leads found" message="Try another search or create a new lead for this workspace." action={!isMaster ? <Button size="sm" onClick={onCreate}><Plus className="size-4" /> Add lead</Button> : undefined} />}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-[11px] text-muted-foreground"><span>Showing {leads.length} leads · {stats.total} in this workspace</span><span>Client data stays within its workspace.</span></div></section>
  </div>;
}

function onBulkUpdateForOne(lead: Lead, status: string, updater: (changes: Database["public"]["Tables"]["leads"]["Update"]) => void) { void lead; updater({ status }); }

function KanbanBoard({ leads, membersById, onOpen, onMove, selectedIds, setSelectedIds, statusOptions }: {
  leads: Lead[]; membersById: Record<string, Member>; onOpen: (lead: Lead) => void; onMove: (lead: Lead, status: string) => void;
  statusOptions: string[];
  selectedIds: string[]; setSelectedIds: (v: string[] | ((ids: string[]) => string[])) => void;
}) {
  const [overColumn, setOverColumn] = useState("");
  return <div className="flex gap-3 overflow-x-auto p-4">{statusOptions.map((status) => {
    const cards = leads.filter((lead) => lead.status === status);
    return <section key={status} onDragOver={(event) => { event.preventDefault(); setOverColumn(status); }} onDragLeave={() => setOverColumn("")} onDrop={(event) => { event.preventDefault(); const lead = leads.find((item) => item.id === event.dataTransfer.getData("text/lead-id")); if (lead && lead.status !== status) onMove(lead, status); setOverColumn(""); }} className={`w-[245px] shrink-0 rounded-md border p-2.5 ${overColumn === status ? "border-primary bg-primary/5" : "border-border bg-muted/35"}`}>
      <div className="mb-3 flex items-center justify-between px-1"><h3 className="text-xs font-semibold text-foreground">{status}</h3><span className="rounded-full bg-card px-2 py-0.5 text-[10px] text-muted-foreground">{cards.length}</span></div>
      <div className="space-y-2">{cards.map((lead) => <article key={lead.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/lead-id", lead.id)} className="crm-card cursor-grab p-3 active:cursor-grabbing"><div className="flex items-start justify-between gap-2"><button onClick={() => onOpen(lead)} className="text-left text-xs font-medium text-foreground hover:text-primary">{lead.full_name}</button><input aria-label={`Select ${lead.full_name}`} type="checkbox" checked={selectedIds.includes(lead.id)} onChange={(event) => setSelectedIds(event.target.checked ? [...selectedIds, lead.id] : selectedIds.filter((id) => id !== lead.id))} /></div><p className="mt-1.5 text-[10px] text-muted-foreground">{lead.phone || lead.email || "No contact details"}</p><div className="mt-3 flex items-center justify-between"><QualityPill quality={lead.quality} /><span className="text-[10px] text-muted-foreground">Score {lead.lead_score}</span></div><p className="mt-2 truncate text-[10px] text-muted-foreground">{lead.assigned_to ? memberName(membersById[lead.assigned_to], lead.assigned_to) : "Unassigned"}</p><select aria-label={`Move ${lead.full_name} to another status`} className="mt-2 h-7 w-full rounded border border-input bg-background px-2 text-[10px]" value={lead.status} onChange={(event) => onMove(lead, event.target.value)}>{statusOptions.map((option) => <option key={option}>{option}</option>)}</select></article>)}{!cards.length && <p className="rounded border border-dashed border-border px-2 py-5 text-center text-[10px] text-muted-foreground">No leads</p>}</div>
    </section>;
  })}</div>;
}

function LeadDetail({ lead, members, statuses, notes, activities, onUpdate, onDelete, onEdit, canManageLeads, noteDraft, setNoteDraft, onAddNote, followUpDraft, setFollowUpDraft, onSchedule }: {
  lead: Lead; members: Member[]; statuses: string[]; notes: LeadNote[]; activities: LeadActivity[]; onUpdate: (lead: Lead, changes: Database["public"]["Tables"]["leads"]["Update"], eventName?: string) => void;
  onDelete: (lead: Lead) => void; onEdit: (lead: Lead) => void; canManageLeads: boolean; noteDraft: string; setNoteDraft: (value: string) => void; onAddNote: (event: FormEvent<HTMLFormElement>) => void;
  followUpDraft: { scheduledAt: string; note: string }; setFollowUpDraft: (value: { scheduledAt: string; note: string }) => void; onSchedule: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [section, setSection] = useState<"details" | "activity">("details");
  return <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.75fr)]">
    <div className="space-y-5"><div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/25 p-4 sm:grid-cols-3">{[
      ["Phone", lead.phone || "Not added"], ["Email", lead.email || "Not added"], ["WhatsApp", lead.whatsapp_number || "Not added"],
      ["Location", [lead.city, lead.state, lead.country].filter(Boolean).join(", ") || "Not added"], ["Source", lead.source], ["Form", lead.form_name || "Not added"], ["Source reference", lead.source_reference_id || "Not added"], ["Lead created", formatDate(lead.lead_created_at)], ["Score", `${lead.lead_score} / 100`],
      ["Campaign", lead.campaign_name || "Not added"], ["Ad set", lead.ad_set_name || "Not added"], ["Ad", lead.ad_name || "Not added"],
    ].map(([label, value]) => <div key={label}><p className="text-[10px] font-medium uppercase text-muted-foreground">{label}</p><p className="mt-1 break-words text-xs font-medium text-foreground">{value}</p></div>)}</div>
      <div className={`grid gap-3 ${canManageLeads ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}><Field label="Lead status"><select className="h-9 rounded-md border border-input bg-background px-3 text-xs" value={lead.status} onChange={(event) => onUpdate(lead, { status: event.target.value }, "Lead status updated.")}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></Field><Field label="Lead quality"><select className="h-9 rounded-md border border-input bg-background px-3 text-xs" value={lead.quality} onChange={(event) => onUpdate(lead, { quality: event.target.value }, "Lead quality updated.")}>{QUALITIES.map((quality) => <option key={quality}>{quality}</option>)}</select></Field>{canManageLeads && <Field label="Assign executive"><select className="h-9 rounded-md border border-input bg-background px-3 text-xs" value={lead.assigned_to ?? ""} onChange={(event) => onUpdate(lead, { assigned_to: event.target.value || null }, "Lead assignment updated.")}><option value="">Unassigned</option>{members.filter((member) => member.is_active && member.user_roles?.some((item) => item.role === "sales_exec")).map((member) => <option key={member.user_id} value={member.user_id}>{member.full_name || member.email || member.user_id}</option>)}</select></Field>}</div>
      <div className="flex flex-wrap gap-2">{lead.phone && <Button variant="outline" size="sm" asChild><a href={`tel:${encodeURIComponent(lead.phone)}`}><Phone className="size-4" /> Call</a></Button>}{(lead.whatsapp_number || lead.phone) && <Button variant="outline" size="sm" asChild><a target="_blank" rel="noreferrer" href={`https://wa.me/${encodeURIComponent((lead.whatsapp_number || lead.phone || "").replace(/[^0-9]/g, ""))}`}><MessageSquareText className="size-4" /> WhatsApp</a></Button>}{lead.email && <Button variant="outline" size="sm" asChild><a href={`mailto:${encodeURIComponent(lead.email)}`}><Mail className="size-4" /> Email</a></Button>}{canManageLeads && <Button variant="outline" size="sm" onClick={() => onEdit(lead)}><Settings2 className="size-4" /> Edit details</Button>}{canManageLeads && <Button variant="ghost" size="sm" className="ml-auto text-destructive hover:text-destructive" onClick={() => onDelete(lead)}><X className="size-4" /> Remove lead</Button>}</div>
      <div className="flex gap-4 border-b border-border"><button onClick={() => setSection("details")} className={`pb-2 text-xs font-medium ${section === "details" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Notes & follow-up</button><button onClick={() => setSection("activity")} className={`pb-2 text-xs font-medium ${section === "activity" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}>Activity timeline</button></div>
      {section === "details" ? <div className="space-y-5"><form onSubmit={onAddNote} className="space-y-2"><Label htmlFor="lead-note" className="text-xs">Internal note</Label><Textarea id="lead-note" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} placeholder="Add a call summary or sales note…" maxLength={5000} rows={3} /><div className="flex justify-end"><Button size="sm" disabled={!noteDraft.trim()}><Plus className="size-4" /> Add note</Button></div></form><div className="space-y-2">{notes.map((note) => <div key={note.id} className="rounded-md border border-border p-3"><p className="whitespace-pre-wrap text-xs text-foreground">{note.content}</p><p className="mt-2 text-[10px] text-muted-foreground">{formatDateTime(note.created_at)}</p></div>)}{!notes.length && <p className="text-xs text-muted-foreground">No notes recorded.</p>}</div><form onSubmit={onSchedule} className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-[1fr_1fr_auto]"><Field label="Next follow-up"><Input type="datetime-local" min={new Date().toISOString().slice(0, 16)} value={followUpDraft.scheduledAt} onChange={(event) => setFollowUpDraft({ ...followUpDraft, scheduledAt: event.target.value })} required /></Field><Field label="Reminder note"><Input value={followUpDraft.note} onChange={(event) => setFollowUpDraft({ ...followUpDraft, note: event.target.value })} maxLength={500} placeholder="Call about proposal" /></Field><div className="flex items-end"><Button size="sm"><CalendarClock className="size-4" /></Button></div></form>{lead.follow_up_at && <p className="text-[11px] text-muted-foreground">Latest follow-up: {formatDateTime(lead.follow_up_at)}</p>}</div>
        : <div className="space-y-3">{activities.map((activity) => <div key={activity.id} className="flex gap-3"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"><Activity className="size-3.5" /></span><div><p className="text-xs text-foreground">{activity.description}</p><p className="mt-1 text-[10px] capitalize text-muted-foreground">{activity.activity_type.replaceAll("_", " ")} · {formatDateTime(activity.created_at)}</p></div></div>)}{notes.map((note) => <div key={note.id} className="flex gap-3"><span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"><MessageSquareText className="size-3.5" /></span><div><p className="text-xs text-foreground">Internal note added</p><p className="mt-1 text-[10px] text-muted-foreground">{formatDateTime(note.created_at)}</p></div></div>)}{!activities.length && !notes.length && <p className="text-xs text-muted-foreground">Lead activity will appear here.</p>}</div>}
    </div>
    <aside className="space-y-4"><div className="crm-card p-4"><p className="text-xs font-semibold text-foreground">Lead snapshot</p><div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">Current status</span><StatusPill label={lead.status} /></div><div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">Lead quality</span><QualityPill quality={lead.quality} /></div><div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">Added</span><span className="text-[11px] text-foreground">{formatDate(lead.created_at)}</span></div><div className="mt-3 flex items-center justify-between"><span className="text-[11px] text-muted-foreground">Value</span><span className="text-[11px] font-medium text-foreground">{lead.lead_value ? formatCurrency(lead.lead_value) : "—"}</span></div></div><div className="rounded-md border border-border bg-accent/30 p-4"><div className="flex items-center gap-2 text-xs font-medium text-foreground"><Sparkles className="size-4 text-accent-foreground" /> Automatic score</div><p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{lead.lead_score} points from contact details and pipeline progress. Quality is managed separately.</p><div className="mt-3 h-1.5 rounded-full bg-background"><div className="h-full rounded-full bg-primary" style={{ width: `${lead.lead_score}%` }} /></div></div></aside>
  </div>;
}

function TeamPage({ isMaster, canManageTeam, organizations, members, leads, followUps, onInvite, onToggleMember }: { isMaster: boolean; canManageTeam: boolean; organizations: Organization[]; members: Member[]; leads: Lead[]; followUps: FollowUp[]; onInvite: () => void; onToggleMember: (member: Member) => void }) {
  const teamMembers = members;
  return <div className="space-y-6"><PageIntro eyebrow="SALES ORGANIZATION" title={isMaster ? "Client teams" : "Sales team"} description={isMaster ? "View membership and lead assignments by client." : "Track team access and lead ownership in your workspace."} action={!isMaster && canManageTeam ? <Button onClick={onInvite}><Plus className="size-4" /> Invite executive</Button> : undefined} />
    {isMaster ? organizations.map((organization) => { const orgMembers = teamMembers.filter((member) => member.organization_id === organization.id); const orgLeads = leads.filter((lead) => lead.organization_id === organization.id); return <section className="crm-card overflow-hidden" key={organization.id}><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><p className="text-sm font-semibold text-foreground">{organization.name}</p><p className="mt-1 text-[11px] text-muted-foreground">{orgMembers.length} members · {orgLeads.length} leads</p></div><StatusPill label={organization.status} /></div><MemberTable members={orgMembers} leads={orgLeads} followUps={followUps.filter((item) => item.organization_id === organization.id)} onToggleMember={onToggleMember} canManageTeam={canManageTeam} /></section>; }) : <section className="crm-card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4"><div><p className="text-sm font-semibold text-foreground">Workspace members</p><p className="mt-1 text-[11px] text-muted-foreground">{teamMembers.filter((member) => member.is_active).length} active of {teamMembers.length} members</p></div></div><MemberTable members={teamMembers} leads={leads} followUps={followUps} onToggleMember={onToggleMember} canManageTeam={canManageTeam} /></section>}
    {!members.length && <EmptyState title="No team members yet" message="Workspace team invitations will appear here." action={!isMaster && canManageTeam ? <Button size="sm" onClick={onInvite}><Plus className="size-4" /> Invite executive</Button> : undefined} />}</div>;
}

function MemberTable({ members, leads, followUps, onToggleMember, canManageTeam }: { members: Member[]; leads: Lead[]; followUps: FollowUp[]; onToggleMember: (member: Member) => void; canManageTeam: boolean }) {
  return <div className="overflow-x-auto"><table className="crm-table w-full min-w-[700px] text-left text-xs"><thead><tr><th className="px-5 py-3">Member</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Assigned leads</th><th className="px-4 py-3">Qualified</th><th className="px-4 py-3">Converted</th><th className="px-4 py-3">Pending follow-ups</th>{canManageTeam && <th className="px-4 py-3">Actions</th>}</tr></thead><tbody>{members.map((member) => { const assigned = leads.filter((lead) => lead.assigned_to === member.user_id); const wins = assigned.filter((lead) => lead.status === "Converted").length; return <tr key={member.id}><td className="px-5 py-3"><span className="font-medium text-foreground">{member.full_name || member.email || member.user_id}</span><span className="block pt-1 text-[10px] text-muted-foreground">{member.email || "Team member"}</span></td><td className="px-4 py-3 capitalize">{formatRole(member.user_roles?.[0]?.role ?? "sales_exec")}</td><td className="px-4 py-3"><StatusPill label={member.is_active ? "active" : "inactive"} /></td><td className="px-4 py-3">{assigned.length}</td><td className="px-4 py-3">{assigned.filter((lead) => lead.status === "Qualified").length}</td><td className="px-4 py-3">{wins}{assigned.length ? <span className="ml-1 text-[10px] text-muted-foreground">({Math.round(wins / assigned.length * 100)}%)</span> : null}</td><td className="px-4 py-3">{followUps.filter((item) => item.assigned_to === member.user_id && !item.completed_at).length}</td>{canManageTeam && <td className="px-4 py-3"><Button size="sm" variant="outline" onClick={() => onToggleMember(member)}>{member.is_active ? "Deactivate" : "Activate"}</Button></td>}</tr>; })}</tbody></table>{!members.length && <EmptyInline text="No matching team members." />}</div>;
}

function FollowUpsPage({ followUps, leads, membersById, onComplete, onOpenLead }: { followUps: FollowUp[]; leads: Lead[]; membersById: Record<string, Member>; onComplete: (followUp: FollowUp) => void; onOpenLead: (id: string) => void }) {
  const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue = followUps.filter((item) => new Date(item.scheduled_at) < today);
  const dueToday = followUps.filter((item) => new Date(item.scheduled_at) >= today && new Date(item.scheduled_at) < new Date(today.getTime() + 86400000));
  const upcoming = followUps.filter((item) => new Date(item.scheduled_at) >= new Date(today.getTime() + 86400000));
  return <div className="space-y-6"><PageIntro eyebrow="NEXT STEPS" title="Follow-ups" description="Keep overdue, today’s, and upcoming sales conversations in view." />
    <div className="grid gap-3 sm:grid-cols-3"><MetricTile label="Overdue" value={overdue.length} hint="Needs attention" icon={Clock3} tone="red" /><MetricTile label="Due today" value={dueToday.length} hint="Scheduled for today" icon={CalendarClock} tone="orange" /><MetricTile label="Upcoming" value={upcoming.length} hint="Later this week" icon={ArrowRight} tone="blue" /></div>
    {[{ title: "Overdue", rows: overdue }, { title: "Today", rows: dueToday }, { title: "Upcoming", rows: upcoming }].map((group) => <section key={group.title} className="crm-card overflow-hidden"><div className="border-b border-border p-4"><h3 className="text-sm font-semibold text-foreground">{group.title}</h3></div>{group.rows.length ? group.rows.map((item) => { const lead = leads.find((row) => row.id === item.lead_id); return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-0"><button onClick={() => onOpenLead(item.lead_id)} className="min-w-0 text-left"><span className="block truncate text-xs font-medium text-foreground">{lead?.full_name ?? "Lead follow-up"}</span><span className="mt-1 block text-[10px] text-muted-foreground">{formatDateTime(item.scheduled_at)} · {item.note || "No reminder note"}</span></button><div className="flex items-center gap-3"><span className="hidden text-[10px] text-muted-foreground sm:inline">{memberName(membersById[item.assigned_to], item.assigned_to)}</span><Button size="sm" variant="outline" onClick={() => onComplete(item)}><Check className="size-4" /> Done</Button></div></div>; }) : <EmptyInline text={`No ${group.title.toLowerCase()} follow-ups.`} />}</section>)}
  </div>;
}

function ReportsPage({ leads, members, onExport, onExportExcel }: { leads: Lead[]; members: Member[]; onExport: (rows?: Lead[], fileName?: string) => void; onExportExcel: (rows?: Lead[], fileName?: string) => void }) {
  const stats = getLeadStats(leads);
  const reports = [
    { title: "Overall lead performance", description: "Pipeline volume, qualification, and conversion summary.", rows: leads, name: "lead-performance.csv", icon: BarChart3 },
    { title: "Lead status report", description: "Every lead grouped by its current sales stage.", rows: leads, name: "lead-status-report.csv", icon: Workflow },
    { title: "Lead quality report", description: "Current Hot, Warm, Cold, and Junk classifications.", rows: leads, name: "lead-quality-report.csv", icon: Flame },
    { title: "Employee performance", description: "Assigned leads and outcomes for your sales team.", rows: leads, name: "employee-performance.csv", icon: Users },
    { title: "Converted leads", description: "Sales opportunities marked as converted.", rows: leads.filter((lead) => lead.status === "Converted"), name: "converted-leads.csv", icon: Check },
    { title: "Junk leads", description: "Junk-quality leads and rejected pipeline records.", rows: leads.filter((lead) => lead.quality === "Junk" || lead.status === "Junk Lead"), name: "junk-leads.csv", icon: Filter },
    { title: "Campaign performance", description: "Campaign and source details supplied on each lead.", rows: leads.filter((lead) => Boolean(lead.campaign_name || lead.source)), name: "campaign-leads.csv", icon: Target },
    { title: "Lead quality by team member", description: `${members.length} team members · ${stats.total} visible leads.`, rows: leads, name: "team-performance.csv", icon: UsersRound },
  ];
  return <div className="space-y-6"><PageIntro eyebrow="WORKSPACE REPORTING" title="Reports & exports" description="Download CRM records visible to your current role and workspace." />
    <div className="grid gap-4 sm:grid-cols-3"><MetricTile label="Records in scope" value={leads.length} hint="Current accessible leads" icon={UsersRound} tone="blue" /><MetricTile label="Qualified" value={stats.qualified} hint="Current report window" icon={Target} tone="green" /><MetricTile label="Converted" value={stats.converted} hint="Current report window" icon={Check} tone="green" /></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{reports.map((report) => <article key={report.title} className="crm-card p-5"><span className="grid size-9 place-items-center rounded-md bg-secondary text-secondary-foreground"><report.icon className="size-[18px]" /></span><h3 className="mt-4 text-sm font-semibold text-foreground">{report.title}</h3><p className="mt-1 min-h-9 text-xs leading-relaxed text-muted-foreground">{report.description}</p><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><span className="text-[10px] text-muted-foreground">{report.rows.length} records · CSV / Excel</span><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => onExport(report.rows, report.name)}><Download className="size-4" /> CSV</Button><Button size="sm" variant="outline" onClick={() => onExportExcel(report.rows, report.name)}><Download className="size-4" /> Excel</Button></div></div></article>)}</div>
  </div>;
}

function ActivityPage({ leads, stats, organizations }: { leads: Lead[]; stats: ReturnType<typeof getLeadStats>; organizations: Organization[] }) {
  const recent = [...leads].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, 12);
  return <div className="space-y-6"><PageIntro eyebrow="AUDIT & PERFORMANCE" title="Platform activity" description="Review workspace records and current lead movement." />
    <div className="grid gap-4 sm:grid-cols-3"><MetricTile label="Client workspaces" value={organizations.length} hint="Available to your account" icon={Building2} tone="blue" /><MetricTile label="Leads in scope" value={stats.total} hint="Accessible records" icon={UsersRound} tone="orange" /><MetricTile label="Updated leads" value={recent.length} hint="Most recent records shown" icon={Activity} tone="green" /></div>
    <section className="crm-card overflow-hidden"><div className="border-b border-border p-5"><h3 className="text-sm font-semibold text-foreground">Recent lead changes</h3><p className="mt-1 text-xs text-muted-foreground">A timeline of recently updated lead records.</p></div>{recent.length ? recent.map((lead) => <div key={lead.id} className="flex items-center gap-3 border-b border-border px-5 py-3 last:border-0"><span className="grid size-8 place-items-center rounded-full bg-primary/10 text-primary"><Activity className="size-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-foreground">{lead.full_name} · {lead.status}</p><p className="mt-1 text-[10px] text-muted-foreground">{organizations.find((organization) => organization.id === lead.organization_id)?.name ?? "Workspace"} · {lead.source}</p></div><span className="shrink-0 text-[10px] text-muted-foreground">{formatDateTime(lead.updated_at)}</span></div>) : <EmptyState title="No lead activity yet" message="Recent updates will appear here when your team adds leads." />}</section>
  </div>;
}

function SettingsPage({ organization, statuses, customStatus, setCustomStatus, onAddStatus, scoringValues, setScoringValues, onSaveScoring, isMaster, canManageSettings, saving }: { organization: Organization | null; statuses: string[]; customStatus: string; setCustomStatus: (value: string) => void; onAddStatus: (event: FormEvent<HTMLFormElement>) => void; scoringValues: ScoringValues; setScoringValues: (values: ScoringValues) => void; onSaveScoring: (event: FormEvent<HTMLFormElement>) => void; isMaster: boolean; canManageSettings: boolean; saving: boolean }) {
  return <div className="space-y-6"><PageIntro eyebrow="WORKSPACE CONFIGURATION" title={isMaster ? "Platform settings" : "Workspace settings"} description={isMaster ? "Platform-wide workspace management." : "Manage the sales stages used by your team."} />
    <section className="crm-card max-w-[760px] p-5 md:p-6"><SectionHeader title="Workspace identity" detail="Current client account" /><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-[10px] font-medium uppercase text-muted-foreground">Workspace</p><p className="mt-1 text-sm font-medium text-foreground">{organization?.name ?? "Bedifly platform"}</p></div><div><p className="text-[10px] font-medium uppercase text-muted-foreground">Account status</p><div className="mt-1"><StatusPill label={organization?.status ?? "Platform access"} /></div></div><div><p className="text-[10px] font-medium uppercase text-muted-foreground">Business category</p><p className="mt-1 text-sm text-foreground">{organization?.business_category || "Not set"}</p></div><div><p className="text-[10px] font-medium uppercase text-muted-foreground">Subscription</p><p className="mt-1 text-sm text-foreground">{organization?.subscription_plan || "Phase 1"}</p></div></div></section>
    {canManageSettings && !isMaster && <section className="crm-card max-w-[760px] p-5 md:p-6"><SectionHeader title="Lead statuses" detail="Default stages plus custom workspace statuses" /><div className="mt-4 flex flex-wrap gap-2">{statuses.map((status) => <StatusPill key={status} label={status} />)}</div><form onSubmit={onAddStatus} className="mt-5 flex max-w-md gap-2"><Input value={customStatus} onChange={(event) => setCustomStatus(event.target.value)} maxLength={60} placeholder="New status name" required /><Button disabled={customStatus.trim().length < 2}><Plus className="size-4" /> Add status</Button></form></section>}
    {canManageSettings && organization && <section className="crm-card max-w-[760px] p-5 md:p-6"><SectionHeader title="Lead score rules" detail={`Rules for ${organization.name}`} /><form onSubmit={onSaveScoring} className="mt-5 space-y-5"><div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{SCORING_FIELDS.map((field) => <Field key={field.key} label={field.label}><Input aria-label={`${field.label} score points`} type="number" min={field.min} max={field.max} step="1" value={scoringValues[field.key]} onChange={(event) => { const value = Number(event.target.value); if (Number.isInteger(value) && value >= field.min && value <= field.max) setScoringValues({ ...scoringValues, [field.key]: value }); }} required /></Field>)}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4"><p className="max-w-lg text-xs leading-relaxed text-muted-foreground">Scores are recalculated for existing leads when these rules are saved. Call-response and interest points apply when the lead stage changes to the matching step.</p><Button disabled={saving}>{saving && <LoaderCircle className="size-4 animate-spin" />}Save score rules</Button></div></form></section>}
    <section className="crm-card max-w-[760px] p-5 md:p-6"><SectionHeader title="Workspace access" detail="Protected by signed-in account roles." /><p className="mt-3 text-xs leading-relaxed text-muted-foreground">Client data, employee visibility, follow-ups, and exports follow the access assigned to your Bedifly CRM account.</p></section>
  </div>;
}

function ClientSummary({ organizations, leads, onOpen }: { organizations: Organization[]; leads: Lead[]; onOpen: (org: Organization) => void }) {
  const rows = organizations.slice(0, 5);
  return rows.length ? <div className="divide-y divide-border">{rows.map((organization) => { const items = leads.filter((lead) => lead.organization_id === organization.id); return <button key={organization.id} onClick={() => onOpen(organization)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/25"><span className="grid size-8 place-items-center rounded-md bg-secondary text-secondary-foreground"><Building2 className="size-4" /></span><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground">{organization.name}</span><span className="mt-1 block text-[10px] text-muted-foreground">{items.length} leads · {items.filter((lead) => lead.status === "Qualified").length} qualified</span></span><StatusPill label={organization.status} /><ArrowRight className="size-4 text-muted-foreground" /></button>; })}</div> : <EmptyInline text="No client workspaces yet." />;
}

function RecentLeads({ leads, onOpen }: { leads: Lead[]; onOpen: (lead: Lead) => void }) {
  return leads.length ? <div className="divide-y divide-border">{leads.map((lead) => <button key={lead.id} onClick={() => onOpen(lead)} className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-muted/25"><div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{initials(lead.full_name)}</div><span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium text-foreground">{lead.full_name}</span><span className="mt-1 block truncate text-[10px] text-muted-foreground">{lead.phone || lead.email || "No contact details"} · {lead.source}</span></span><StatusPill label={lead.status} /><span className="hidden text-[10px] text-muted-foreground sm:inline">{formatDate(lead.created_at)}</span></button>)}</div> : <EmptyState title="No leads yet" message="New leads added to this workspace will appear here." />;
}

function MetricTile({ label, value, hint, icon: Icon, tone }: { label: string; value: string | number; hint: string; icon: typeof Users; tone: string }) {
  const toneClasses: Record<string, string> = { blue: "bg-primary/10 text-primary", green: "bg-chart-2/10 text-chart-2", orange: "bg-accent text-accent-foreground", violet: "bg-chart-3/10 text-chart-3", red: "bg-destructive/10 text-destructive" };
  return <article className="crm-card min-w-0 p-4"><div className="flex items-start justify-between gap-3"><span className="min-w-0 text-[11px] font-medium text-muted-foreground">{label}</span><span className={`grid size-8 shrink-0 place-items-center rounded-md ${toneClasses[tone] ?? toneClasses["blue"]}`}><Icon className="size-4" /></span></div><p className="mt-3 truncate text-[25px] font-semibold leading-none text-foreground">{value}</p><p className="mt-2 truncate text-[10px] text-muted-foreground">{hint}</p></article>;
}

function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-2 text-[10px] font-semibold uppercase text-primary">{eyebrow}</p><h2 className="text-[23px] font-semibold text-foreground">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{description}</p></div>{action}</div>;
}

function SectionHeader({ title, detail, action }: { title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3"><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>{detail && <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>}</div>{action}</div>;
}

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return <label className="grid gap-1.5 text-xs font-medium text-foreground">{label}{required && <span className="sr-only"> required</span>}{children}</label>;
}

function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [onClose]);
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-foreground/35 p-3 pt-[6vh] backdrop-blur-[2px] sm:p-8"><div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? "max-w-[880px]" : "max-w-[560px]"} crm-card max-h-[88vh] overflow-y-auto shadow-xl`}><div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4"><div><h2 className="text-base font-semibold text-foreground">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{subtitle}</p></div><Button size="icon" variant="ghost" aria-label="Close" onClick={onClose}><X className="size-4" /></Button></div><div className="p-5">{children}</div></div></div>;
}

function StatusPill({ label }: { label: string }) {
  const cls = label.toLowerCase() === "active" || label === "Converted" || label === "Qualified" ? "bg-chart-2/10 text-chart-2" : label.toLowerCase() === "suspended" || label === "Junk Lead" || label === "Invalid Number" ? "bg-destructive/10 text-destructive" : label === "Meeting Scheduled" || label === "Negotiation" ? "bg-accent text-accent-foreground" : "bg-secondary text-secondary-foreground";
  return <span className={`inline-flex max-w-[140px] truncate rounded px-2 py-1 text-[10px] font-medium ${cls}`}>{label}</span>;
}

function QualityPill({ quality }: { quality: string }) {
  const cls = quality === "Hot" ? "bg-destructive/10 text-destructive" : quality === "Warm" ? "bg-accent text-accent-foreground" : quality === "Junk" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary";
  return <span className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-medium ${cls}`}><span className="size-1.5 rounded-full bg-current" />{quality}</span>;
}

function EmptyChart({ label }: { label: string }) {
  return <div className="mt-4 flex h-[250px] flex-col items-center justify-center rounded-md border border-dashed border-border text-center"><span className="grid size-10 place-items-center rounded-full bg-secondary text-secondary-foreground"><BarChart3 className="size-5" /></span><p className="mt-3 text-xs text-muted-foreground">{label}</p></div>;
}

function EmptyState({ title, message, action }: { title: string; message: string; action?: React.ReactNode }) {
  return <div className="flex flex-col items-center justify-center px-6 py-11 text-center"><span className="grid size-11 place-items-center rounded-full bg-secondary text-secondary-foreground"><UsersRound className="size-5" /></span><h3 className="mt-3 text-sm font-semibold text-foreground">{title}</h3><p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">{message}</p>{action && <div className="mt-4">{action}</div>}</div>;
}

function EmptyInline({ text }: { text: string }) { return <p className="px-4 py-6 text-center text-xs text-muted-foreground">{text}</p>; }

function clientField<K extends keyof ReturnType<typeof emptyClientForm>>(label: string, key: K, form: ReturnType<typeof emptyClientForm>, setForm: (value: ReturnType<typeof emptyClientForm>) => void, required = false, type = "text") {
  return <Field label={label} required={required}><Input type={type} value={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.value })} maxLength={key === "address" ? 500 : 254} required={required} /></Field>;
}

function emptyClientForm() { return { name: "", contactPerson: "", email: "", phone: "", businessCategory: "", website: "", address: "", city: "", country: "" }; }

function getLeadStats(leads: Lead[]) {
  const today = new Date(); const month = new Date(today.getFullYear(), today.getMonth(), 1); const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const qualified = leads.filter((lead) => lead.status === "Qualified").length; const converted = leads.filter((lead) => lead.status === "Converted").length;
  return {
    total: leads.length, today: leads.filter((lead) => new Date(lead.created_at) >= startToday).length,
    month: leads.filter((lead) => new Date(lead.created_at) >= month).length,
    new: leads.filter((lead) => lead.status === "New Lead").length,
    contacted: leads.filter((lead) => ["Contacted", "Interested", "Qualified", "Meeting Scheduled", "Negotiation", "Converted"].includes(lead.status)).length,
    qualified, converted, junk: leads.filter((lead) => lead.quality === "Junk" || lead.status === "Junk Lead").length,
    conversionRate: leads.length ? Math.round(converted / leads.length * 100) : 0,
    qualificationRate: leads.length ? Math.round(qualified / leads.length * 100) : 0,
  };
}

function getLeadTrend(leads: Lead[]) {
  const days: { date: string; leads: number }[] = [];
  for (let offset = 13; offset >= 0; offset -= 1) {
    const date = new Date(); date.setDate(date.getDate() - offset);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()); const end = new Date(start.getTime() + 86400000);
    days.push({ date: start.toLocaleDateString("en-US", { month: "short", day: "numeric" }), leads: leads.filter((lead) => new Date(lead.created_at) >= start && new Date(lead.created_at) < end).length });
  }
  return days;
}

async function downloadExcel(rows: unknown[][], fileName: string) {
  const buffer = await createXlsx(rows);
  const link = document.createElement("a");
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

function downloadCsv(rows: unknown[][], fileName: string) {
  const csv = rows.map((row) => row.map((value) => { const text = value == null ? "" : String(value); const safe = /^[\s]*[=+@\-]/.test(text) ? `'${text}` : text; return `"${safe.replaceAll('"', '""')}"`; }).join(",")).join("\r\n");
  const link = document.createElement("a"); const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
  link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove(); URL.revokeObjectURL(url);
}

function memberName(member: Member | undefined, fallback: string) { return member?.full_name || member?.email || fallback.slice(0, 8); }
function initials(value: string) { return value.trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "B"; }
function formatRole(role: string) { return role === "platform_admin" ? "Super Admin" : role === "client_admin" ? "Client Admin" : role === "sales_exec" ? "Sales Executive" : "Workspace member"; }
function pageTitle(page: PageKey, isMaster: boolean) { const titles: Record<PageKey, string> = { overview: isMaster ? "Master overview" : "Workspace dashboard", clients: "Client management", leads: "Lead management", pipeline: "Sales pipeline", team: "Sales team", "follow-ups": "Follow-up management", reports: "Reports & exports", activity: "Platform activity", settings: "Workspace settings", meta: "Meta Ads integrations" }; return titles[page]; }
function greeting() { const hour = new Date().getHours(); return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"; }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
function formatDateTime(value: string) { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
function formatCurrency(value: number) { return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value); }
function qualityBar(quality: string) { return quality === "Hot" ? "bg-destructive" : quality === "Warm" ? "bg-chart-4" : quality === "Junk" ? "bg-muted-foreground" : "bg-primary"; }