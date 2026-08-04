import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useRegionalTeam } from "@/hooks/useRegionalTeam";
import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Users, FileText, Building2, ArrowRight, Clock,
  Eye, FileSignature, Lightbulb, MapPin, BarChart3, BookOpen,
  X, Sparkles, AlertTriangle, Flame, Zap, UserPlus,
} from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { differenceInDays } from "date-fns";
import { isWaitingForMandate } from "@/lib/contractLifecycle";
import { AnleitungDialog } from "@/components/help/AnleitungDialog";
import { Button } from "@/components/ui/button";
import { useRolePreview } from "@/contexts/RolePreviewContext";

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}

function getRoleLabel(role: string | null): string {
  const labels: Record<string, string> = {
    admin: "Administrator",
    sales_partner: "Vertriebspartner",
    sales_lead: "Vertriebsleitung",
    vertragsabteilung: "Vertragsabteilung",
    regional_lead: "Regionalleiter",
    tippgeber: "Tippgeber",
    user: "Gebietsleiter",
  };
  return role ? labels[role] ?? role : "";
}

const onboardingConfig: Partial<Record<AppRole, { icon: React.ElementType; title: string; text: string; cta: string; to: string }>> = {
  tippgeber: {
    icon: Lightbulb,
    title: "Willkommen als Tippgeber!",
    text: "Reichen Sie jetzt Ihren ersten Empfehlungs-Lead ein.",
    cta: "Ersten Tipp-Lead einreichen",
    to: "/tipp-leads",
  },
  user: {
    icon: Users,
    title: "Willkommen als Gebietsleiter!",
    text: "Ihr Gebiet ist bereit. Erfassen Sie Interessenten oder schauen Sie sich Ihre zugeordneten Kunden an.",
    cta: "Pipeline öffnen",
    to: "/pipeline",
  },
  sales_partner: {
    icon: FileText,
    title: "Willkommen als Vertriebspartner!",
    text: "Legen Sie jetzt Ihren ersten Interessenten an oder erstellen Sie direkt einen Vertrag.",
    cta: "Pipeline öffnen",
    to: "/pipeline",
  },
  regional_lead: {
    icon: BarChart3,
    title: "Willkommen als Regionalleiter!",
    text: "Verwalten Sie Ihr Team und behalten Sie die Pipeline im Blick.",
    cta: "Pipeline öffnen",
    to: "/pipeline",
  },
  vertragsabteilung: {
    icon: FileSignature,
    title: "Willkommen in der Vertragsabteilung!",
    text: "Prüfen und genehmigen Sie eingereichte Verträge.",
    cta: "Verträge prüfen",
    to: "/vertrieb/vertraege",
  },
  sales_lead: {
    icon: MapPin,
    title: "Willkommen als Vertriebsleitung!",
    text: "Überblicken Sie alle Vertriebsaktivitäten.",
    cta: "Pipeline öffnen",
    to: "/pipeline",
  },
};

