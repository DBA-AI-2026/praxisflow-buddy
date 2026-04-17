import { useState, useEffect, useRef, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Users, FileText, Building2, CheckCircle2, XCircle,
  UserPlus, Phone, UserCheck, FilePlus, Upload, Ban, Send,
  Loader2, Globe, PenLine, ArrowRight, RefreshCw, AlertTriangle, Clock,
  Flame, Eye, ChevronDown,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useRegionalTeam } from "@/hooks/useRegionalTeam";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { LeadDetailDialog } from "@/components/leads/LeadDetailDialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PipelineKpiBar } from "@/components/pipeline/PipelineKpiBar";
import {
  QodiaStatusCell, QodiaUsageCell, QodiaLastActivityCell, QodiaWarningIcon,
  type ProviderStatusRow,
} from "@/components/pipeline/QodiaStatusBadges";
import { useProviderStatusMap, useProductProviderFlags } from "@/hooks/useProviderStatus";

// ─── Status configs ──────────────────────────────────────────────────────────

const leadStatusCfg: Record<string, { label: string; cls: string; priority: number }> = {
  qualifiziert:   { label: "Qualifiziert",   cls: "bg-warning/15 text-warning", priority: 1 },
  vertrag:        { label: "Vertrag läuft",  cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", priority: 2 },
  kontaktiert:    { label: "Kontaktiert",    cls: "bg-secondary text-secondary-foreground", priority: 3 },
  neu:            { label: "Neu",            cls: "bg-primary/10 text-primary", priority: 4 },
  kein_abschluss: { label: "Kein Abschluss", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400", priority: 10 },
  abgelehnt:      { label: "Abgelehnt",      cls: "bg-destructive/10 text-destructive", priority: 11 },
};

const contractStatusCfg: Record<string, { label: string; cls: string }> = {
  entwurf:     { label: "Entwurf",     cls: "bg-muted text-muted-foreground" },
  eingegangen: { label: "Eingegangen", cls: "bg-warning/15 text-warning" },
  gezeichnet:  { label: "Gezeichnet",  cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  aktiv:       { label: "Aktiv",       cls: "bg-success/10 text-success" },
  gekuendigt:  { label: "Gekündigt",   cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  beendet:     { label: "Beendet",     cls: "bg-destructive/10 text-destructive" },
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

function QodiaIcon({ synced, conflict }: { synced: boolean; conflict?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {synced
              ? <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              : <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />}
          </TooltipTrigger>
          <TooltipContent>
            {synced ? "Bei Qodia registriert" : "Noch nicht bei Qodia registriert"}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      {conflict && !synced && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-1.5 py-0 leading-4 cursor-default whitespace-nowrap">
                <AlertTriangle className="h-2.5 w-2.5" />
                E-Mail Konflikt
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Qodia meldet: E-Mail bereits vorhanden (409).<br />Das Konto existiert in Qodia, der Sync ist fehlgeschlagen.</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

function StatusPill({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
}

function SourceBadge({ source }: { source: "homepage" | "manuell" }) {
  return source === "homepage" ? (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
      <Globe className="h-2.5 w-2.5" />
      Homepage
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
      <PenLine className="h-2.5 w-2.5" />
      Manuell
    </span>
  );
}

function VorbezugBadge({ value }: { value?: string | null }) {
  if (!value || value === "nein" || value === "keins") return <span className="text-muted-foreground/30">—</span>;
  const known: Record<string, { label: string; cls: string }> = {
    mcc: { label: "MCC", cls: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/20" },
    privadis: { label: "Privadis", cls: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20" },
  };
  const key = value.toLowerCase().trim();
  const match = known[key];
  if (match) {
    return (
      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${match.cls}`}>
        {match.label}
      </span>
    );
  }
  const display = key === "andere" ? "Andere" : value.length > 12 ? value.slice(0, 12) + "…" : value;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border bg-muted text-muted-foreground border-border cursor-default">
            {display}
          </span>
        </TooltipTrigger>
        {value.length > 12 && <TooltipContent>{value}</TooltipContent>}
      </Tooltip>
    </TooltipProvider>
  );
}

/** Age indicator — shows how many days since creation, orange >7d, red >14d */
function AgeBadge({ dateStr }: { dateStr: string }) {
  const days = differenceInDays(new Date(), new Date(dateStr));
  if (days <= 2) return <span className="text-xs text-muted-foreground whitespace-nowrap">{days === 0 ? "Heute" : days === 1 ? "Gestern" : "Vor 2 T."}</span>;
  const cls = days > 14 ? "text-destructive font-semibold" : days > 7 ? "text-warning font-medium" : "text-muted-foreground";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`text-xs whitespace-nowrap flex items-center gap-0.5 ${cls}`}>
            {days > 14 && <AlertTriangle className="h-3 w-3 shrink-0" />}
            {days > 7 && days <= 14 && <Clock className="h-3 w-3 shrink-0" />}
            {days} T.
          </span>
        </TooltipTrigger>
        <TooltipContent>{format(new Date(dateStr), "dd.MM.yyyy", { locale: de })}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Staleness indicator for contracts — days since created/last updated */
function StaleBadge({ dateStr, label }: { dateStr: string; label?: string }) {
  const days = differenceInDays(new Date(), new Date(dateStr));
  if (days <= 3) return null;
  const cls = days > 14 ? "text-destructive" : days > 7 ? "text-warning" : "text-muted-foreground";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${cls}`}>
            <Clock className="h-3 w-3" />
            {days} T.
          </span>
        </TooltipTrigger>
        <TooltipContent>{label || "Erstellt"}: {format(new Date(dateStr), "dd.MM.yyyy", { locale: de })}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function TH({ children, right, className }: { children: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <th className={`py-2.5 px-4 text-${right ? "right" : "left"} text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border ${className || ""}`}>
      {children}
    </th>
  );
}

function EmptyState({ icon: Icon, title, sub }: { icon: React.ComponentType<any>; title: string; sub?: string }) {
  return (
    <tr>
      <td colSpan={99} className="py-16 text-center">
        <Icon className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>}
      </td>
    </tr>
  );
}

// ─── Attention bar — compact info line above table ────────────────────────────

function AttentionBar({ items }: { items: { icon: React.ReactNode; text: string; cls?: string }[] }) {
  const visible = items.filter((i) => i.text);
  if (visible.length === 0) return null;
  return (
    <div className="px-4 py-2.5 bg-warning/5 border-b border-warning/20 flex items-center gap-4 flex-wrap">
      <Flame className="h-3.5 w-3.5 text-warning shrink-0" />
      {visible.map((item, i) => (
        <span key={i} className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.cls || "text-warning"}`}>
          {item.icon}
          {item.text}
        </span>
      ))}
    </div>
  );
}

// ─── Filter pill button ───────────────────────────────────────────────────────

function FilterPill({
  active, onClick, label, count,
}: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
      }`}
    >
      {label}
      <span className={`text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center ${
        active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground"
      }`}>
        {count}
      </span>
    </button>
  );
}

// ─── Tab: Interessenten ───────────────────────────────────────────────────────

const ACTIVE_LEAD_STATUSES = ["neu", "kontaktiert", "qualifiziert", "vertrag"];
const CLOSED_LEAD_STATUSES = ["kein_abschluss", "abgelehnt"];

type LeadSourceFilter = "alle" | "homepage" | "manuell";
type LeadStatusFilter = "aktiv" | "kein_abschluss" | "abgelehnt" | "alle";

function InteressentenTab({ search, highlightId, teamFilter, matchesTeamFilter, initialFilter }: { search: string; highlightId?: string; teamFilter: string; matchesTeamFilter: (id?: string | null) => boolean; initialFilter?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isSalesLead, isRegionalLead, isSalesPartner, isTippgeber, role } = useUserRole();
  const { user } = useAuth();
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const [sourceFilter, setSourceFilter] = useState<LeadSourceFilter>("alle");
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>("aktiv");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [overdueFilter, setOverdueFilter] = useState<"overdue7" | "overdue14" | null>(
    initialFilter === "overdue7" ? "overdue7" : initialFilter === "overdue14" ? "overdue14" : null
  );

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [highlightId]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["journey-leads", user?.id, role],
    queryFn: async () => {
      let query = supabase
        .from("leads")
        .select("*")
        .neq("status", "kunde")
        .order("created_at", { ascending: false });

      if (isTippgeber && user?.id) {
        query = query.eq("tippgeber_id", user.id);
      } else if (isSalesPartner && user?.id) {
        query = query.eq("assigned_to", user.id);
      }

      const { data } = await query;
      return data ?? [];
    },
  });

  // Betreuer names lookup
  const assignedIds = [...new Set(leads.map((l: any) => l.assigned_to).filter(Boolean))];
  const { data: profileMap = {} } = useQuery({
    queryKey: ["profile-names", assignedIds.join(",")],
    enabled: assignedIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", assignedIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => { map[p.user_id] = p.full_name; });
      return map;
    },
  });

  const getSource = (l: any): "homepage" | "manuell" => {
    if (l.source === "manual") return "manuell";
    if (l.source === "homepage") return "homepage";
    if (l.nachricht && l.nachricht.trim().length > 0) return "homepage";
    return "manuell";
  };

  // Team-filtered leads (respects regional lead / partner visibility)
  const teamLeads = useMemo(() => {
    if (isSalesPartner || isTippgeber) return leads;
    return leads.filter((l: any) => matchesTeamFilter(l.assigned_to));
  }, [leads, matchesTeamFilter, isSalesPartner, isTippgeber]);

  const activeCount = teamLeads.filter((l: any) => ACTIVE_LEAD_STATUSES.includes(l.status)).length;
  const closedKeinCount = teamLeads.filter((l: any) => l.status === "kein_abschluss").length;
  const closedAblCount = teamLeads.filter((l: any) => l.status === "abgelehnt").length;
  const homepageCount = teamLeads.filter((l: any) => getSource(l) === "homepage").length;
  const manuellCount = teamLeads.filter((l: any) => getSource(l) === "manuell").length;

  const s = search.toLowerCase();

  const filtered = teamLeads.filter((l: any) => {
    const src = getSource(l);
    if (sourceFilter !== "alle" && src !== sourceFilter) return false;
    if (statusFilter === "aktiv" && !ACTIVE_LEAD_STATUSES.includes(l.status)) return false;
    if (statusFilter === "kein_abschluss" && l.status !== "kein_abschluss") return false;
    if (statusFilter === "abgelehnt" && l.status !== "abgelehnt") return false;

    // Deep-link overdue filter from Dashboard
    if (overdueFilter) {
      if (!ACTIVE_LEAD_STATUSES.includes(l.status)) return false;
      const days = differenceInDays(new Date(), new Date(l.created_at));
      if (overdueFilter === "overdue14" && days < 14) return false;
      if (overdueFilter === "overdue7" && (days < 7 || days >= 14)) return false;
    }

    if (!s) return true;
    return (
      l.praxis_name?.toLowerCase().includes(s) ||
      l.vorname?.toLowerCase().includes(s) ||
      l.nachname?.toLowerCase().includes(s) ||
      l.email?.toLowerCase().includes(s) ||
      l.plz?.includes(s) ||
      l.hfx_customer_number?.toLowerCase().includes(s) ||
      l.ort?.toLowerCase().includes(s)
    );
  });

  // Sort by priority: qualifiziert first, then by age (oldest first for attention)
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const pa = (leadStatusCfg[a.status]?.priority ?? 99);
      const pb = (leadStatusCfg[b.status]?.priority ?? 99);
      if (pa !== pb) return pa - pb;
      // Within same status, older first (needs attention sooner)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [filtered]);

  // Attention metrics
  // Attention metrics — based on team-filtered, active leads only
  const attentionMetrics = useMemo(() => {
    const activeLeads = teamLeads.filter((l: any) => ACTIVE_LEAD_STATUSES.includes(l.status));
    const overdue14 = activeLeads.filter((l: any) => differenceInDays(new Date(), new Date(l.created_at)) > 14).length;
    const overdue7 = activeLeads.filter((l: any) => { const d = differenceInDays(new Date(), new Date(l.created_at)); return d > 7 && d <= 14; }).length;
    const qualifiziert = activeLeads.filter((l: any) => l.status === "qualifiziert").length;
    const neu = activeLeads.filter((l: any) => l.status === "neu").length;
    return { overdue14, overdue7, qualifiziert, neu };
  }, [teamLeads]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-leads"] });
      queryClient.invalidateQueries({ queryKey: ["journey-counts"] });
      toast.success("Status aktualisiert");
    },
  });

  const sendCredentials = async (leadId: string) => {
    setSendingId(leadId);
    try {
      const { data, error } = await supabase.functions.invoke("resend-lead-credentials", { body: { leadId } });
      if (error) throw error;
      if (data?.error) toast.error(data.error);
      else toast.success(data?.message || "Zugangsdaten versendet");
    } catch (err: any) {
      toast.error(err.message || "Versand fehlgeschlagen");
    } finally {
      setSendingId(null);
    }
  };

  const syncQodia = async (leadId: string) => {
    setSyncingId(leadId);
    try {
      const { data, error } = await supabase.functions.invoke("sync-lead-qodia", { body: { leadId } });
      if (error) throw error;
      if (data?.success || data?.already_synced) {
        toast.success(data.message || "Qodia-Sync erfolgreich");
        queryClient.invalidateQueries({ queryKey: ["journey-leads"] });
      } else {
        toast.error(data?.error || "Sync fehlgeschlagen");
      }
    } catch (err: any) {
      toast.error(err.message || "Sync fehlgeschlagen");
    } finally {
      setSyncingId(null);
    }
  };

  const getNextStepAction = (lead: any) => {
    switch (lead.status) {
      case "neu":
        return { label: "Kontaktieren", icon: <Phone className="h-3 w-3" />, cls: "bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20", action: () => updateStatus.mutate({ id: lead.id, status: "kontaktiert" }) };
      case "kontaktiert":
        return { label: "Qualifizieren", icon: <UserCheck className="h-3 w-3" />, cls: "bg-warning/10 text-warning border border-warning/20 hover:bg-warning/20", action: () => updateStatus.mutate({ id: lead.id, status: "qualifiziert" }) };
      case "qualifiziert":
        return { label: "Vertrag erstellen", icon: <FilePlus className="h-3 w-3" />, cls: "bg-success/10 text-success border border-success/20 hover:bg-success/20", action: () => navigate(`/vertrieb/vertraege?leadId=${lead.id}&praxis=${encodeURIComponent(lead.praxis_name)}&vorname=${encodeURIComponent(lead.vorname)}&nachname=${encodeURIComponent(lead.nachname)}&email=${encodeURIComponent(lead.email)}&plz=${encodeURIComponent(lead.plz)}&ort=${encodeURIComponent(lead.ort || "")}&adresse=${encodeURIComponent(lead.adresse || "")}&hfx=${encodeURIComponent(lead.hfx_customer_number || "")}`) };
      case "vertrag":
        return { label: "→ Abschlussphase", icon: <ArrowRight className="h-3 w-3" />, cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20", action: () => navigate("/pipeline?tab=abschlussphase") };
      default:
        return null;
    }
  };

  /** Row urgency class — subtle left border + bg tint for attention items */
  const getRowUrgency = (lead: any) => {
    if (CLOSED_LEAD_STATUSES.includes(lead.status)) return "";
    const days = differenceInDays(new Date(), new Date(lead.created_at));
    if (days > 14) return "border-l-2 border-l-destructive bg-destructive/[0.03]";
    if (days > 7) return "border-l-2 border-l-warning bg-warning/[0.03]";
    if (lead.status === "qualifiziert") return "border-l-2 border-l-success bg-success/[0.02]";
    return "";
  };

  return (
    <div>
      {/* Attention bar */}
      {statusFilter === "aktiv" && (attentionMetrics.overdue14 > 0 || attentionMetrics.overdue7 > 0 || attentionMetrics.qualifiziert > 0) && (
        <AttentionBar items={[
          attentionMetrics.overdue14 > 0 ? { icon: <AlertTriangle className="h-3 w-3" />, text: `${attentionMetrics.overdue14} Lead${attentionMetrics.overdue14 > 1 ? "s" : ""} über 14 Tage alt`, cls: "text-destructive" } : { icon: null, text: "" },
          attentionMetrics.overdue7 > 0 ? { icon: <Clock className="h-3 w-3" />, text: `${attentionMetrics.overdue7} Lead${attentionMetrics.overdue7 > 1 ? "s" : ""} über 7 Tage alt`, cls: "text-warning" } : { icon: null, text: "" },
          attentionMetrics.qualifiziert > 0 ? { icon: <FilePlus className="h-3 w-3" />, text: `${attentionMetrics.qualifiziert} qualifiziert — bereit für Vertrag`, cls: "text-success" } : { icon: null, text: "" },
        ]} />
      )}

      {/* Unified Toolbar */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill active={statusFilter === "aktiv"} onClick={() => setStatusFilter("aktiv")} label="Im Prozess" count={activeCount} />
          <FilterPill active={statusFilter === "kein_abschluss"} onClick={() => setStatusFilter("kein_abschluss")} label="Kein Abschluss" count={closedKeinCount} />
          <FilterPill active={statusFilter === "abgelehnt"} onClick={() => setStatusFilter("abgelehnt")} label="Abgelehnt" count={closedAblCount} />
          <FilterPill active={statusFilter === "alle"} onClick={() => setStatusFilter("alle")} label="Alle" count={teamLeads.length} />

          <span className="h-5 w-px bg-border mx-1" />

          {[
            { key: "alle" as const, icon: null, label: "Alle Quellen", count: teamLeads.length },
            { key: "homepage" as const, icon: <Globe className="h-3 w-3" />, label: "Homepage", count: homepageCount },
            { key: "manuell" as const, icon: <PenLine className="h-3 w-3" />, label: "Manuell", count: manuellCount },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setSourceFilter(t.key)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                sourceFilter === t.key
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {!isTippgeber && (
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 h-8 shrink-0">
            <UserPlus className="h-3.5 w-3.5" />
            Neuer Interessent
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH>Praxis / Arzt</TH>
              <TH>Status</TH>
              <TH>Alter</TH>
              <TH>Nächster Schritt</TH>
              <TH>Quelle</TH>
              <TH>Vorbezug</TH>
              <TH>PLZ / Ort</TH>
              <TH>Betreuer</TH>
              <TH right>Qodia</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={9} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : sorted.length === 0 ? (
              <EmptyState icon={Users} title="Keine Interessenten gefunden" sub="Versuche einen anderen Filter oder lege einen neuen Interessenten an" />
            ) : sorted.map((lead: any) => {
              const sc = leadStatusCfg[lead.status] ?? leadStatusCfg.neu;
              const src = getSource(lead);
              const nextStep = getNextStepAction(lead);
              const isClosed = CLOSED_LEAD_STATUSES.includes(lead.status);
              const betreuerName = lead.assigned_to ? profileMap[lead.assigned_to] : null;
              const urgencyCls = getRowUrgency(lead);
              return (
                <tr
                  key={lead.id}
                  ref={highlightId === lead.id ? (highlightRef as any) : null}
                  onClick={() => setSelectedLead(lead)}
                  className={`hover:bg-muted/30 transition-colors group cursor-pointer ${urgencyCls} ${highlightId === lead.id ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
                >
                  <td className="py-3 px-4">
                    <p className="font-semibold text-foreground leading-tight">{lead.praxis_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {lead.vorname} {lead.nachname}
                      {lead.hfx_customer_number && (
                        <span className="ml-1.5 font-mono text-muted-foreground/50">({lead.hfx_customer_number})</span>
                      )}
                    </p>
                  </td>
                  <td className="py-3 px-4">
                    <StatusPill label={sc.label} cls={sc.cls} />
                  </td>
                  <td className="py-3 px-4">
                    <AgeBadge dateStr={lead.created_at} />
                  </td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    {!isClosed && nextStep ? (
                      <button
                        onClick={nextStep.action}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${nextStep.cls}`}
                      >
                        {nextStep.icon}
                        {nextStep.label}
                      </button>
                    ) : isClosed ? (
                      <span className="text-xs text-muted-foreground/50 flex items-center gap-1">
                        <Ban className="h-3 w-3" /> Abgeschlossen
                      </span>
                    ) : null}
                  </td>
                  <td className="py-3 px-4">
                    <SourceBadge source={src} />
                  </td>
                  <td className="py-3 px-4">
                    <VorbezugBadge value={lead.abrechnungszentrum} />
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {lead.plz}{lead.ort ? ` ${lead.ort}` : ""}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">
                    {betreuerName ? (
                      <span className="whitespace-nowrap">{betreuerName}</span>
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      <QodiaIcon synced={!!lead.qodia_synced} conflict={!!lead.qodia_conflict} />
                      {!lead.qodia_synced && lead.hfx_customer_number && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => syncQodia(lead.id)}
                                disabled={syncingId === lead.id}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                              >
                                {syncingId === lead.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <RefreshCw className="h-3 w-3" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Jetzt zu Qodia syncen</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedLead && (
        <LeadDetailDialog
          lead={selectedLead}
          onClose={() => { setSelectedLead(null); queryClient.invalidateQueries({ queryKey: ["journey-leads"] }); }}
        />
      )}
      <CreateLeadDialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) queryClient.invalidateQueries({ queryKey: ["journey-leads"] }); }} />
    </div>
  );
}

// ─── Tab: Abschlussphase (nur Verträge im Abschlussprozess) ──────────────────

const ABSCHLUSS_STATUSES = ["entwurf", "eingegangen", "gezeichnet"];

function AbschlussphaseTab({ search, highlightId, missingEmailCount, matchesTeamFilter, initialFilter }: { search: string; highlightId?: string; missingEmailCount: number; matchesTeamFilter: (id?: string | null) => boolean; initialFilter?: string }) {
  const [statusFilter, setStatusFilter] = useState<string>(
    initialFilter === "missing_email" || initialFilter === "waiting_payment" ? "eingegangen" : "alle"
  );
  const [contractFilter, setContractFilter] = useState<"missing_email" | "waiting_payment" | null>(
    initialFilter === "missing_email" ? "missing_email" : initialFilter === "waiting_payment" ? "waiting_payment" : null
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const [sendingBuchungsmail, setSendingBuchungsmail] = useState<string | null>(null);
  const { isSalesPartner, isTippgeber, role } = useUserRole();
  const { user } = useAuth();

  const sendBuchungsmail = async (contract: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!contract.email) {
      toast.error("Keine E-Mail-Adresse hinterlegt – Buchungsmail kann nicht gesendet werden.");
      return;
    }
    setSendingBuchungsmail(contract.id);
    try {
      const { error } = await supabase.functions.invoke("send-contract-confirmation", {
        body: { contract_id: contract.id },
      });
      if (error) throw error;
      toast.success(`Buchungsmail an ${contract.email} gesendet`);
      queryClient.invalidateQueries({ queryKey: ["journey-contracts-abschluss"] });
      queryClient.invalidateQueries({ queryKey: ["journey-counts"] });
    } catch (err: any) {
      toast.error(err.message || "Fehler beim Senden der Buchungsmail");
    } finally {
      setSendingBuchungsmail(null);
    }
  };

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [highlightId]);

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["journey-contracts-abschluss", user?.id, role],
    queryFn: async () => {
      if (isTippgeber) return [];

      let query = supabase
        .from("contracts")
        .select("id, customer_name, product_name, status, monthly_price, hfx_customer_number, email, vorname, nachname, praxis, created_at, start_date, confirmation_email_sent_at, customer_confirmed_at, sales_partner_name, sales_partner_id, created_by")
        .in("status", ABSCHLUSS_STATUSES)
        .order("created_at", { ascending: false });

      if (isSalesPartner && user?.id) {
        query = query.or(`sales_partner_id.eq.${user.id},created_by.eq.${user.id}`);
      }

      const { data } = await query;
      return data ?? [];
    },
  });

  // Team-filtered contracts
  const teamContracts = useMemo(() => {
    if (isSalesPartner || isTippgeber) return contracts;
    return contracts.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by));
  }, [contracts, matchesTeamFilter, isSalesPartner, isTippgeber]);

  // Qodia provider status: only relevant for products flagged with provider_flags.qodia
  const { data: providerFlags = {} } = useProductProviderFlags("qodia");
  const qodiaContractIds = useMemo(
    () => teamContracts.filter((c: any) => providerFlags[c.product_name]).map((c: any) => c.id),
    [teamContracts, providerFlags],
  );
  const { data: qodiaStatusMap = {} } = useProviderStatusMap({
    contractIds: qodiaContractIds,
    provider: "qodia",
  });

  const statusCounts = ABSCHLUSS_STATUSES.reduce((acc, s) => {
    acc[s] = teamContracts.filter((c: any) => c.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const s = search.toLowerCase();
  const filteredBase = teamContracts.filter((c: any) => {
    if (statusFilter !== "alle" && c.status !== statusFilter) return false;

    // Deep-link contract filter from Dashboard
    if (contractFilter === "missing_email" && !(c.status === "eingegangen" && !c.confirmation_email_sent_at)) return false;
    if (contractFilter === "waiting_payment" && !(c.status === "eingegangen" && c.confirmation_email_sent_at && !c.customer_confirmed_at)) return false;

    if (!s) return true;
    return (
      c.customer_name?.toLowerCase().includes(s) ||
      c.product_name?.toLowerCase().includes(s) ||
      c.hfx_customer_number?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.praxis?.toLowerCase().includes(s) ||
      c.vorname?.toLowerCase().includes(s) ||
      c.nachname?.toLowerCase().includes(s)
    );
  });

  // Sort: missing email first, then stale, then by created_at
  const sorted = useMemo(() => {
    return [...filteredBase].sort((a, b) => {
      // Priority 1: eingegangen without email
      const aMissing = a.status === "eingegangen" && !a.confirmation_email_sent_at ? 1 : 0;
      const bMissing = b.status === "eingegangen" && !b.confirmation_email_sent_at ? 1 : 0;
      if (aMissing !== bMissing) return bMissing - aMissing;
      // Priority 2: eingegangen with email but no payment
      const aWaiting = a.status === "eingegangen" && a.confirmation_email_sent_at && !a.customer_confirmed_at ? 1 : 0;
      const bWaiting = b.status === "eingegangen" && b.confirmation_email_sent_at && !b.customer_confirmed_at ? 1 : 0;
      if (aWaiting !== bWaiting) return bWaiting - aWaiting;
      // Priority 3: older first (stale)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [filteredBase]);

  // Attention metrics
  const attentionMetrics = useMemo(() => {
    const missingEmail = teamContracts.filter((c: any) => c.status === "eingegangen" && !c.confirmation_email_sent_at).length;
    const waitingPayment = teamContracts.filter((c: any) => c.status === "eingegangen" && c.confirmation_email_sent_at && !c.customer_confirmed_at).length;
    const stale7 = teamContracts.filter((c: any) => differenceInDays(new Date(), new Date(c.created_at)) > 7).length;
    return { missingEmail, waitingPayment, stale7 };
  }, [teamContracts]);

  const getNextAction = (c: any) => {
    switch (c.status) {
      case "entwurf":
        return { label: "Vertrag bearbeiten", icon: <PenLine className="h-3 w-3" />, cls: "bg-muted text-muted-foreground border border-border hover:bg-muted/80", isClickable: true };
      case "eingegangen":
        if (!c.confirmation_email_sent_at) {
          return { label: "Buchungsmail senden", icon: <Send className="h-3 w-3" />, cls: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm", isClickable: true, isBuchungsmail: true };
        }
        if (!c.customer_confirmed_at) {
          return { label: "Warten auf Zahlung", icon: <Clock className="h-3 w-3" />, cls: "bg-warning/10 text-warning border border-warning/20", isClickable: false };
        }
        return { label: "Aktivierung prüfen", icon: <CheckCircle2 className="h-3 w-3" />, cls: "bg-success/10 text-success border border-success/20 hover:bg-success/20", isClickable: true };
      case "gezeichnet":
        return { label: "Aktivierung vorbereiten", icon: <CheckCircle2 className="h-3 w-3" />, cls: "bg-success/10 text-success border border-success/20 hover:bg-success/20", isClickable: true };
      default:
        return null;
    }
  };

  /** Row urgency class */
  const getRowUrgency = (c: any) => {
    if (c.status === "eingegangen" && !c.confirmation_email_sent_at) return "border-l-2 border-l-primary bg-primary/[0.03]";
    const days = differenceInDays(new Date(), new Date(c.created_at));
    if (days > 14) return "border-l-2 border-l-destructive bg-destructive/[0.03]";
    if (days > 7) return "border-l-2 border-l-warning bg-warning/[0.03]";
    return "";
  };

  return (
    <div>
      {/* Attention bar */}
      {(attentionMetrics.missingEmail > 0 || attentionMetrics.waitingPayment > 0 || attentionMetrics.stale7 > 0) && (
        <AttentionBar items={[
          attentionMetrics.missingEmail > 0 ? { icon: <Send className="h-3 w-3" />, text: `${attentionMetrics.missingEmail} Vertrag${attentionMetrics.missingEmail > 1 ? "e" : ""} ohne Buchungsmail`, cls: "text-destructive" } : { icon: null, text: "" },
          attentionMetrics.waitingPayment > 0 ? { icon: <Clock className="h-3 w-3" />, text: `${attentionMetrics.waitingPayment} warten auf Zahlung`, cls: "text-warning" } : { icon: null, text: "" },
          attentionMetrics.stale7 > 0 ? { icon: <AlertTriangle className="h-3 w-3" />, text: `${attentionMetrics.stale7} seit >7 Tagen offen`, cls: "text-orange-600 dark:text-orange-400" } : { icon: null, text: "" },
        ]} />
      )}

      {/* Status filter pills */}
      <div className="p-4 border-b border-border flex flex-wrap gap-2 items-center">
        <FilterPill active={statusFilter === "alle"} onClick={() => setStatusFilter("alle")} label="Alle" count={teamContracts.length} />
        {ABSCHLUSS_STATUSES.map((st) => {
          const cfg = contractStatusCfg[st];
          if (!cfg) return null;
          return (
            <FilterPill
              key={st}
              active={statusFilter === st}
              onClick={() => setStatusFilter(st)}
              label={cfg.label}
              count={statusCounts[st] ?? 0}
            />
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH>Praxis / Arzt</TH>
              <TH>Produkt</TH>
              <TH>Status</TH>
              <TH>Wartezeit</TH>
              <TH>Nächster Schritt</TH>
              <TH>Checkliste</TH>
              <TH>Qodia</TH>
              <TH right>Monatlich</TH>
              <TH>Vertrieb</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : sorted.length === 0 ? (
              <EmptyState icon={FileText} title="Keine Verträge in der Abschlussphase" sub="Neue Verträge erscheinen hier sobald ein Lead qualifiziert wird" />
            ) : sorted.map((c: any) => {
              const sc = contractStatusCfg[c.status] ?? contractStatusCfg.entwurf;
              const praxisLabel = c.praxis || c.customer_name || "–";
              const arztLabel = [c.vorname, c.nachname].filter(Boolean).join(" ") || null;
              const nextAction = getNextAction(c);
              const urgencyCls = getRowUrgency(c);
              return (
                <tr
                  key={c.id}
                  ref={highlightId === c.id ? (highlightRef as any) : null}
                  onClick={() => navigate(`/vertrieb/vertraege?contractId=${c.id}`)}
                  className={`hover:bg-muted/30 transition-colors cursor-pointer group ${urgencyCls} ${highlightId === c.id ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
                >
                  <td className="py-3 px-4">
                    <p className="font-semibold text-foreground leading-tight">{praxisLabel}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {arztLabel || "–"}
                      {c.hfx_customer_number && (
                        <span className="ml-1.5 font-mono text-muted-foreground/50">({c.hfx_customer_number})</span>
                      )}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{c.product_name}</td>
                  <td className="py-3 px-4">
                    <StatusPill label={sc.label} cls={sc.cls} />
                  </td>
                  <td className="py-3 px-4">
                    <StaleBadge dateStr={c.created_at} label="Erstellt am" />
                  </td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    {nextAction && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (nextAction.isBuchungsmail) {
                            sendBuchungsmail(c, e);
                          } else if (nextAction.isClickable) {
                            navigate(`/vertrieb/vertraege?contractId=${c.id}`);
                          }
                        }}
                        disabled={sendingBuchungsmail === c.id || !nextAction.isClickable}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors whitespace-nowrap ${nextAction.cls} ${!nextAction.isClickable ? "cursor-default" : "cursor-pointer"}`}
                      >
                        {sendingBuchungsmail === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : nextAction.icon}
                        {nextAction.label}
                      </button>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${c.confirmation_email_sent_at ? "text-success" : "text-destructive"}`}>
                        {c.confirmation_email_sent_at ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        E-Mail
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${c.customer_confirmed_at ? "text-success" : "text-muted-foreground/50"}`}>
                        {c.customer_confirmed_at ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                        Zahlung
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-medium text-foreground whitespace-nowrap">
                    {c.monthly_price > 0
                      ? `${Number(c.monthly_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
                      : "–"}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{c.sales_partner_name || "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab: Kunden (aktiv, gekündigt, beendet) ─────────────────────────────────

const KUNDEN_STATUSES = ["aktiv", "gekuendigt", "beendet"];

const kundenStatusCfg: Record<string, { label: string; cls: string }> = {
  aktiv:      { label: "Aktiv",     cls: "bg-success/10 text-success" },
  gekuendigt: { label: "Gekündigt", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  beendet:    { label: "Beendet",   cls: "bg-destructive/10 text-destructive" },
};

function KundenTab({ search, highlightId, matchesTeamFilter }: { search: string; highlightId?: string; matchesTeamFilter: (id?: string | null) => boolean }) {
  const navigate = useNavigate();
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const { isSalesPartner, isTippgeber, role } = useUserRole();
  const { user } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("aktiv");

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [highlightId]);

  const { data: allContracts = [], isLoading } = useQuery({
    queryKey: ["journey-kunden", user?.id, role],
    queryFn: async () => {
      if (isTippgeber) return [];

      let query = supabase
        .from("contracts")
        .select("id, customer_name, hfx_customer_number, mp_nr, email, praxis, vorname, nachname, product_name, monthly_price, start_date, end_date, status, plz, ort, customer_id, sales_partner_name, sales_partner_id, created_by")
        .in("status", KUNDEN_STATUSES)
        .order("start_date", { ascending: false });

      if (isSalesPartner && user?.id) {
        query = query.or(`sales_partner_id.eq.${user.id},created_by.eq.${user.id}`);
      }

      const { data } = await query;
      return data ?? [];
    },
  });

  const { data: qodiaMap = {} } = useQuery({
    queryKey: ["journey-kunden-qodia"],
    queryFn: async () => {
      const { data } = await supabase.from("leads").select("hfx_customer_number, qodia_synced");
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((l: any) => {
        if (l.hfx_customer_number) map[l.hfx_customer_number] = !!l.qodia_synced;
      });
      return map;
    },
  });

  // Team-filtered contracts for consistent counts
  const teamContracts = useMemo(() => {
    if (isSalesPartner || isTippgeber) return allContracts;
    return allContracts.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by));
  }, [allContracts, matchesTeamFilter, isSalesPartner, isTippgeber]);

  const statusCounts = KUNDEN_STATUSES.reduce((acc, s) => {
    acc[s] = teamContracts.filter((c: any) => c.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const s = search.toLowerCase();

  // Deduplicate by hfx_customer_number for cleaner view
  const statusFiltered = statusFilter === "alle"
    ? teamContracts
    : teamContracts.filter((c: any) => c.status === statusFilter);

  // Deduplicate by hfx_customer_number for cleaner view
  const seenKeys = new Set<string>();
  const rows = statusFiltered.filter((c: any) => {
    const key = c.hfx_customer_number
      ? `hfx:${c.hfx_customer_number}`
      : `name:${(c.praxis || c.customer_name || "").toLowerCase().trim()}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  const filtered = rows.filter((c: any) => {
    if (!s) return true;
    const praxisName = c.praxis || c.customer_name || "";
    return (
      praxisName.toLowerCase().includes(s) ||
      c.hfx_customer_number?.toLowerCase().includes(s) ||
      c.mp_nr?.toLowerCase().includes(s) ||
      c.email?.toLowerCase().includes(s) ||
      c.plz?.includes(s) ||
      c.ort?.toLowerCase().includes(s) ||
      c.product_name?.toLowerCase().includes(s)
    );
  });

  // Summary line for Kunden
  const kundenSummary = useMemo(() => {
    const aktiv = statusCounts.aktiv ?? 0;
    const gekuendigt = statusCounts.gekuendigt ?? 0;
    return { aktiv, gekuendigt };
  }, [statusCounts]);

  return (
    <div>
      {/* Compact summary */}
      {kundenSummary.gekuendigt > 0 && (
        <div className="px-4 py-2.5 bg-muted/30 border-b border-border flex items-center gap-4">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs font-medium text-foreground">{kundenSummary.aktiv} aktive Kunden</span>
          {kundenSummary.gekuendigt > 0 && (
            <span className="text-xs font-medium text-orange-600 dark:text-orange-400">{kundenSummary.gekuendigt} gekündigt</span>
          )}
        </div>
      )}

      {/* Status filter pills */}
      <div className="p-4 border-b border-border flex flex-wrap gap-2 items-center">
        <FilterPill active={statusFilter === "aktiv"} onClick={() => setStatusFilter("aktiv")} label="Aktiv" count={statusCounts.aktiv ?? 0} />
        <FilterPill active={statusFilter === "gekuendigt"} onClick={() => setStatusFilter("gekuendigt")} label="Gekündigt" count={statusCounts.gekuendigt ?? 0} />
        <FilterPill active={statusFilter === "beendet"} onClick={() => setStatusFilter("beendet")} label="Beendet" count={statusCounts.beendet ?? 0} />
        <FilterPill active={statusFilter === "alle"} onClick={() => setStatusFilter("alle")} label="Alle" count={teamContracts.length} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH>Praxis / Arzt</TH>
              <TH>Produkt</TH>
              <TH>Status</TH>
              <TH>Kunde seit</TH>
              <TH>PLZ / Ort</TH>
              <TH>Vertrieb</TH>
              <TH right>Qodia</TH>
              <TH>{""}</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <EmptyState icon={Building2} title="Keine Kunden gefunden" sub="Aktivierte Verträge erscheinen hier automatisch" />
            ) : (filtered as any[]).map((c) => {
              const praxisLabel = c.praxis || c.customer_name || "–";
              const arztLabel = [c.vorname, c.nachname].filter(Boolean).join(" ");
              const qodia = !!(c.hfx_customer_number ? qodiaMap[c.hfx_customer_number] : false);
              const sc = kundenStatusCfg[c.status] ?? kundenStatusCfg.aktiv;
              return (
                <tr
                  key={c.id}
                  ref={highlightId === c.id ? highlightRef : null}
                  onClick={() => navigate(`/vertrieb/vertraege?contractId=${c.id}`)}
                  className={`hover:bg-muted/30 transition-colors cursor-pointer group ${highlightId === c.id ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
                >
                  <td className="py-3 px-4">
                    <p className="font-semibold text-foreground leading-tight">{praxisLabel}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {arztLabel || "–"}
                      {c.hfx_customer_number && (
                        <span className="ml-1.5 font-mono text-muted-foreground/50">({c.hfx_customer_number})</span>
                      )}
                      {c.mp_nr && (
                        <span className="ml-1 font-mono text-muted-foreground/40">MP {c.mp_nr}</span>
                      )}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{c.product_name || "–"}</td>
                  <td className="py-3 px-4">
                    <StatusPill label={sc.label} cls={sc.cls} />
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {c.start_date ? format(new Date(c.start_date), "dd.MM.yy", { locale: de }) : "–"}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {c.plz}{c.ort ? ` ${c.ort}` : ""}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{c.sales_partner_name || "–"}</td>
                  <td className="py-3 px-4 text-right"><QodiaIcon synced={qodia} /></td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => navigate(`/vertrieb/vertraege?contractId=${c.id}`)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-primary bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors"
                    >
                      <Eye className="h-3 w-3" />
                      Vertrag
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Tab Navigation Bar ─────────────────────────────────────────────────────

interface TabDef {
  key: string;
  label: string;
  icon: React.ComponentType<any>;
  count: number;
  warningCount?: number;
}

function JourneyTabBar({ activeTab, onSelect, tabs }: {
  activeTab: string;
  onSelect: (t: string) => void;
  tabs: TabDef[];
}) {
  return (
    <div className="flex border-b border-border bg-card">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onSelect(tab.key)}
            className={`relative flex items-center gap-2.5 px-5 py-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
          >
            <Icon className={`h-4 w-4 shrink-0 ${active ? "text-primary" : ""}`} />
            <span>{tab.label}</span>
            <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-semibold ${
              active
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground"
            }`}>
              {tab.count}
            </span>
            {tab.warningCount != null && tab.warningCount > 0 && (
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-warning" />
            )}
            {active && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PraxenJourney() {
  const [searchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const urlFilter = searchParams.get("filter") ?? undefined;
  const urlId = searchParams.get("id") ?? undefined;
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"interessenten" | "abschlussphase" | "kunden">(
    urlTab === "abschlussphase" || urlTab === "vertraege" ? "abschlussphase"
      : urlTab === "kunden" || urlTab === "bestandskunden" ? "kunden"
      : "interessenten"
  );

  const { teamFilter, setTeamFilter, matchesTeamFilter, teamFilterOptions, isRegionalLead } = useRegionalTeam();
  const { isSalesPartner, isTippgeber } = useUserRole();
  const { user } = useAuth();

  const { data: counts = { leads: 0, abschluss: 0, kunden: 0, missingEmail: 0 } } = useQuery({
    queryKey: ["journey-counts"],
    queryFn: async () => {
      const [l, ab, k, me] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).in("status", ACTIVE_LEAD_STATUSES),
        supabase.from("contracts").select("id", { count: "exact", head: true }).in("status", ["entwurf", "eingegangen", "gezeichnet"]),
        supabase.from("contracts").select("id", { count: "exact", head: true }).in("status", ["aktiv", "gekuendigt", "beendet"]),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "eingegangen").is("confirmation_email_sent_at", null),
      ]);
      return { leads: l.count ?? 0, abschluss: ab.count ?? 0, kunden: k.count ?? 0, missingEmail: me.count ?? 0 };
    },
  });

  // KPI data: all leads (including kunde) for conversion metrics — RLS-filtered
  const { data: kpiLeadsAll = [] } = useQuery({
    queryKey: ["kpi-leads-all", user?.id],
    queryFn: async () => {
      let q = supabase.from("leads").select("id, status, source, nachricht, created_at, assigned_to, hfx_customer_number, tippgeber_id");
      if (isTippgeber && user?.id) q = q.eq("tippgeber_id", user.id);
      else if (isSalesPartner && user?.id) q = q.eq("assigned_to", user.id);
      const { data } = await q;
      return data ?? [];
    },
  });

  // KPI data: all contracts for funnel + time metrics — RLS-filtered
  const { data: kpiContractsAll = [] } = useQuery({
    queryKey: ["kpi-contracts-all", user?.id],
    queryFn: async () => {
      if (isTippgeber) return [];
      let q = supabase.from("contracts").select("id, status, created_at, start_date, hfx_customer_number, sales_partner_id, created_by");
      if (isSalesPartner && user?.id) q = q.or(`sales_partner_id.eq.${user.id},created_by.eq.${user.id}`);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Apply team filter on KPI data (client-side, same as tabs)
  const kpiTeamLeads = useMemo(() => {
    if (isSalesPartner || isTippgeber) return kpiLeadsAll;
    return kpiLeadsAll.filter((l: any) => matchesTeamFilter(l.assigned_to));
  }, [kpiLeadsAll, matchesTeamFilter, isSalesPartner, isTippgeber]);

  const kpiTeamContracts = useMemo(() => {
    if (isSalesPartner || isTippgeber) return kpiContractsAll;
    return kpiContractsAll.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by));
  }, [kpiContractsAll, matchesTeamFilter, isSalesPartner, isTippgeber]);

  // Split leads for KPI bar: non-kunde leads vs kunde leads
  const kpiLeadsNonKunde = useMemo(() => kpiTeamLeads.filter((l: any) => l.status !== "kunde"), [kpiTeamLeads]);
  const kpiLeadsKunde = useMemo(() => kpiTeamLeads.filter((l: any) => l.status === "kunde"), [kpiTeamLeads]);

  const tabs: TabDef[] = [
    { key: "interessenten", label: "Interessenten", icon: Users, count: counts.leads },
    { key: "abschlussphase", label: "Abschlussphase", icon: FileText, count: counts.abschluss, warningCount: counts.missingEmail },
    { key: "kunden", label: "Kunden", icon: Building2, count: counts.kunden },
  ];

  return (
    <MainLayout
      title="Pipeline"
      subtitle="Vom Interessenten zum aktiven Kunden — dein zentraler Arbeitsbereich"
    >
      <div className="card-elevated overflow-hidden">
        {/* KPI Bar */}
        <PipelineKpiBar
          allLeads={kpiLeadsNonKunde}
          allContracts={kpiTeamContracts}
          kundeLeads={kpiLeadsKunde}
        />
        <JourneyTabBar activeTab={tab} onSelect={(t) => setTab(t as any)} tabs={tabs} />

        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10 gap-3 flex-wrap">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {isRegionalLead && teamFilterOptions.length > 1 && (
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="h-8 w-52 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {teamFilterOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {tab === "interessenten" && <InteressentenTab search={search} highlightId={urlId} teamFilter={teamFilter} matchesTeamFilter={matchesTeamFilter} initialFilter={urlFilter} />}
        {tab === "abschlussphase" && <AbschlussphaseTab search={search} highlightId={urlId} missingEmailCount={counts.missingEmail} matchesTeamFilter={matchesTeamFilter} initialFilter={urlFilter} />}
        {tab === "kunden" && <KundenTab search={search} highlightId={urlId} matchesTeamFilter={matchesTeamFilter} />}
      </div>
    </MainLayout>
  );
}
