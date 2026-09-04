import { Fragment, useState, useEffect, useRef, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Users, FileText, Building2, CheckCircle2, XCircle,
  UserPlus, Phone, UserCheck, FilePlus, Upload, Ban, Send,
  Loader2, Globe, PenLine, ArrowRight, RefreshCw, AlertTriangle, Clock,
  Flame, Eye, ChevronDown, CalendarCheck, Mail, FileCheck,
} from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { isWaitingForMandate } from "@/lib/contractLifecycle";
import { countDistinctCustomers } from "@/lib/multiLocation";
import { isTestHfx } from "@/lib/testData";
import { de } from "date-fns/locale";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { useAuth } from "@/hooks/useAuth";
import { useRegionalTeam } from "@/hooks/useRegionalTeam";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { KundenDialog } from "@/components/kunden/KundenDialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { PHASE_TOOLTIPS, LEAD_STATUS_TOOLTIPS, CONTRACT_STATUS_TOOLTIPS } from "@/lib/statusGlossary";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PipelineKpiBar } from "@/components/pipeline/PipelineKpiBar";
import {
  QodiaStatusCell, QodiaLeadStatusCell, QodiaUsageCell, QodiaLastActivityCell, QodiaWarningIcon,
  type ProviderStatusRow,
} from "@/components/pipeline/QodiaStatusBadges";
import {
  OnboardingCell, ActivityCell, productMiniLabel,
  type ProductOnboardingInput,
} from "@/components/pipeline/OnboardingStatus";
import { useActivityThresholds, useLeadActivityThresholds } from "@/hooks/useAppSettings";
import { LeadUsageCell, computeLeadAmpel } from "@/components/pipeline/LeadUsageCell";
import { ProductBadges, type ProductBadgeItem } from "@/components/pipeline/ProductBadges";
import { useCarrierMap } from "@/hooks/useCarrierMap";
import { StandortBadge } from "@/components/contracts/StandortBadge";
import {
  StandorteToggleBadge,
  StandorteSubRow,
  pickStandorte,
} from "@/components/multilocation/StandorteIndicator";

import { useProviderStatusMap, useProductProviderFlags } from "@/hooks/useProviderStatus";
import { useCustomerContractsMap } from "@/hooks/useCustomerContracts";
import { CONTRACT_STATUS_CONFIG } from "@/lib/statusConfig";

// ─── Status configs ──────────────────────────────────────────────────────────