export default function Dashboard() {
  const { profile, user } = useAuth();
  const { role, isSalesPartner, isUser, isRegionalLead } = useUserRole();
  const { previewRole, isPreviewActive, setPreviewRole } = useRolePreview();
  const { matchesTeamFilter } = useRegionalTeam();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [anleitungOpen, setAnleitungOpen] = useState(false);

  const firstName = profile?.full_name?.split(" ")[0] ?? "Willkommen";
  const canSeePipeline = role !== "tippgeber";

  // ── BLOCK 1: "Heute wichtig" data ──
  const { data: overdueLeads = [] } = useQuery({
    queryKey: ["dashboard-overdue-leads", role, user?.id],
    enabled: canSeePipeline,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      let q = supabase
        .from("leads")
        .select("id, praxis_name, vorname, nachname, status, created_at, assigned_to")
        .in("status", ["neu", "kontaktiert", "qualifiziert", "vertrag"])
        .order("created_at", { ascending: true });
      // sales_partner UND user (Gebietsleiter) sehen nur eigene Leads.
      // leads hat kein created_by; nur assigned_to + tippgeber_id.
      if ((isSalesPartner || isUser) && user?.id) q = q.eq("assigned_to", user.id);
      const { data } = await q;
      return data ?? [];
    },
  });

  const { data: contractAlerts = [] } = useQuery({
    queryKey: ["dashboard-contract-alerts", role, user?.id],
    enabled: canSeePipeline,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      let q = supabase
        .from("contracts")
        .select("id, customer_name, product_name, status, mandate_email_sent_at, confirmation_email_sent_at, customer_confirmed_at, created_at, sales_partner_id, created_by")
        .in("status", ["eingegangen", "gezeichnet"]);
      // sales_partner UND user analog: eigene Verträge (sales_partner_id ODER created_by).
      if ((isSalesPartner || isUser) && user?.id) {
        q = q.or(`sales_partner_id.eq.${user.id},created_by.eq.${user.id}`);
      }
      const { data } = await q;
      return data ?? [];
    },
  });

  // ── Rechnungen mit fehlgeschlagenem SEPA-Einzug (nur Admin) ──
  const { data: failedInvoices = [] } = useQuery({
    queryKey: ["dashboard-failed-invoices", role],
    enabled: role === "admin",
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data } = await supabase
        .from("invoices")
        .select("id, invoice_number, customer_name, gross_amount, status")
        .eq("status", "zahlung_fehlgeschlagen");
      return data ?? [];
    },
  });

  // ── BLOCK 2: "Seit gestern reingekommen" ──
  const { data: newSinceYesterday } = useQuery({
    queryKey: ["dashboard-new-since-yesterday", role, user?.id],
    enabled: canSeePipeline,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      let leadsQ = supabase
        .from("leads")
        .select("id, praxis_name, vorname, nachname, created_at, assigned_to")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if ((isSalesPartner || isUser) && user?.id) leadsQ = leadsQ.eq("assigned_to", user.id);

      let contractsQ = supabase
        .from("contracts")
        .select("id, customer_name, praxis, created_at, sales_partner_id, created_by")
        .gte("created_at", since)
        .order("created_at", { ascending: false });
      if ((isSalesPartner || isUser) && user?.id) {
        contractsQ = contractsQ.or(`sales_partner_id.eq.${user.id},created_by.eq.${user.id}`);
      }

      const [l, c] = await Promise.all([leadsQ, contractsQ]);
      return { leads: l.data ?? [], contracts: c.data ?? [] };
    },
  });

  // ── Apply team filter for regional leads ──
  const applyTeamFilter = (items: any[], field: string) => {
    if (!isRegionalLead) return items;
    return items.filter((item) => matchesTeamFilter(item[field]));
  };

  // Filtered "Heute wichtig" items
  const filteredOverdueLeads = useMemo(() => {
    const items = applyTeamFilter(overdueLeads, "assigned_to");
    const now = new Date();
    return items
      .map((l: any) => ({ ...l, daysSince: differenceInDays(now, new Date(l.created_at)) }))
      .filter((l: any) => l.daysSince >= 7);
  }, [overdueLeads, matchesTeamFilter, isRegionalLead]);

  const overdueLeads7 = filteredOverdueLeads.filter((l: any) => l.daysSince >= 7 && l.daysSince < 14);
  const overdueLeads14 = filteredOverdueLeads.filter((l: any) => l.daysSince >= 14);

  const filteredContractAlerts = useMemo(() => {
    if (!isRegionalLead) return contractAlerts;
    return contractAlerts.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by));
  }, [contractAlerts, matchesTeamFilter, isRegionalLead]);

  const contractsMissingMandateMail = filteredContractAlerts.filter((c: any) => !c.mandate_email_sent_at);
  const contractsMissingConfirmationMail = filteredContractAlerts.filter(
    (c: any) => c.mandate_email_sent_at && !c.confirmation_email_sent_at
  );
  const contractsWaitingPayment = filteredContractAlerts.filter((c: any) => isWaitingForMandate(c));

  const totalAlerts = overdueLeads14.length + overdueLeads7.length + contractsMissingMandateMail.length + contractsMissingConfirmationMail.length + contractsWaitingPayment.length;

  // "Seit gestern" — team-filter for regional leads
  const newLeads = useMemo(() => {
    const items = newSinceYesterday?.leads ?? [];
    return applyTeamFilter(items, "assigned_to");
  }, [newSinceYesterday, matchesTeamFilter, isRegionalLead]);

  const newContracts = useMemo(() => {
    const items = newSinceYesterday?.contracts ?? [];
    if (!isRegionalLead) return items;
    return items.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by));
  }, [newSinceYesterday, matchesTeamFilter, isRegionalLead]);

  const hasNewSinceYesterday = newLeads.length > 0 || newContracts.length > 0;

  const { data: hasOwnData } = useQuery({
    queryKey: ["dashboard-onboarding-check", role],
    enabled: !!role && role !== "admin",
    queryFn: async () => {
      if (role === "tippgeber") {
        const { count } = await supabase.from("tipp_leads").select("id", { count: "exact", head: true });
        return (count ?? 0) > 0;
      }
      const { count } = await supabase.from("contracts").select("id", { count: "exact", head: true });
      return (count ?? 0) > 0;
    },
  });

  const showOnboarding = !bannerDismissed && hasOwnData === false && !!role && role !== "admin";
  const onboarding = role ? onboardingConfig[role] : undefined;

  return (
    <MainLayout title="" subtitle="">
      {/* === ROLLENVORSCHAU-BANNER === */}
      {isPreviewActive && previewRole && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border-2 border-warning/60 bg-warning/10 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-sm">
              <Eye className="h-4 w-4" />
            </span>
            <p className="text-sm font-medium text-foreground">
              <span className="font-semibold text-warning">Rollenvorschau aktiv –</span>{" "}
              Du siehst das Dashboard als{" "}
              <span className="rounded-md bg-warning/25 px-1.5 py-0.5 font-semibold text-foreground">
                {getRoleLabel(previewRole)}
              </span>
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPreviewRole(null)}
            className="shrink-0 border-warning/50 text-warning hover:bg-warning/15 hover:text-warning"
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Vorschau beenden
          </Button>
        </div>
      )}

      {/* === HEADER === */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground mb-1">
            {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
          </p>
          <h1 className="text-2xl font-bold text-foreground">
            {getGreeting()}, {firstName} 👋
          </h1>
          {role && (
            <span className="inline-flex items-center mt-2 px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              {getRoleLabel(role)}
            </span>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAnleitungOpen(true)}
          className="gap-2 self-start sm:self-end"
        >
          <BookOpen className="h-4 w-4" />
          Anleitung
        </Button>
      </div>

      <AnleitungDialog open={anleitungOpen} onOpenChange={setAnleitungOpen} />

      {/* === ONBOARDING BANNER === */}
      {showOnboarding && onboarding && (
        <div className="mb-6 relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-5">
          <div className="absolute top-3 right-10 opacity-10">
            <Sparkles className="h-16 w-16 text-primary" />
          </div>
          <button
            onClick={() => setBannerDismissed(true)}
            className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-start gap-4 pr-8">
            <div className="shrink-0 rounded-lg bg-primary/10 border border-primary/20 p-2.5">
              <onboarding.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-foreground text-sm mb-1">{onboarding.title}</p>
              <p className="text-sm text-muted-foreground leading-relaxed mb-3">{onboarding.text}</p>
              <Link
                to={onboarding.to}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
              >
                {onboarding.cta}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STANDARD ROLLEN: 4-Block Layout
            1. Heute wichtig
            2. Seit gestern reingekommen (nur wenn neu)
            3. Pipeline Schnellzugriff (kompakte Anker)
         ══════════════════════════════════════════════ */}
      {canSeePipeline && (
        <div className="space-y-6">

          {/* ── BLOCK 1: 🔥 Heute wichtig ── */}
          <div className="card-elevated">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Flame className="h-4 w-4 text-destructive" />
                <h3 className="font-semibold text-foreground">Heute wichtig</h3>
                {totalAlerts > 0 && (
                  <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold bg-destructive text-destructive-foreground">
                    {totalAlerts}
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-border">
              {totalAlerts === 0 ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                  <span className="text-green-600">✓</span> Alles erledigt – keine offenen Handlungsbedarfe
                </div>
              ) : (
                <>
                  {overdueLeads14.length > 0 && (
                    <AlertRow
                      icon={AlertTriangle}
                      iconClass="text-destructive"
                      bgClass="bg-destructive/5"
                      label={`${overdueLeads14.length} Lead${overdueLeads14.length > 1 ? "s" : ""} ohne Kontakt > 14 Tage`}
                      sub="Dringend – diese Leads drohen verloren zu gehen"
                      to="/pipeline?tab=interessenten&filter=overdue14"
                    />
                  )}
                  {overdueLeads7.length > 0 && (
                    <AlertRow
                      icon={Clock}
                      iconClass="text-amber-600"
                      bgClass="bg-amber-500/5"
                      label={`${overdueLeads7.length} Lead${overdueLeads7.length > 1 ? "s" : ""} ohne Kontakt > 7 Tage`}
                      sub="Bitte zeitnah kontaktieren"
                      to="/pipeline?tab=interessenten&filter=overdue7"
                    />
                  )}
                  {contractsMissingMandateMail.length > 0 && (
                    <AlertRow
                      icon={FileText}
                      iconClass="text-blue-600"
                      bgClass="bg-blue-500/5"
                      label={`${contractsMissingMandateMail.length} Vertrag/Verträge ohne SEPA-Mandat-Versand`}
                      sub="SEPA-Mandat-Mail mit Stripe-Link noch nicht versendet"
                      to="/pipeline?tab=abschlussphase&filter=missing_email"
                    />
                  )}
                  {contractsMissingConfirmationMail.length > 0 && (
                    <AlertRow
                      icon={FileText}
                      iconClass="text-blue-600"
                      bgClass="bg-blue-500/5"
                      label={`${contractsMissingConfirmationMail.length} Vertrag/Verträge ohne Vertragsunterlagen-Versand`}
                      sub="Vertragsunterlagen mit AGB noch nicht versendet"
                      to="/pipeline?tab=abschlussphase&filter=missing_confirmation"
                    />
                  )}
                  {contractsWaitingPayment.length > 0 && (
                    <AlertRow
                      icon={Clock}
                      iconClass="text-purple-600"
                      bgClass="bg-purple-500/5"
                      label={`${contractsWaitingPayment.length} Vertrag/Verträge warten auf Mandat-Erteilung`}
                      sub="SEPA-Mandat-Mail versendet, Kunde hat Bankverbindung noch nicht hinterlegt"
                      to="/pipeline?tab=abschlussphase&filter=waiting_payment"
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── BLOCK 2: 🆕 Seit gestern reingekommen ── */}
          {hasNewSinceYesterday && (
            <div className="card-elevated">
              <div className="flex items-center justify-between p-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-foreground">Seit gestern reingekommen</h3>
                </div>
              </div>
              <div className="divide-y divide-border">
                {newLeads.length > 0 && (
                  <NewItemsRow
                    icon={Users}
                    iconClass="text-purple-600"
                    countLabel={`${newLeads.length} neue${newLeads.length === 1 ? "r" : ""} Lead${newLeads.length === 1 ? "" : "s"} (24h)`}
                    items={newLeads.map((l: any) => ({
                      id: l.id,
                      label: l.praxis_name || `${l.vorname ?? ""} ${l.nachname ?? ""}`.trim() || "—",
                      to: `/pipeline?tab=interessenten&lead=${l.id}`,
                    }))}
                  />
                )}
                {newContracts.length > 0 && (
                  <NewItemsRow
                    icon={FileText}
                    iconClass="text-blue-600"
                    countLabel={`${newContracts.length} neue${newContracts.length === 1 ? "r" : ""} Vertrag/Verträge (24h)`}
                    items={newContracts.map((c: any) => ({
                      id: c.id,
                      label: c.praxis || c.customer_name || "—",
                      to: `/vertrieb/vertraege?contractId=${c.id}`,
                    }))}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── BLOCK 3: ⚡ Pipeline Schnellzugriff (kompakte Anker, ohne Zahlen) ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Pipeline Schnellzugriff</h3>
            </div>
            <div className="grid grid-cols-3 gap-3 max-w-2xl">
              <PipelineAnchor
                label="Interessenten"
                icon={Users}
                iconClass="bg-purple-500/10 text-purple-600"
                to="/pipeline?tab=interessenten"
              />
              <PipelineAnchor
                label="Abschlussphase"
                icon={FileText}
                iconClass="bg-blue-500/10 text-blue-600"
                to="/pipeline?tab=abschlussphase"
              />
              <PipelineAnchor
                label="Kunden"
                icon={Building2}
                iconClass="bg-green-500/10 text-green-600"
                to="/pipeline?tab=kunden"
              />
            </div>
          </div>

        </div>
      )}
    </MainLayout>
  );
}

// ── Alert Row Component ──
interface AlertRowProps {
  icon: React.ElementType;
  iconClass: string;
  bgClass: string;
  label: string;
  sub: string;
  to: string;
}

function AlertRow({ icon: Icon, iconClass, bgClass, label, sub, to }: AlertRowProps) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 p-4 ${bgClass} hover:bg-muted/50 transition-colors group`}
    >
      <div className="shrink-0 rounded-lg p-2 bg-background border border-border">
        <Icon className={`h-4 w-4 ${iconClass}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </Link>
  );
}

// ── New Items Row (Seit gestern) ──
interface NewItemsRowProps {
  icon: React.ElementType;
  iconClass: string;
  countLabel: string;
  items: { id: string; label: string; to: string }[];
}

function NewItemsRow({ icon: Icon, iconClass, countLabel, items }: NewItemsRowProps) {
  const visible = items.slice(0, 3);
  const rest = items.length - visible.length;
  return (
    <div className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors">
      <div className="shrink-0 rounded-lg p-2 bg-background border border-border">
        <Icon className={`h-4 w-4 ${iconClass}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{countLabel}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {visible.map((it, i) => (
            <span key={it.id} className="inline-flex items-center">
              <Link to={it.to} className="hover:text-primary hover:underline truncate max-w-[16rem]">
                {it.label}
              </Link>
              {i < visible.length - 1 && <span className="ml-2">·</span>}
            </span>
          ))}
          {rest > 0 && <span className="text-muted-foreground/70">und {rest} weitere</span>}
        </div>
      </div>
    </div>
  );
}

// ── Pipeline Anchor (kompakt, ohne Zahl) ──
interface PipelineAnchorProps {
  label: string;
  icon: React.ElementType;
  iconClass: string;
  to: string;
}

function PipelineAnchor({ label, icon: Icon, iconClass, to }: PipelineAnchorProps) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 transition-all hover:shadow-sm hover:border-primary/30"
    >
      <div className={`shrink-0 rounded-md p-1.5 ${iconClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium text-foreground truncate">{label}</span>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  );
}
