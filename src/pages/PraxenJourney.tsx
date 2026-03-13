import { useState, useEffect, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Users, FileText, Building2, CheckCircle2, XCircle,
  UserPlus, Phone, UserCheck, FilePlus, Upload, Ban, Send,
  Loader2, Globe, PenLine, ArrowRight, RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { UploadPaperContractDialog } from "@/components/leads/UploadPaperContractDialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Status configs ──────────────────────────────────────────────────────────

const leadStatusCfg: Record<string, { label: string; cls: string }> = {
  neu:            { label: "Neu",            cls: "bg-primary/10 text-primary" },
  kontaktiert:    { label: "Kontaktiert",    cls: "bg-secondary text-secondary-foreground" },
  qualifiziert:   { label: "Qualifiziert",   cls: "bg-warning/15 text-warning" },
  vertrag:        { label: "Vertrag läuft",  cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  kein_abschluss: { label: "Kein Abschluss", cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  abgelehnt:      { label: "Abgelehnt",     cls: "bg-destructive/10 text-destructive" },
};

const contractStatusCfg: Record<string, { label: string; cls: string }> = {
  entwurf:     { label: "Entwurf",     cls: "bg-muted text-muted-foreground" },
  eingegangen: { label: "Eingegangen", cls: "bg-warning/15 text-warning" },
  gezeichnet:  { label: "Gezeichnet",  cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  gekuendigt:  { label: "Gekündigt",   cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  beendet:     { label: "Beendet",     cls: "bg-destructive/10 text-destructive" },
};

// ─── Shared helpers ───────────────────────────────────────────────────────────

function QodiaIcon({ synced }: { synced: boolean }) {
  return (
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
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/8 text-primary border border-primary/20">
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

function TH({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th className={`py-2.5 px-4 text-${right ? "right" : "left"} text-xs font-medium text-muted-foreground bg-muted/40 border-b border-border`}>
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

// ─── Tab: Interessenten ───────────────────────────────────────────────────────

const ACTIVE_LEAD_STATUSES = ["neu", "kontaktiert", "qualifiziert", "vertrag"];
const CLOSED_LEAD_STATUSES = ["kein_abschluss", "abgelehnt"];

type LeadSourceFilter = "alle" | "homepage" | "manuell";
type LeadStatusFilter = "aktiv" | "kein_abschluss" | "abgelehnt" | "alle";

function InteressentenTab({ search, highlightId }: { search: string; highlightId?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin, isSalesLead, isRegionalLead } = useUserRole();
  const canAssign = isAdmin || isSalesLead || isRegionalLead;
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const [sourceFilter, setSourceFilter] = useState<LeadSourceFilter>("alle");
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>("aktiv");
  const [createOpen, setCreateOpen] = useState(false);
  const [uploadLead, setUploadLead] = useState<any>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightId && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 300);
    }
  }, [highlightId]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["journey-leads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .neq("status", "kunde")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Counts for filter tabs
  const activeCount = leads.filter((l: any) => ACTIVE_LEAD_STATUSES.includes(l.status)).length;
  const closedKeinCount = leads.filter((l: any) => l.status === "kein_abschluss").length;
  const closedAblCount = leads.filter((l: any) => l.status === "abgelehnt").length;
  const homepageCount = leads.filter((l: any) => !l.nachricht || l.registration_attempts > 0 || !l.ort).length;

  // Determine source: leads without `ort` and with mobilnummer via webhook = homepage; manually filled = manuell
  // We use a heuristic: leads captured via CF7 webhook have mobilnummer non-empty from form fields;
  // manually entered leads were created by staff. We distinguish by checking `created_at` origin isn't needed —
  // instead we store the distinction: if the lead has no `nachricht` and non-empty `mobilnummer`, it's homepage.
  // Since we can't know for sure without a db column, we use: homepage = has `mobilnummer` set from form (registration_attempts >= 1 set by capture-lead fn)
  // Actually: capture-lead sets registration_attempts to 1 by default too. Let's use `confirmation_email_sent` = true as indicator of homepage capture
  // OR: simply show the info based on `nachricht` presence (homepage leads often have `nachricht` from form, manual leads don't)
  // Best approach: use registration_attempts > 1 OR confirmation_email_sent = true for homepage; else manual
  const getSource = (l: any): "homepage" | "manuell" => {
    // Homepage leads: created via CF7 form (capture-lead function), typically have confirmation_email_sent = true initially or registration_attempts from form
    // Manual leads: created in the admin UI, don't have confirmation_email_sent set from form
    // We'll use: if mobilnummer is from a phone input (numeric) AND confirmation_email_sent field exists → homepage
    // Simplest reliable heuristic: homepage leads come through capture-lead which sets confirmation_email_sent=false initially
    // Manual leads: created via CreateLeadDialog which also sets confirmation_email_sent=false
    // Let's use: if status was NEVER manually set (initial status 'neu') AND no assigned_to → could be homepage
    // REAL approach: add a `source` column... but we can't add migrations here.
    // Use heuristic: leads with `nachricht` field filled = homepage (form has a message field); manual = no nachricht
    if (l.nachricht && l.nachricht.trim().length > 0) return "homepage";
    // Also: leads with non-null `ort` (captured from form's city field) might be homepage
    // Fall back: if registration_attempts > 0 from auto-increment, it indicates form capture
    return "manuell";
  };

  const s = search.toLowerCase();

  const filtered = leads.filter((l: any) => {
    const src = getSource(l);
    if (sourceFilter !== "alle" && src !== sourceFilter) return false;
    if (statusFilter === "aktiv" && !ACTIVE_LEAD_STATUSES.includes(l.status)) return false;
    if (statusFilter === "kein_abschluss" && l.status !== "kein_abschluss") return false;
    if (statusFilter === "abgelehnt" && l.status !== "abgelehnt") return false;

    if (!s) return true;
    return (
      l.praxis_name?.toLowerCase().includes(s) ||
      l.vorname?.toLowerCase().includes(s) ||
      l.nachname?.toLowerCase().includes(s) ||
      l.email?.toLowerCase().includes(s) ||
      l.hfx_customer_number?.toLowerCase().includes(s) ||
      l.plz?.includes(s) ||
      l.ort?.toLowerCase().includes(s)
    );
  });

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
        return { label: "Papiervertrag", icon: <Upload className="h-3 w-3" />, cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20", action: () => setUploadLead(lead) };
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="p-4 border-b border-border flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Status filter tabs */}
        <div className="flex gap-1 flex-wrap">
          {[
            { key: "aktiv" as const, label: "Im Prozess", count: activeCount },
            { key: "kein_abschluss" as const, label: "Kein Abschluss", count: closedKeinCount },
            { key: "abgelehnt" as const, label: "Abgelehnt", count: closedAblCount },
            { key: "alle" as const, label: "Alle", count: leads.length },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === t.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {t.label}
              <span className={`text-[10px] px-1 py-0.5 rounded-full ${statusFilter === t.key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                {t.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {/* Source filter */}
          <div className="flex gap-1">
            {[
              { key: "alle" as const, label: "Alle Quellen" },
              { key: "homepage" as const, icon: <Globe className="h-3 w-3" />, label: "Homepage" },
              { key: "manuell" as const, icon: <PenLine className="h-3 w-3" />, label: "Manuell" },
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
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 h-8">
            <UserPlus className="h-3.5 w-3.5" />
            Neuer Interessent
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH>HFX-Nr.</TH>
              <TH>Praxis / Arzt</TH>
              <TH>Quelle</TH>
              <TH>E-Mail</TH>
              <TH>PLZ / Ort</TH>
              <TH>Status</TH>
              <TH>Nächster Schritt</TH>
              <TH right>Qodia</TH>
              <TH>Datum</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={9} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <EmptyState icon={Users} title="Keine Interessenten gefunden" sub="Versuche einen anderen Filter oder lege einen neuen Interessenten an" />
            ) : filtered.map((lead: any) => {
              const sc = leadStatusCfg[lead.status] ?? leadStatusCfg.neu;
              const src = getSource(lead);
              const nextStep = getNextStepAction(lead);
              const isClosed = CLOSED_LEAD_STATUSES.includes(lead.status);
              return (
                <tr
                  key={lead.id}
                  ref={highlightId === lead.id ? highlightRef : null}
                  className={`hover:bg-muted/20 transition-colors group ${highlightId === lead.id ? "bg-primary/5 ring-1 ring-primary/30" : ""}`}
                >
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {lead.hfx_customer_number || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-foreground leading-tight">{lead.praxis_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{lead.vorname} {lead.nachname}</p>
                  </td>
                  <td className="py-3 px-4">
                    <SourceBadge source={src} />
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>{lead.email}</span>
                      {lead.hfx_customer_number && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => sendCredentials(lead.id)}
                                disabled={sendingId === lead.id}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary/70"
                              >
                                {sendingId === lead.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Send className="h-3 w-3" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Zugangsdaten senden</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {lead.plz}{lead.ort ? ` ${lead.ort}` : ""}
                  </td>
                  <td className="py-3 px-4">
                    <StatusPill label={sc.label} cls={sc.cls} />
                  </td>
                  <td className="py-3 px-4">
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
                  <td className="py-3 px-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <QodiaIcon synced={!!lead.qodia_synced} />
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
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {lead.created_at ? format(new Date(lead.created_at), "dd.MM.yy", { locale: de }) : "–"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CreateLeadDialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) queryClient.invalidateQueries({ queryKey: ["journey-leads"] }); }} />
      {uploadLead && (
        <UploadPaperContractDialog
          open={!!uploadLead}
          onOpenChange={(o) => { if (!o) { setUploadLead(null); queryClient.invalidateQueries({ queryKey: ["journey-leads"] }); } }}
          lead={uploadLead}
        />
      )}
    </div>
  );
}

// ─── Tab: Verträge (ausstehend) ───────────────────────────────────────────────

function VertraegeTab({ search }: { search: string }) {
  const [statusFilter, setStatusFilter] = useState<string>("alle");

  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["journey-contracts-pending"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, customer_name, product_name, status, monthly_price, hfx_customer_number, email, vorname, nachname, praxis, created_at, start_date, confirmation_email_sent_at, customer_confirmed_at, sales_partner_name")
        .neq("status", "aktiv")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const pendingStatuses = ["entwurf", "eingegangen", "gezeichnet", "gekuendigt", "beendet"];

  const statusCounts = pendingStatuses.reduce((acc, s) => {
    acc[s] = contracts.filter((c: any) => c.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const s = search.toLowerCase();
  const filtered = contracts.filter((c: any) => {
    if (statusFilter !== "alle" && c.status !== statusFilter) return false;
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

  // Warning: eingegangen ohne E-Mail
  const missingEmailAlert = contracts.filter((c: any) => c.status === "eingegangen" && !c.confirmation_email_sent_at).length;

  return (
    <div>
      {/* Alert */}
      {missingEmailAlert > 0 && (
        <div className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/8 px-4 py-3 text-sm text-warning">
          <FileText className="h-4 w-4 shrink-0" />
          <span>
            <strong>{missingEmailAlert} Vertrag{missingEmailAlert > 1 ? "e" : ""}</strong> mit Status "Eingegangen" — Bestätigungs-E-Mail noch nicht versendet.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="p-4 border-b border-border flex flex-wrap gap-2 items-center">
        <button
          onClick={() => setStatusFilter("alle")}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            statusFilter === "alle"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
          }`}
        >
          Alle
          <span className={`text-[10px] px-1 py-0.5 rounded-full ${statusFilter === "alle" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground"}`}>
            {contracts.length}
          </span>
        </button>
        {pendingStatuses.map((st) => {
          const cfg = contractStatusCfg[st];
          if (!cfg || statusCounts[st] === 0) return null;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                statusFilter === st
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
              }`}
            >
              {cfg.label}
              <span className={`text-[10px] px-1 py-0.5 rounded-full ${statusFilter === st ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground"}`}>
                {statusCounts[st]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH>HFX-Nr.</TH>
              <TH>Praxis / Arzt</TH>
              <TH>Produkt</TH>
              <TH>Status</TH>
              <TH right>Monatlich</TH>
              <TH>E-Mail versendet</TH>
              <TH>Zahlung</TH>
              <TH>Vertrieb</TH>
              <TH>Datum</TH>
              <TH>{""}</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={10} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <EmptyState icon={FileText} title="Keine ausstehenden Verträge" sub="Alle Verträge sind aktiv oder es gibt noch keine Verträge" />
            ) : filtered.map((c: any) => {
              const sc = contractStatusCfg[c.status] ?? contractStatusCfg.entwurf;
              const praxisLabel = c.praxis || c.customer_name || "–";
              const arztLabel = [c.vorname, c.nachname].filter(Boolean).join(" ") || null;
              return (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {c.hfx_customer_number || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-foreground leading-tight">{praxisLabel}</p>
                    {arztLabel && <p className="text-xs text-muted-foreground mt-0.5">{arztLabel}</p>}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{c.product_name}</td>
                  <td className="py-3 px-4">
                    <StatusPill label={sc.label} cls={sc.cls} />
                  </td>
                  <td className="py-3 px-4 text-right text-xs font-medium text-foreground whitespace-nowrap">
                    {c.monthly_price > 0
                      ? `${Number(c.monthly_price).toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`
                      : "–"}
                  </td>
                  <td className="py-3 px-4">
                    {c.confirmation_email_sent_at ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-success font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {format(new Date(c.confirmation_email_sent_at), "dd.MM.yy", { locale: de })}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                        <XCircle className="h-3.5 w-3.5" />
                        Ausstehend
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4">
                    {c.customer_confirmed_at ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-success font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Erfolgt
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/60">
                        <XCircle className="h-3.5 w-3.5" />
                        Ausstehend
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{c.sales_partner_name || "–"}</td>
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {c.created_at ? format(new Date(c.created_at), "dd.MM.yy", { locale: de }) : "–"}
                  </td>
                  <td className="py-3 px-4">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href="/vertrieb/vertraege" className="text-primary hover:text-primary/70 transition-colors">
                            <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>In Vertragsübersicht öffnen</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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

// ─── Tab: Kunden ──────────────────────────────────────────────────────────────

function KundenTab({ search }: { search: string }) {
  const [sendingId, setSendingId] = useState<string | null>(null);

  // Primary source: active contracts (single source of truth for customers)
  // Each unique hfx_customer_number = one customer row (deduplicated)
  const { data: activeContracts = [], isLoading } = useQuery({
    queryKey: ["journey-kunden"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, customer_name, hfx_customer_number, mp_nr, email, praxis, vorname, nachname, product_name, monthly_price, start_date, plz, ort, customer_id, sales_partner_name")
        .eq("status", "aktiv")
        .order("start_date", { ascending: false });
      return data ?? [];
    },
  });

  // Qodia sync status from leads (keyed by hfx_customer_number)
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

  const sendCredentials = async (email: string, name: string, hfxNr: string, id: string) => {
    setSendingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("resend-lead-credentials", {
        body: { email, nachname: name, hfxCustomerNumber: hfxNr },
      });
      if (error) throw error;
      if (data?.error) toast.error(data.error);
      else toast.success(`Zugangsdaten an ${email} gesendet`);
    } catch (err: any) {
      toast.error(err.message || "Versand fehlgeschlagen");
    } finally {
      setSendingId(null);
    }
  };

  const s = search.toLowerCase();

  // Deduplicate: one row per customer — keyed by hfx_customer_number if present,
  // otherwise by normalised customer_name (lowercase trim) to catch duplicates
  // without an HFX number (e.g. "Praxis Freitag" twice).
  const seenKeys = new Set<string>();
  const rows = activeContracts.filter((c: any) => {
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

  return (
    <div>
      <div className="p-4 border-b border-border flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{filtered.length} aktive Kunden</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <TH>HFX-Nr.</TH>
              <TH>MP-Nr.</TH>
              <TH>Praxis</TH>
              <TH>E-Mail</TH>
              <TH>PLZ / Ort</TH>
              <TH>Produkt</TH>
              <TH right>Qodia</TH>
              <TH>Seit</TH>
              <TH>{""}</TH>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={9} className="py-12 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></td></tr>
            ) : filtered.length === 0 ? (
              <EmptyState icon={Building2} title="Keine aktiven Kunden" sub="Aktivierte Verträge erscheinen hier automatisch" />
            ) : (filtered as any[]).map((c) => {
              const praxisLabel = c.praxis || c.customer_name || "–";
              const arztLabel = [c.vorname, c.nachname].filter(Boolean).join(" ");
              const qodia = !!(c.hfx_customer_number ? qodiaMap[c.hfx_customer_number] : false);
              return (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors group">
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {c.hfx_customer_number || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                    {c.mp_nr || <span className="text-muted-foreground/40">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-semibold text-foreground leading-tight">{praxisLabel}</p>
                    {arztLabel && <p className="text-xs text-muted-foreground mt-0.5">{arztLabel}</p>}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <span>{c.email || "–"}</span>
                      {c.email && c.hfx_customer_number && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                onClick={() => sendCredentials(c.email, c.customer_name, c.hfx_customer_number, c.id)}
                                disabled={sendingId === c.id}
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-primary hover:text-primary/70"
                              >
                                {sendingId === c.id
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Send className="h-3 w-3" />}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent>Zugangsdaten senden</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {c.plz}{c.ort ? ` ${c.ort}` : ""}
                  </td>
                  <td className="py-3 px-4 text-xs text-muted-foreground">{c.product_name || "–"}</td>
                  <td className="py-3 px-4 text-right"><QodiaIcon synced={qodia} /></td>
                  <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                    {c.start_date ? format(new Date(c.start_date), "dd.MM.yy", { locale: de }) : "–"}
                  </td>
                  <td className="py-3 px-4">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href="/vertrieb/vertraege" className="text-primary hover:text-primary/70 transition-colors">
                            <ArrowRight className="h-3.5 w-3.5" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>Vertrag öffnen</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
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

// ─── Journey Step Indicator ───────────────────────────────────────────────────

function JourneySteps({ activeTab, onSelect }: { activeTab: string; onSelect: (t: string) => void }) {
  const steps = [
    { key: "leads", label: "Interessenten", sub: "Lead-Eingang & Qualifizierung", icon: Users },
    { key: "vertraege", label: "Verträge", sub: "Ausstehend & in Bearbeitung", icon: FileText },
    { key: "kunden", label: "Kunden", sub: "Aktive Vertragspartner", icon: Building2 },
  ];
  return (
    <div className="flex items-stretch border-b border-border bg-muted/20">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const active = activeTab === step.key;
        return (
          <button
            key={step.key}
            onClick={() => onSelect(step.key)}
            className={`flex-1 flex items-center gap-3 px-6 py-4 text-left transition-colors border-b-2 ${
              active
                ? "border-primary bg-background text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
            } ${i > 0 ? "border-l border-l-border/50" : ""}`}
          >
            <div className={`flex-shrink-0 flex h-9 w-9 items-center justify-center rounded-full ${
              active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className={`text-sm font-semibold leading-tight ${active ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{step.sub}</p>
            </div>
            {i < steps.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground/40 flex-shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PraxenJourney() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"leads" | "vertraege" | "kunden">("leads");

  const { data: counts = { leads: 0, contracts: 0, kunden: 0 } } = useQuery({
    queryKey: ["journey-counts"],
    queryFn: async () => {
      const [l, c, k] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }).neq("status", "kunde"),
        supabase.from("contracts").select("id", { count: "exact", head: true }).neq("status", "aktiv"),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "aktiv"),
      ]);
      return { leads: l.count ?? 0, contracts: c.count ?? 0, kunden: k.count ?? 0 };
    },
  });

  return (
    <MainLayout
      title="Kunden-Journey"
      subtitle="Von der Anfrage bis zum aktiven Kunden — alles in einem Blick"
    >
      <div className="card-elevated overflow-hidden">
        {/* Journey Step Header */}
        <JourneySteps activeTab={tab} onSelect={(t) => setTab(t as any)} />

        {/* Count pills + Search bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/10">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {tab === "leads" ? counts.leads : tab === "vertraege" ? counts.contracts : counts.kunden}
            </span>
            <span>
              {tab === "leads" ? "Interessenten" : tab === "vertraege" ? "ausstehende Verträge" : "aktive Kunden"}
            </span>
          </div>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {/* Tab content */}
        {tab === "leads" && <InteressentenTab search={search} />}
        {tab === "vertraege" && <VertraegeTab search={search} />}
        {tab === "kunden" && <KundenTab search={search} />}
      </div>
    </MainLayout>
  );
}