const leadStatusCfg: Record<string, { label: string; cls: string; priority: number }> = {
  qualifiziert:   { label: "Qualifiziert",   cls: "bg-warning/15 text-warning", priority: 1 },
  vertrag:        { label: "In Vertragserstellung", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400", priority: 2 },
  kontaktiert:    { label: "Kontaktiert",    cls: "bg-secondary text-secondary-foreground", priority: 3 },
  neu:            { label: "Neu",            cls: "bg-primary/10 text-primary", priority: 4 },
  kein_abschluss: { label: "Kein Abschluss", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400", priority: 10 },
  abgelehnt:      { label: "Abgelehnt",      cls: "bg-destructive/10 text-destructive", priority: 11 },
  dublette:       { label: "Dublette",       cls: "bg-muted text-muted-foreground", priority: 12 },
};

// Status-Config: SSOT in @/lib/statusConfig (CONTRACT_STATUS_CONFIG).

// ─── Shared helpers ───────────────────────────────────────────────────────────



function StatusPill({ label, cls, tooltip }: { label: string; cls: string; tooltip?: string }) {
  const pill = (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${cls}`}>
      {label}
    </span>
  );
  if (!tooltip) return pill;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{pill}</TooltipTrigger>
        <TooltipContent className="max-w-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function SourceBadge({ source }: { source: "homepage" | "manuell" | "reservierung" }) {
  if (source === "reservierung") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-warning/10 text-warning border border-warning/30">
        <CalendarCheck className="h-2.5 w-2.5" />
        Reservierung
      </span>
    );
  }
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
  if (value === undefined || value === null || value === "") {
    return <span className="text-xs text-muted-foreground/60 italic">keine Angabe</span>;
  }
  if (value === "nein" || value === "keins") {
    return <span className="text-xs text-muted-foreground">keins</span>;
  }
  // Bekannte Abrechnungszentren mit Farbcode. `mcc` ist hier bewusst nicht
  // gelistet — in `leads.abrechnungszentrum` existiert kein Datensatz mit
  // diesem Wert (Stand: DB-Distinct). Das `MCC` im Footer und im
  // Tippgeber-`geschaeftsbereich`-Feld ist ein anderer Datenpunkt.
  const known: Record<string, { label: string; cls: string }> = {
    carecapital: { label: "CareCapital", cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20" },
    privadis:    { label: "Privadis",    cls: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-500/20" },
    pvs:         { label: "PVS",         cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20" },
    zab:         { label: "ZAB",         cls: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20" },
    dzr:         { label: "DZR",         cls: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400 border-fuchsia-500/20" },
    arz:         { label: "ARZ",         cls: "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20" },
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

// Tier-Klassen für responsives Ausblenden niedrigpriorisierter Spalten.
// display:none via Tailwind hidden xl:table-cell / 2xl:table-cell — DOM bleibt
// intakt, damit Mehrstandort-Sub-Zeilen (colSpan) und Sortierung unberührt sind.
const TH_TIER_CLS = {
  secondary: "hidden xl:table-cell",
  tertiary: "hidden 2xl:table-cell",
} as const;

function TH({ children, right, className, tier }: { children: React.ReactNode; right?: boolean; className?: string; tier?: "secondary" | "tertiary" }) {
  const tierCls = tier ? TH_TIER_CLS[tier] : "";
  return (
    <th className={`py-2.5 px-4 text-${right ? "right" : "left"} text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border ${tierCls} ${className || ""}`}>
      {children}
    </th>
  );
}

function EmptyState({ icon: Icon, title, sub, action }: { icon: React.ComponentType<any>; title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={99} className="py-16 text-center">
        <Icon className="h-10 w-10 text-muted-foreground/20 mx-auto mb-3" />
        <p className="text-sm font-medium text-muted-foreground">{title}</p>
        {sub && <p className="text-xs text-muted-foreground/60 mt-1">{sub}</p>}
        {action && <div className="mt-3">{action}</div>}
      </td>
    </tr>
  );
}

// ─── Attention bar — compact info line above table ────────────────────────────

type AttentionItem = {
  icon: React.ReactNode;
  text: string;
  cls?: string;
  onClick?: () => void;
  active?: boolean;
  /** Optionaler Tooltip (rückwärtskompatibel — bestehende Items ohne Tooltip bleiben unverändert). */
  tooltip?: string;
};

function AttentionBar({ items }: { items: AttentionItem[] }) {
  const visible = items.filter((i) => i.text);
  if (visible.length === 0) return null;
  return (
    <div className="px-4 py-2.5 bg-warning/5 border-b border-warning/20 flex items-center gap-2 flex-wrap">
      <Flame className="h-3.5 w-3.5 text-warning shrink-0" />
      {visible.map((item, i) => {
        const base = `inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md ${item.cls || "text-warning"}`;
        const interactive = item.onClick
          ? `cursor-pointer transition-colors hover:bg-warning/10 ${
              item.active ? "ring-1 ring-warning/40 bg-warning/15" : ""
            }`
          : "";
        const node = item.onClick ? (
          <button
            key={i}
            type="button"
            onClick={item.onClick}
            aria-pressed={!!item.active}
            className={`${base} ${interactive}`}
          >
            {item.icon}
            {item.text}
          </button>
        ) : (
          <span key={i} className={base}>
            {item.icon}
            {item.text}
          </span>
        );
        if (!item.tooltip) return node;
        return (
          <TooltipProvider key={i}>
            <Tooltip>
              <TooltipTrigger asChild>{node}</TooltipTrigger>
              <TooltipContent>{item.tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
    </div>
  );
}

// ─── Testphasen-Monitoring: Frische-Guard ────────────────────────────────────
/**
 * Nur Leads, deren qodia_usage_synced_at innerhalb dieses Fensters liegt, zählen
 * als "Testphase inaktiv" bzw. erscheinen im Filter. Der Cron läuft täglich;
 * 3 Tage tolerieren einen Fehllauf. Ältere Stände (Kohorten-Austritt oder
 * Cron-Ausfall) bedeuten "keine Aussage" — kein Fehlalarm.
 */
const TESTPHASE_FRESHNESS_DAYS = 3;

/** Frontend-Kohorte für das Testphasen-Monitoring: synchronisiert, fehlerfrei, frisch. */
function isTestphaseCohort(l: { qodia_usage_synced_at?: string | null; qodia_usage_error?: string | null }, now: Date): boolean {
  if (!l.qodia_usage_synced_at || l.qodia_usage_error) return false;
  return now.getTime() - new Date(l.qodia_usage_synced_at).getTime() <= TESTPHASE_FRESHNESS_DAYS * 24 * 60 * 60 * 1000;
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

// ⚠ SYNCHRONIZE ↔ supabase/functions/_shared/leadUsage.ts (CLOSED_LEAD_STATUSES)
// und PipelineKpiBar.tsx (ACTIVE_STATUSES / CLOSED_LOST) — bewusst dupliziert.
const ACTIVE_LEAD_STATUSES = ["neu", "kontaktiert", "qualifiziert", "vertrag"];
const CLOSED_LEAD_STATUSES = ["kein_abschluss", "abgelehnt", "dublette"];

type LeadSourceFilter = "alle" | "homepage" | "manuell" | "reservierung";
type LeadStatusFilter = "aktiv" | "kein_abschluss" | "abgelehnt" | "dublette" | "alle" | "qualifiziert";

function InteressentenTab({ search, highlightId, teamFilter, matchesTeamFilter, initialFilter, deepLinkLeadId, onClearDeepLink }: { search: string; highlightId?: string; teamFilter: string; matchesTeamFilter: (id?: string | null) => boolean; initialFilter?: string; deepLinkLeadId?: string; onClearDeepLink?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isSalesLead, isRegionalLead, isSalesPartner, isTippgeber, role } = useUserRole();
  const { user } = useAuth();
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const { data: leadThresholds = { yellow_days: 7, red_days: 14 } } = useLeadActivityThresholds();
  // Ein stabiler "jetzt"-Zeitpunkt pro Render für Ampel- und Frische-Berechnungen
  const ampelNow = useMemo(() => new Date(), []);

  const [sourceFilter, setSourceFilter] = useState<LeadSourceFilter>("alle");
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>("aktiv");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [overdueFilter, setOverdueFilter] = useState<"overdue7" | "overdue14" | null>(
    initialFilter === "overdue7" ? "overdue7" : initialFilter === "overdue14" ? "overdue14" : null
  );
  // Testphasen-Filter (rot + gelb), URL-Param filter=testphase_inaktiv — erbt bewusst das Mount-only-Verhalten von initialFilter
  const [inactiveFilter, setInactiveFilter] = useState<boolean>(initialFilter === "testphase_inaktiv");
  const [searchParams, setSearchParams] = useSearchParams();
  const syncUrlFilter = (next: string | null) => {
    const sp = new URLSearchParams(searchParams);
    if (next) sp.set("filter", next);
    else sp.delete("filter");
    setSearchParams(sp, { replace: true });
  };
  // Konfliktmenge: overdueFilter vs. inactiveFilter vs. statusFilter "qualifiziert" — nur eines gleichzeitig aktiv
  const toggleOverdue = (key: "overdue7" | "overdue14") => {
    const next = overdueFilter === key ? null : key;
    setOverdueFilter(next);
    syncUrlFilter(next);
    if (next) {
      setInactiveFilter(false);
      if (statusFilter === "qualifiziert") setStatusFilter("aktiv");
    }
  };
  const toggleInactive = () => {
    const next = !inactiveFilter;
    setInactiveFilter(next);
    syncUrlFilter(next ? "testphase_inaktiv" : null);
    if (next) {
      setOverdueFilter(null);
      if (statusFilter === "qualifiziert") setStatusFilter("aktiv");
    }
  };
  const toggleQualifiziert = () => {
    const next = statusFilter === "qualifiziert" ? "aktiv" : "qualifiziert";
    setStatusFilter(next);
    if (next === "qualifiziert" && (overdueFilter || inactiveFilter)) {
      setOverdueFilter(null);
      setInactiveFilter(false);
      syncUrlFilter(null);
    }
  };
  const selectStatus = (next: LeadStatusFilter) => {
    setStatusFilter(next);
    if (overdueFilter || inactiveFilter) {
      setOverdueFilter(null);
      setInactiveFilter(false);
      syncUrlFilter(null);
    }
  };
  const resetFilters = () => {
    setStatusFilter("aktiv");
    setOverdueFilter(null);
    setInactiveFilter(false);
    syncUrlFilter(null);
  };

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

  // Deep-Link: ?lead=<id> → Lead-Detaildialog automatisch öffnen.
  // Falls der Lead nicht in der gefilterten Liste ist, gezielt per ID nachladen.
  useEffect(() => {
    if (!deepLinkLeadId) return;
    if (selectedLead?.id === deepLinkLeadId) return;
    const inList = leads.find((l: any) => l.id === deepLinkLeadId);
    if (inList) {
      setSelectedLead(inList);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", deepLinkLeadId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        toast.error("Interessent nicht gefunden", {
          description: "Der verknüpfte Interessent ist nicht (mehr) sichtbar.",
        });
        onClearDeepLink?.();
        return;
      }
      setSelectedLead(data);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkLeadId, leads]);

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

  const getSource = (l: any): "homepage" | "manuell" | "reservierung" => {
    if (l.source === "reservation_conversion") return "reservierung";
    if (l.source === "manual") return "manuell";
    if (l.source === "homepage") return "homepage";
    if (l.nachricht && l.nachricht.trim().length > 0) return "homepage";
    return "manuell";
  };

  // Team-filtered leads (respects regional lead / partner visibility)
  const teamLeads = useMemo(() => {
    const base = leads.filter((l: any) => !isTestHfx(l.hfx_customer_number));
    if (isSalesPartner || isTippgeber) return base;
    return base.filter((l: any) => matchesTeamFilter(l.assigned_to));
  }, [leads, matchesTeamFilter, isSalesPartner, isTippgeber]);

  const activeCount = teamLeads.filter((l: any) => ACTIVE_LEAD_STATUSES.includes(l.status)).length;
  const closedKeinCount = teamLeads.filter((l: any) => l.status === "kein_abschluss").length;
  const closedAblCount = teamLeads.filter((l: any) => l.status === "abgelehnt").length;
  const dubletteCount = teamLeads.filter((l: any) => l.status === "dublette").length;
  const homepageCount = teamLeads.filter((l: any) => getSource(l) === "homepage").length;
  const manuellCount = teamLeads.filter((l: any) => getSource(l) === "manuell").length;
  const reservierungCount = teamLeads.filter((l: any) => getSource(l) === "reservierung").length;

  const s = search.toLowerCase();

  const filtered = teamLeads.filter((l: any) => {
    const src = getSource(l);
    if (sourceFilter !== "alle" && src !== sourceFilter) return false;
    if (statusFilter === "aktiv" && !ACTIVE_LEAD_STATUSES.includes(l.status)) return false;
    if (statusFilter === "kein_abschluss" && l.status !== "kein_abschluss") return false;
    if (statusFilter === "abgelehnt" && l.status !== "abgelehnt") return false;
    if (statusFilter === "dublette" && l.status !== "dublette") return false;
    if (statusFilter === "qualifiziert" && l.status !== "qualifiziert") return false;

    // Deep-link overdue filter from Dashboard
    if (overdueFilter) {
      if (!ACTIVE_LEAD_STATUSES.includes(l.status)) return false;
      const days = differenceInDays(new Date(), new Date(l.created_at));
      if (overdueFilter === "overdue14" && days < 14) return false;
      if (overdueFilter === "overdue7" && (days < 7 || days >= 14)) return false;
    }

    // Testphasen-Filter: Kohorte (frisch, fehlerfrei) ∩ Ampel rot oder gelb
    if (inactiveFilter) {
      if (!ACTIVE_LEAD_STATUSES.includes(l.status)) return false;
      if (!isTestphaseCohort(l, ampelNow)) return false;
      const c = computeLeadAmpel(l, leadThresholds, ampelNow)?.color;
      if (c !== "red" && c !== "yellow") return false;
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
    if (inactiveFilter) {
      // Rot vor Gelb; innerhalb gleicher Farbe älteste last_usage_at zuerst, NULL ans Ende
      // (Sekundärkriterium für NULL-Fälle: created_at aufsteigend).
      const rank = (l: any) => (computeLeadAmpel(l, leadThresholds, ampelNow)?.color === "red" ? 0 : 1);
      return [...filtered].sort((a, b) => {
        const ra = rank(a), rb = rank(b);
        if (ra !== rb) return ra - rb;
        const la = a.qodia_last_usage_at ? new Date(a.qodia_last_usage_at).getTime() : null;
        const lb = b.qodia_last_usage_at ? new Date(b.qodia_last_usage_at).getTime() : null;
        if (la !== null && lb !== null && la !== lb) return la - lb;
        if (la !== null && lb === null) return -1;
        if (la === null && lb !== null) return 1;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    }
    return [...filtered].sort((a, b) => {
      const pa = (leadStatusCfg[a.status]?.priority ?? 99);
      const pb = (leadStatusCfg[b.status]?.priority ?? 99);
      if (pa !== pb) return pa - pb;
      // Within same status, older first (needs attention sooner)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [filtered, inactiveFilter, leadThresholds, ampelNow]);

  // Attention metrics
  // Attention metrics — based on team-filtered, active leads only
  const attentionMetrics = useMemo(() => {
    const activeLeads = teamLeads.filter((l: any) => ACTIVE_LEAD_STATUSES.includes(l.status));
    const overdue14 = activeLeads.filter((l: any) => differenceInDays(new Date(), new Date(l.created_at)) > 14).length;
    const overdue7 = activeLeads.filter((l: any) => { const d = differenceInDays(new Date(), new Date(l.created_at)); return d > 7 && d <= 14; }).length;
    const qualifiziert = activeLeads.filter((l: any) => l.status === "qualifiziert").length;
    const neu = activeLeads.filter((l: any) => l.status === "neu").length;
    // Testphase inaktiv: Kohorte (synced, fehlerfrei, frisch ≤ TESTPHASE_FRESHNESS_DAYS) ∩ Ampel ROT
    const testphaseInaktiv = activeLeads.filter((l: any) =>
      isTestphaseCohort(l, ampelNow) && computeLeadAmpel(l, leadThresholds, ampelNow)?.color === "red"
    ).length;
    return { overdue14, overdue7, qualifiziert, neu, testphaseInaktiv };
  }, [teamLeads, leadThresholds, ampelNow]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("leads").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journey-leads"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-leads-all"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-contracts-all"] });
      toast.success("Status aktualisiert");
    },
  });


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
      {(statusFilter === "aktiv" || statusFilter === "qualifiziert") && (attentionMetrics.overdue14 > 0 || attentionMetrics.overdue7 > 0 || attentionMetrics.qualifiziert > 0 || attentionMetrics.testphaseInaktiv > 0) && (
        <AttentionBar items={[
          attentionMetrics.overdue14 > 0
            ? { icon: <AlertTriangle className="h-3 w-3" />, text: `${attentionMetrics.overdue14} Lead${attentionMetrics.overdue14 > 1 ? "s" : ""} über 14 Tage alt`, cls: "text-destructive", onClick: () => toggleOverdue("overdue14"), active: overdueFilter === "overdue14" }
            : { icon: null, text: "" },
          attentionMetrics.overdue7 > 0
            ? { icon: <Clock className="h-3 w-3" />, text: `${attentionMetrics.overdue7} Lead${attentionMetrics.overdue7 > 1 ? "s" : ""} über 7 Tage alt`, cls: "text-warning", onClick: () => toggleOverdue("overdue7"), active: overdueFilter === "overdue7" }
            : { icon: null, text: "" },
          attentionMetrics.testphaseInaktiv > 0
            ? {
                icon: <Ban className="h-3 w-3" />,
                text: `${attentionMetrics.testphaseInaktiv} Testphase${attentionMetrics.testphaseInaktiv > 1 ? "n" : ""} inaktiv`,
                cls: "text-destructive",
                onClick: toggleInactive,
                active: inactiveFilter,
                tooltip: `Interessenten in Testphase ohne aktuelle Einreichungen (rot = ab ${leadThresholds.red_days} Tagen)`,
              }
            : { icon: null, text: "" },
          attentionMetrics.qualifiziert > 0
            ? { icon: <FilePlus className="h-3 w-3" />, text: `${attentionMetrics.qualifiziert} qualifiziert — bereit für Vertrag`, cls: "text-success", onClick: toggleQualifiziert, active: statusFilter === "qualifiziert" }
            : { icon: null, text: "" },
        ]} />
      )}

      {/* Unified Toolbar */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <FilterPill active={statusFilter === "aktiv"} onClick={() => selectStatus("aktiv")} label="Im Prozess" count={activeCount} />
          <FilterPill active={statusFilter === "kein_abschluss"} onClick={() => selectStatus("kein_abschluss")} label="Kein Abschluss" count={closedKeinCount} />
          <FilterPill active={statusFilter === "abgelehnt"} onClick={() => selectStatus("abgelehnt")} label="Abgelehnt" count={closedAblCount} />
          <FilterPill active={statusFilter === "dublette"} onClick={() => selectStatus("dublette")} label="Dublette" count={dubletteCount} />
          <FilterPill active={statusFilter === "alle"} onClick={() => selectStatus("alle")} label="Alle" count={teamLeads.length} />

          <span className="h-5 w-px bg-border mx-1" />

          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as LeadSourceFilter)}>
            <SelectTrigger className="h-8 w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="alle">Alle Quellen ({teamLeads.length})</SelectItem>
              <SelectItem value="homepage">Homepage ({homepageCount})</SelectItem>
              <SelectItem value="manuell">Manuell ({manuellCount})</SelectItem>
              <SelectItem value="reservierung">Reservierung ({reservierungCount})</SelectItem>
            </SelectContent>
          </Select>
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
              <TH>Interesse an</TH>
              <TH>Abrechnungszentrum</TH>
              <TH>PLZ / Ort</TH>
              <TH>Betreuer</TH>
              <TH right>Qodia</TH>
              <TH>Aktivität</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={11} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : sorted.length === 0 ? (
              overdueFilter || inactiveFilter || statusFilter !== "aktiv" ? (
                <EmptyState
                  icon={Users}
                  title="Keine Treffer für diesen Filter."
                  action={
                    <button type="button" onClick={resetFilters} className="text-xs font-medium text-primary hover:underline">
                      Filter zurücksetzen
                    </button>
                  }
                />
              ) : (
                <EmptyState icon={Users} title="Keine Interessenten gefunden" sub="Versuche einen anderen Filter oder lege einen neuen Interessenten an" />
              )
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
                    <StatusPill label={sc.label} cls={sc.cls} tooltip={LEAD_STATUS_TOOLTIPS[lead.status] ?? sc.label} />
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
                    {lead.interested_products && lead.interested_products.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {(lead.interested_products as string[]).map((p) => (
                          <span
                            key={p}
                            title={p}
                            className="inline-flex items-center px-1.5 py-0.5 rounded border border-border text-[10px] font-medium text-foreground bg-background whitespace-nowrap"
                          >
                            {productMiniLabel(p)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
                      <QodiaLeadStatusCell synced={!!lead.qodia_synced} conflict={!!lead.qodia_conflict} />
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
                  <td className="py-3 px-4">
                    <LeadUsageCell lead={lead} thresholds={leadThresholds} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedLead && (
        <KundenDialog
          open={!!selectedLead}
          onClose={() => { setSelectedLead(null); onClearDeepLink?.(); queryClient.invalidateQueries({ queryKey: ["journey-leads"] }); }}
          input={{ type: "lead", leadId: selectedLead.id }}
        />
      )}
      <CreateLeadDialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) queryClient.invalidateQueries({ queryKey: ["journey-leads"] }); }} />
    </div>
  );
}

// ─── Tab: Abschlussphase (nur Verträge im Abschlussprozess) ──────────────────

const ABSCHLUSS_STATUSES = ["entwurf", "eingegangen", "gezeichnet"];

function AbschlussphaseTab({ search, highlightId, missingEmailCount, matchesTeamFilter, initialFilter }: { search: string; highlightId?: string; missingEmailCount: number; matchesTeamFilter: (id?: string | null) => boolean; initialFilter?: string }) {
  // Deep-Link setzt ausschließlich contractFilter; statusFilter bleibt "alle" (isWaitingForMandate ist SSOT)
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [contractFilter, setContractFilter] = useState<"missing_email" | "missing_confirmation" | "waiting_payment" | null>(
    initialFilter === "missing_email" ? "missing_email" : initialFilter === "missing_confirmation" ? "missing_confirmation" : initialFilter === "waiting_payment" ? "waiting_payment" : null
  );
  const [staleFilter, setStaleFilter] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const syncUrlFilter = (next: string | null) => {
    const sp = new URLSearchParams(searchParams);
    if (next) sp.set("filter", next);
    else sp.delete("filter");
    setSearchParams(sp, { replace: true });
  };
  // Konfliktmenge: contractFilter vs. staleFilter — nur eines gleichzeitig aktiv
  const toggleContractFilter = (key: "missing_email" | "waiting_payment") => {
    const next = contractFilter === key ? null : key;
    setContractFilter(next);
    syncUrlFilter(next);
    if (next) setStaleFilter(false);
  };
  const toggleStale = () => {
    setStaleFilter((v) => {
      const next = !v;
      if (next && contractFilter) {
        setContractFilter(null);
        syncUrlFilter(null);
      }
      return next;
    });
  };
  // Status-Pillen sind exklusiv zu contractFilter/staleFilter
  const selectStatus = (next: string) => {
    setStatusFilter(next);
    setStaleFilter(false);
    if (contractFilter) {
      setContractFilter(null);
      syncUrlFilter(null);
    }
  };
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const highlightRef = useRef<HTMLTableRowElement | null>(null);
  const [sendingBuchungsmail, setSendingBuchungsmail] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const { isSalesPartner, isTippgeber, role } = useUserRole();
  const { user } = useAuth();

  const sendBuchungsmail = async (contract: any, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!contract.email) {
      toast.error("Keine E-Mail-Adresse hinterlegt – SEPA-Mandat-Mail kann nicht gesendet werden.");
      return;
    }
    setSendingBuchungsmail(contract.id);
    try {
      const { error } = await supabase.functions.invoke("send-mandate-setup", {
        body: { contract_id: contract.id },
      });
      if (error) throw error;
      toast.success(`SEPA-Mandat-Mail an ${contract.email} gesendet`);
      queryClient.invalidateQueries({ queryKey: ["journey-contracts-abschluss"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-leads-all"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-contracts-all"] });
    } catch (err: any) {
      toast.error(err.message || "Fehler beim Senden der SEPA-Mandat-Mail");
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
        .select("id, customer_name, product_name, status, monthly_price, hfx_customer_number, email, vorname, nachname, praxis, created_at, start_date, mandate_email_sent_at, confirmation_email_sent_at, customer_confirmed_at, sales_partner_name, sales_partner_id, created_by, customer_id")
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
    const base = contracts.filter((c: any) => !isTestHfx(c.hfx_customer_number));
    if (isSalesPartner || isTippgeber) return base;
    return base.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by));
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
  const { data: carrierMap = {} } = useCarrierMap();

  const statusCounts = ABSCHLUSS_STATUSES.reduce((acc, s) => {
    acc[s] = teamContracts.filter((c: any) => c.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const s = search.toLowerCase();
  const filteredBase = teamContracts.filter((c: any) => {
    if (statusFilter !== "alle" && c.status !== statusFilter) return false;

    // Deep-link contract filter from Dashboard
    if (contractFilter === "missing_email" && !(c.status === "eingegangen" && !c.mandate_email_sent_at)) return false;
    if (contractFilter === "missing_confirmation" && !(c.status === "eingegangen" && c.mandate_email_sent_at && !c.confirmation_email_sent_at)) return false;
    if (contractFilter === "waiting_payment" && !isWaitingForMandate(c)) return false;
    if (staleFilter && differenceInDays(new Date(), new Date(c.created_at)) <= 7) return false;

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
      // Priority 1: eingegangen ohne SEPA-Mandat-Mail (Mail 1)
      const aMissing = a.status === "eingegangen" && !a.mandate_email_sent_at ? 1 : 0;
      const bMissing = b.status === "eingegangen" && !b.mandate_email_sent_at ? 1 : 0;
      if (aMissing !== bMissing) return bMissing - aMissing;
      // Priority 2: SEPA-Mandat-Mail versendet, Kunde hat noch nicht bezahlt
      const aWaiting = isWaitingForMandate(a) ? 1 : 0;
      const bWaiting = isWaitingForMandate(b) ? 1 : 0;
      if (aWaiting !== bWaiting) return bWaiting - aWaiting;
      // Priority 3: older first (stale)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [filteredBase]);

  // Attention metrics
  const attentionMetrics = useMemo(() => {
    const missingEmail = teamContracts.filter((c: any) => c.status === "eingegangen" && !c.mandate_email_sent_at).length;
    const waitingPayment = teamContracts.filter((c: any) => isWaitingForMandate(c)).length;
    const stale7 = teamContracts.filter((c: any) => differenceInDays(new Date(), new Date(c.created_at)) > 7).length;
    return { missingEmail, waitingPayment, stale7 };
  }, [teamContracts]);

  const getNextAction = (c: any) => {
    switch (c.status) {
      case "entwurf":
        return { label: "Vertrag bearbeiten", icon: <PenLine className="h-3 w-3" />, cls: "bg-muted text-muted-foreground border border-border hover:bg-muted/80", isClickable: true };
      case "eingegangen":
        if (!c.mandate_email_sent_at) {
          return { label: "SEPA-Mandat senden", icon: <Mail className="h-3 w-3" />, cls: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm", isClickable: true, isBuchungsmail: true };
        }
        if (!c.customer_confirmed_at) {
          return { label: "Wartet auf Mandat-Erteilung", icon: <Clock className="h-3 w-3" />, cls: "bg-warning/10 text-warning border border-warning/20", isClickable: false };
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
    if (c.status === "eingegangen" && !c.mandate_email_sent_at) return "border-l-2 border-l-primary bg-primary/[0.03]";
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
          attentionMetrics.missingEmail > 0
            ? { icon: <Mail className="h-3 w-3" />, text: `${attentionMetrics.missingEmail} Vertrag${attentionMetrics.missingEmail > 1 ? "e" : ""} ohne SEPA-Mandat-Versand`, cls: "text-destructive", onClick: () => toggleContractFilter("missing_email"), active: contractFilter === "missing_email" }
            : { icon: null, text: "" },
          attentionMetrics.waitingPayment > 0
            ? { icon: <Clock className="h-3 w-3" />, text: `${attentionMetrics.waitingPayment} warten auf Mandat-Erteilung`, cls: "text-warning", onClick: () => toggleContractFilter("waiting_payment"), active: contractFilter === "waiting_payment" }
            : { icon: null, text: "" },
          attentionMetrics.stale7 > 0
            ? { icon: <AlertTriangle className="h-3 w-3" />, text: `${attentionMetrics.stale7} seit >7 Tagen offen`, cls: "text-orange-600 dark:text-orange-400", onClick: toggleStale, active: staleFilter }
            : { icon: null, text: "" },
        ]} />
      )}

      {/* Status filter pills */}
      <div className="p-4 border-b border-border flex flex-wrap gap-2 items-center">
        <FilterPill active={statusFilter === "alle"} onClick={() => selectStatus("alle")} label="Alle" count={teamContracts.length} />
        {ABSCHLUSS_STATUSES.map((st) => {
          const cfg = CONTRACT_STATUS_CONFIG[st as keyof typeof CONTRACT_STATUS_CONFIG];
          if (!cfg) return null;
          return (
            <FilterPill
              key={st}
              active={statusFilter === st}
              onClick={() => selectStatus(st)}
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
              <TH tier="secondary">Wartezeit</TH>
              <TH>Nächster Schritt</TH>
              <TH tier="tertiary">Checkliste</TH>
              <TH tier="tertiary">Qodia</TH>
              <TH right>Monatlich</TH>
              <TH tier="tertiary">Vertrieb</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={9} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : sorted.length === 0 ? (
              <EmptyState icon={FileText} title="Keine Verträge in der Abschlussphase" sub="Neue Verträge erscheinen hier sobald ein Lead qualifiziert wird" />
            ) : sorted.map((c: any) => {
              const sc = CONTRACT_STATUS_CONFIG[c.status as keyof typeof CONTRACT_STATUS_CONFIG] ?? CONTRACT_STATUS_CONFIG.entwurf;
              const praxisLabel = c.praxis || c.customer_name || "–";
              const arztLabel = [c.vorname, c.nachname].filter(Boolean).join(" ") || null;
              const nextAction = getNextAction(c);
              const urgencyCls = getRowUrgency(c);
              return (
                <tr
                  key={c.id}
                  ref={highlightId === c.id ? (highlightRef as any) : null}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, a, label, [role='menuitem'], input")) return;
                    setSelectedContractId(c.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    if ((e.target as HTMLElement) !== e.currentTarget) return;
                    e.preventDefault();
                    setSelectedContractId(c.id);
                  }}
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
                  <td className="py-3 px-4">
                    <div className="flex flex-col gap-1">
                      <ProductBadges
                        products={c.product_name ? [{ key: c.product_name, label: c.product_name, variant: "primary" }] : []}
                      />
                      <StandortBadge
                        productName={c.product_name}
                        contractId={c.id}
                        carrierContractId={c.customer_id ? carrierMap[c.customer_id] : null}
                      />
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <StatusPill label={sc.label} cls={sc.class} tooltip={CONTRACT_STATUS_TOOLTIPS[c.status] ?? sc.label} />
                  </td>
                  <td className="py-3 px-4 hidden xl:table-cell">
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
                  <td className="py-3 px-4 hidden 2xl:table-cell">
                    <div className="flex flex-col gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium cursor-help ${c.mandate_email_sent_at ? "text-success" : "text-muted-foreground/50"}`}>
                            {c.mandate_email_sent_at ? <CheckCircle2 className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
                            SEPA-Mandat
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{PHASE_TOOLTIPS.sepa_mandat}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium cursor-help ${c.confirmation_email_sent_at ? "text-success" : "text-muted-foreground/50"}`}>
                            {c.confirmation_email_sent_at ? <CheckCircle2 className="h-3 w-3" /> : <FileCheck className="h-3 w-3" />}
                            Vertragsunterlagen
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{PHASE_TOOLTIPS.vertragsunterlagen}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-medium cursor-help ${c.customer_confirmed_at ? "text-success" : "text-muted-foreground/50"}`}>
                            {c.customer_confirmed_at ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                            Mandat erteilt
                          </span>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">{PHASE_TOOLTIPS.mandat_erteilt}</TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                  <td className="py-3 px-4 hidden 2xl:table-cell">
                    {providerFlags[c.product_name] ? (
                      <div className="flex items-center gap-1.5">
                        <QodiaStatusCell row={qodiaStatusMap[c.id]} />
                        <QodiaWarningIcon row={qodiaStatusMap[c.id]} contractStatus={c.status} />
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/40">–</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-medium text-foreground whitespace-nowrap">
                    {c.monthly_price > 0
                      ? `${Number(c.monthly_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
                      : "–"}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground hidden 2xl:table-cell">{c.sales_partner_name || "–"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {selectedContractId && (
        <KundenDialog
          open={!!selectedContractId}
          onClose={() => {
            setSelectedContractId(null);
            queryClient.invalidateQueries({ queryKey: ["journey-contracts-abschluss"] });
            queryClient.invalidateQueries({ queryKey: ["kpi-leads-all"] });
      queryClient.invalidateQueries({ queryKey: ["kpi-contracts-all"] });
          }}
          input={{ type: "contract", contractId: selectedContractId }}
        />
      )}
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
  const { isSalesPartner, isTippgeber, isAdmin, isSalesLead, isRegionalLead, isUser, role } = useUserRole();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("aktiv");
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(new Set());
  const toggleExpanded = (customerId: string) => {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  };

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

  // Team-filtered contracts for consistent counts
  const teamContracts = useMemo(() => {
    const base = allContracts.filter((c: any) => !isTestHfx(c.hfx_customer_number));
    if (isSalesPartner || isTippgeber) return base;
    return base.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by));
  }, [allContracts, matchesTeamFilter, isSalesPartner, isTippgeber]);

  // Provider statuses (generic). Qodia for GOÄ, HonorarPlus for EBM.
  const { data: qodiaFlags = {} } = useProductProviderFlags("qodia");
  const { data: honorarplusFlags = {} } = useProductProviderFlags("honorarplus");
  const qodiaContractIds = useMemo(
    () => teamContracts.filter((c: any) => qodiaFlags[c.product_name]).map((c: any) => c.id),
    [teamContracts, qodiaFlags],
  );
  const honorarplusContractIds = useMemo(
    () => teamContracts.filter((c: any) => honorarplusFlags[c.product_name]).map((c: any) => c.id),
    [teamContracts, honorarplusFlags],
  );
  const { data: qodiaStatusMap = {} } = useProviderStatusMap({
    contractIds: qodiaContractIds, provider: "qodia",
  });
  const { data: honorarplusStatusMap = {} } = useProviderStatusMap({
    contractIds: honorarplusContractIds, provider: "honorarplus",
  });
  const { data: thresholds = { yellow_days: 30, red_days: 60 } } = useActivityThresholds();

  // Customer→contracts map (for Mix-products onboarding rows)
  const customerContractsMap = useCustomerContractsMap(allContracts as any);
  const { data: carrierMap = {} } = useCarrierMap();

  // back-compat alias for older code paths in this file
  const providerFlags = qodiaFlags;

  // Phase 3: Pillen zählen distinkte Kunden je Status (Contract-vs-Customer)
  const statusCounts = KUNDEN_STATUSES.reduce((acc, s) => {
    acc[s] = countDistinctCustomers(teamContracts.filter((c: any) => c.status === s));
    return acc;
  }, {} as Record<string, number>);
  const alleCustomerCount = countDistinctCustomers(teamContracts as any);

  const s = search.toLowerCase();

  // Deduplicate by hfx_customer_number for cleaner view
  const statusFiltered = statusFilter === "alle"
    ? teamContracts
    : teamContracts.filter((c: any) => c.status === statusFilter);

  // Deduplicate for cleaner view.
  // Phase 1a: Primärer Dedup-Key ist customer_id (Klammer über Träger + Standorte).
  // Phase 1c: Repräsentant pro customer_id ist bevorzugt der Trägervertrag
  //   (carrierMap[customer_id]). Fallback: erstes nach Statusfilter sichtbares
  //   Element (heutiges Verhalten), wenn der Träger nicht im aktuellen
  //   Statusfilter liegt oder kein Träger gesetzt ist.
  // Fallback für Altzeilen ohne customer_id: hfx_customer_number; letzter Fallback: Praxisname.
  const carrierRowByCustomer = new Map<string, any>();
  const firstRowByCustomer = new Map<string, any>();
  for (const c of statusFiltered as any[]) {
    if (!c.customer_id) continue;
    if (!firstRowByCustomer.has(c.customer_id)) firstRowByCustomer.set(c.customer_id, c);
    const carrierId = carrierMap[c.customer_id];
    if (carrierId && c.id === carrierId) carrierRowByCustomer.set(c.customer_id, c);
  }
  const seenKeys = new Set<string>();
  const rows = (statusFiltered as any[]).filter((c: any) => {
    if (c.customer_id) {
      const key = `cust:${c.customer_id}`;
      if (seenKeys.has(key)) return false;
      const rep = carrierRowByCustomer.get(c.customer_id) ?? firstRowByCustomer.get(c.customer_id);
      if (rep?.id !== c.id) return false;
      seenKeys.add(key);
      return true;
    }
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
        <FilterPill active={statusFilter === "alle"} onClick={() => setStatusFilter("alle")} label="Alle" count={alleCustomerCount} />
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH>Praxis / Arzt</TH>
              <TH>Produkt</TH>
              <TH>Status</TH>
              <TH tier="tertiary">Kunde seit</TH>
              <TH tier="tertiary">Vertrieb</TH>
              <TH>Onboarding</TH>
              <TH tier="secondary">Aktivität</TH>
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
              const sc = kundenStatusCfg[c.status] ?? kundenStatusCfg.aktiv;
              const usesQodia = !!qodiaFlags[c.product_name];
              const qodiaRow: ProviderStatusRow | null = usesQodia ? (qodiaStatusMap[c.id] ?? null) : null;

              // Build per-product onboarding inputs covering ALL products this customer has,
              // so Mix-contracts (GOÄ + EBM) show two rows per cell.
              const customerProductRows = c.customer_id ? (customerContractsMap[c.customer_id] ?? []) : [];
              const baseList = customerProductRows.length > 0
                ? customerProductRows.map((row: any) => ({ id: row.id, product_name: row.product_name }))
                : [{ id: c.id, product_name: c.product_name }];
              const onboardingProducts: ProductOnboardingInput[] = baseList
                .filter((row: any) => qodiaFlags[row.product_name] || honorarplusFlags[row.product_name])
                .map((row: any) => {
                  const provider = qodiaFlags[row.product_name] ? "qodia" : "honorarplus";
                  const status = provider === "qodia"
                    ? (qodiaStatusMap[row.id] ?? null)
                    : (honorarplusStatusMap[row.id] ?? null);
                  return {
                    productLabel: productMiniLabel(row.product_name),
                    provider,
                    status,
                    hasUsage: provider === "qodia",
                    contractId: row.id,
                    contractCreatedAt: row.created_at ?? c.created_at ?? null,
                    customerLabel: praxisLabel,
                  };
                });

              // Standort-Erkennung (Weg A, GOÄ-gegated). Sub-Zeilen werden
              // additiv unter der Träger-Zeile gerendert; keine Änderung an
              // Filter/Sortierung/Dedup.
              const carrierContractId = c.customer_id ? carrierMap[c.customer_id] : null;
              const standorte = c.customer_id
                ? pickStandorte(customerContractsMap[c.customer_id] ?? [], carrierContractId)
                : [];
              const isExpanded = c.customer_id ? expandedCustomers.has(c.customer_id) : false;
              return (
                <Fragment key={c.id}>
                <tr
                  ref={highlightId === c.id ? highlightRef : null}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("button, a, label, [role='menuitem'], input")) return;
                    setSelectedContractId(c.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    if ((e.target as HTMLElement) !== e.currentTarget) return;
                    e.preventDefault();
                    setSelectedContractId(c.id);
                  }}
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
                    {standorte.length > 0 && c.customer_id && (
                      <div className="mt-1.5">
                        <StandorteToggleBadge
                          count={standorte.length}
                          expanded={isExpanded}
                          onToggle={() => toggleExpanded(c.customer_id)}
                        />
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {(() => {
                      // Prefer the customer-wide list when available; fall back to the row's own product.
                      const list = c.customer_id ? (customerContractsMap[c.customer_id] ?? []) : [];
                      const items: ProductBadgeItem[] = list.length > 0
                        ? list.map((row) => ({
                            key: row.product_name,
                            label: row.product_name,
                            variant: row.id === c.id ? "primary" : "default",
                          }))
                        : c.product_name
                          ? [{ key: c.product_name, label: c.product_name, variant: "primary" }]
                          : [];
                      return (
                        <div className="flex flex-col gap-1">
                          <ProductBadges products={items} />
                          <StandortBadge
                            productName={c.product_name}
                            contractId={c.id}
                            carrierContractId={c.customer_id ? carrierMap[c.customer_id] : null}
                          />
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4">
                    <StatusPill label={sc.label} cls={sc.cls} tooltip={CONTRACT_STATUS_TOOLTIPS[c.status] ?? sc.label} />
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap hidden 2xl:table-cell">
                    {c.start_date ? format(new Date(c.start_date), "dd.MM.yy", { locale: de }) : "–"}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground hidden 2xl:table-cell">{c.sales_partner_name || "–"}</td>
                  <td className="py-3 px-4" onClick={(e) => e.stopPropagation()}>
                    <OnboardingCell
                      products={onboardingProducts}
                      showMarkReady={isAdmin || isSalesLead || isRegionalLead || isSalesPartner || isUser}
                      customerLabel={praxisLabel}
                      onMarkReady={() => qc.invalidateQueries({ queryKey: ["provider-status-map"] })}
                    />
                  </td>
                  <td className="py-3 px-4 hidden xl:table-cell">
                    <ActivityCell products={onboardingProducts} thresholds={thresholds} />
                  </td>
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
                {isExpanded && standorte.map((st: any) => (
                  <StandorteSubRow
                    key={`sub-${st.id}`}
                    standort={st}
                    carrierContractId={carrierContractId}
                    colSpan={8}
                    // L5: Sub-Zeile öffnet den KundenDialog des Hauptaccounts
                    // (Trägervertrag), nicht den isolierten Standort.
                    onOpen={() => setSelectedContractId(carrierContractId ?? c.id)}
                  />
                ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedContractId && (
        <KundenDialog
          open={!!selectedContractId}
          onClose={() => {
            setSelectedContractId(null);
            qc.invalidateQueries({ queryKey: ["journey-kunden"] });
          }}
          input={{ type: "contract", contractId: selectedContractId }}
        />
      )}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get("tab");
  const urlFilter = searchParams.get("filter") ?? undefined;
  const urlId = searchParams.get("id") ?? undefined;
  const urlLead = searchParams.get("lead") ?? undefined;
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"interessenten" | "abschlussphase" | "kunden">(
    urlLead ? "interessenten"
      : urlTab === "abschlussphase" || urlTab === "vertraege" ? "abschlussphase"
      : urlTab === "kunden" || urlTab === "bestandskunden" ? "kunden"
      : "interessenten"
  );

  // If a deep-link arrives later (e.g. via toast action) and forces interessenten
  useEffect(() => {
    if (urlLead && tab !== "interessenten") {
      setTab("interessenten");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlLead]);

  const { teamFilter, setTeamFilter, matchesTeamFilter, teamFilterOptions, isRegionalLead } = useRegionalTeam();
  const { isSalesPartner, isTippgeber } = useUserRole();
  const { user } = useAuth();

  // KPI data: all leads (including kunde) for conversion metrics — RLS-filtered
  const { data: kpiLeadsAll = [] } = useQuery({
    queryKey: ["kpi-leads-all", user?.id],
    queryFn: async () => {
      let q = supabase.from("leads").select("id, status, source, nachricht, created_at, assigned_to, hfx_customer_number, tippgeber_id");
      if (isTippgeber && user?.id) q = q.eq("tippgeber_id", user.id);
      // Sales Partner werden jetzt durch RLS gefiltert (Migration fix_lead_visibility_and_assignment)
      const { data } = await q;
      return data ?? [];
    },
  });

  // KPI data: all contracts for funnel + time metrics — RLS-filtered
  // Hinweis: bewusst ohne .in()-Statusfilter, damit diese Query die einzige
  // Filterquelle (SSOT) für KPIs UND Tab-Badges bleibt. Decke ca. 2.000 Zeilen;
  // darüber hinaus wäre eine Aggregat-RPC der Ausweg.
  const { data: kpiContractsAll = [] } = useQuery({
    queryKey: ["kpi-contracts-all", user?.id],
    queryFn: async () => {
      if (isTippgeber) return [];
      let q = supabase.from("contracts").select("id, status, created_at, start_date, hfx_customer_number, customer_id, praxis, customer_name, sales_partner_id, created_by, monthly_price, updated_at, mandate_email_sent_at, customer_confirmed_at");
      if (isSalesPartner && user?.id) q = q.or(`sales_partner_id.eq.${user.id},created_by.eq.${user.id}`);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Apply team filter on KPI data (client-side, same as tabs)
  const kpiTeamLeads = useMemo(() => {
    const base = kpiLeadsAll.filter((l: any) => !isTestHfx(l.hfx_customer_number));
    if (isSalesPartner || isTippgeber) return base;
    return base.filter((l: any) => matchesTeamFilter(l.assigned_to));
  }, [kpiLeadsAll, matchesTeamFilter, isSalesPartner, isTippgeber]);

  const kpiTeamContracts = useMemo(() => {
    const base = kpiContractsAll.filter((c: any) => !isTestHfx(c.hfx_customer_number));
    if (isSalesPartner || isTippgeber) return base;
    return base.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by));
  }, [kpiContractsAll, matchesTeamFilter, isSalesPartner, isTippgeber]);

  // Split leads for KPI bar: non-kunde leads vs kunde leads
  const kpiLeadsNonKunde = useMemo(() => kpiTeamLeads.filter((l: any) => l.status !== "kunde"), [kpiTeamLeads]);
  const kpiLeadsKunde = useMemo(() => kpiTeamLeads.filter((l: any) => l.status === "kunde"), [kpiTeamLeads]);

  // Tab-Badges aus derselben Basis wie die KPIs (eine Filterquelle)
  const counts = useMemo(() => ({
    leads: kpiTeamLeads.filter((l: any) => ACTIVE_LEAD_STATUSES.includes(l.status)).length,
    abschluss: kpiTeamContracts.filter((c: any) => ["entwurf", "eingegangen", "gezeichnet"].includes(c.status)).length,
    // Phase 3: Badge zählt distinkte Kunden, nicht Verträge (Träger + Standorte = 1 Kunde)
    kunden: countDistinctCustomers(kpiTeamContracts.filter((c: any) => c.status === "aktiv")),
    missingEmail: kpiTeamContracts.filter((c: any) => c.status === "eingegangen" && !c.mandate_email_sent_at).length,
  }), [kpiTeamLeads, kpiTeamContracts]);

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
          tab={tab}
          allLeads={kpiLeadsNonKunde}
          allContracts={kpiTeamContracts}
          kundeLeads={kpiLeadsKunde}
          activeCustomerCount={countDistinctCustomers(kpiTeamContracts.filter((c: any) => c.status === "aktiv"))}
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

        {tab === "interessenten" && <InteressentenTab search={search} highlightId={urlId} teamFilter={teamFilter} matchesTeamFilter={matchesTeamFilter} initialFilter={urlFilter} deepLinkLeadId={urlLead} onClearDeepLink={() => { const next = new URLSearchParams(searchParams); next.delete("lead"); setSearchParams(next, { replace: true }); }} />}
        {tab === "abschlussphase" && <AbschlussphaseTab search={search} highlightId={urlId} missingEmailCount={counts.missingEmail} matchesTeamFilter={matchesTeamFilter} initialFilter={urlFilter} />}
        {tab === "kunden" && <KundenTab search={search} highlightId={urlId} matchesTeamFilter={matchesTeamFilter} />}
      </div>
    </MainLayout>
  );
}
