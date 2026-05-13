import { useState, useMemo } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useRegionalTeam } from "@/hooks/useRegionalTeam";
import { supabase } from "@/lib/supabaseClient";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Users, FileText, Building2, ArrowRight, Clock,
  PlusCircle, Eye, FileSignature, Lightbulb, MapPin, BarChart3, BookMarked,
  X, Sparkles, AlertTriangle, Flame, Zap, Target, Rocket, UserPlus,
  CalendarCheck, CalendarX, UserX, Tag, CheckCircle2, BookOpen,
} from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
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
  const { role, isAdmin, isTippgeber, isSalesPartner, isRegionalLead } = useUserRole();
  const { previewRole, isPreviewActive, setPreviewRole } = useRolePreview();
  const { matchesTeamFilter } = useRegionalTeam();
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [createLeadOpen, setCreateLeadOpen] = useState(false);
  const [anleitungOpen, setAnleitungOpen] = useState(false);

  const firstName = profile?.full_name?.split(" ")[0] ?? "Willkommen";
  const canCreateLead = role !== "tippgeber" && role !== "vertragsabteilung";
  const canSeePipeline = role !== "tippgeber";
  const canSeeReservations = role !== "tippgeber" && role !== "vertragsabteilung";

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
      if (isSalesPartner) q = q.eq("assigned_to", user?.id ?? "");
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
        .eq("status", "eingegangen");
      if (isSalesPartner) q = q.or(`sales_partner_id.eq.${user?.id},created_by.eq.${user?.id}`);
      const { data } = await q;
      return data ?? [];
    },
  });

  // ── BLOCK 2: Pipeline counts ──
  const { data: pipelineCounts } = useQuery({
    queryKey: ["dashboard-pipeline-counts", role, user?.id],
    enabled: canSeePipeline,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [leadsRes, contractsRes, customersRes] = await Promise.all([
        (() => {
          let q = supabase.from("leads").select("id, assigned_to").in("status", ["neu", "kontaktiert", "qualifiziert", "vertrag"]);
          if (isSalesPartner) q = q.eq("assigned_to", user?.id ?? "");
          return q;
        })(),
        (() => {
          let q = supabase.from("contracts").select("id, sales_partner_id, created_by").in("status", ["entwurf", "eingegangen", "gezeichnet"]);
          if (isSalesPartner) q = q.or(`sales_partner_id.eq.${user?.id},created_by.eq.${user?.id}`);
          return q;
        })(),
        (() => {
          let q = supabase.from("contracts").select("id, sales_partner_id, created_by").in("status", ["aktiv", "gekuendigt", "beendet"]);
          if (isSalesPartner) q = q.or(`sales_partner_id.eq.${user?.id},created_by.eq.${user?.id}`);
          return q;
        })(),
      ]);
      return {
        leadsRaw: leadsRes.data ?? [],
        contractsRaw: contractsRes.data ?? [],
        customersRaw: customersRes.data ?? [],
      };
    },
  });

  // ── BLOCK 3: Performance ──
  const { data: performance } = useQuery({
    queryKey: ["dashboard-performance", role, user?.id],
    enabled: canSeePipeline,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      let cq = supabase
        .from("contracts")
        .select("id, sales_partner_id, created_by")
        .eq("status", "aktiv")
        .gte("start_date", monthStart.split("T")[0]);
      if (isSalesPartner) cq = cq.or(`sales_partner_id.eq.${user?.id},created_by.eq.${user?.id}`);

      const [contractsRes, payoutsRes] = await Promise.all([
        cq,
        supabase
          .from("commission_payouts")
          .select("commission_amount")
          .eq("sales_partner_id", user?.id ?? ""),
      ]);

      const totalProvision = (payoutsRes.data ?? []).reduce((s: number, r: any) => s + Number(r.commission_amount ?? 0), 0);

      return {
        contractsThisMonthRaw: contractsRes.data ?? [],
        totalProvision,
      };
    },
  });

  // ── BLOCK 4: Reservierungen (RLS-gefiltert) ──
  const { data: reservationsRaw = [] } = useQuery({
    queryKey: ["dashboard-reservations", role, user?.id],
    enabled: canSeeReservations,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data } = await supabase
        .from("praxis_reservations")
        .select("id, status, reserved_until, assigned_ad_id, interested_products, converted_at, reserved_by");
      return data ?? [];
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

  // Mail 1 = SEPA-Mandat-Mail (mandate_email_sent_at)
  const contractsMissingMandateMail = filteredContractAlerts.filter(
    (c: any) => !c.mandate_email_sent_at
  );
  // Mail 2 = Vertragsbestätigung mit AGB (confirmation_email_sent_at) — erst nach SEPA-Mandat-Mail
  const contractsMissingConfirmationMail = filteredContractAlerts.filter(
    (c: any) => c.mandate_email_sent_at && !c.confirmation_email_sent_at
  );
  const contractsWaitingPayment = filteredContractAlerts.filter(
    (c: any) => c.confirmation_email_sent_at && !c.customer_confirmed_at
  );

  const totalAlerts = overdueLeads14.length + overdueLeads7.length + contractsMissingMandateMail.length + contractsMissingConfirmationMail.length + contractsWaitingPayment.length;

  // Filtered pipeline counts
  const leadsCount = useMemo(() => {
    if (!pipelineCounts) return 0;
    return applyTeamFilter(pipelineCounts.leadsRaw, "assigned_to").length;
  }, [pipelineCounts, matchesTeamFilter, isRegionalLead]);

  const contractsCount = useMemo(() => {
    if (!pipelineCounts) return 0;
    if (!isRegionalLead) return pipelineCounts.contractsRaw.length;
    return pipelineCounts.contractsRaw.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by)).length;
  }, [pipelineCounts, matchesTeamFilter, isRegionalLead]);

  const customersCount = useMemo(() => {
    if (!pipelineCounts) return 0;
    if (!isRegionalLead) return pipelineCounts.customersRaw.length;
    return pipelineCounts.customersRaw.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by)).length;
  }, [pipelineCounts, matchesTeamFilter, isRegionalLead]);

  // Filtered performance
  const closingsThisMonth = useMemo(() => {
    if (!performance) return 0;
    if (!isRegionalLead) return performance.contractsThisMonthRaw.length;
    return performance.contractsThisMonthRaw.filter((c: any) => matchesTeamFilter(c.sales_partner_id) || matchesTeamFilter(c.created_by)).length;
  }, [performance, matchesTeamFilter, isRegionalLead]);

  // Reservierungen-Kennzahlen (RLS sorgt schon für Sichtbarkeit; Regional Lead zusätzlich Team-Filter
  // auf reserved_by/assigned_ad_id, damit "andere Teams" definitiv ausgeblendet sind, falls RLS breiter
  // greifen sollte als das Team-Modell.)
  const reservationsScoped = useMemo(() => {
    if (!isRegionalLead) return reservationsRaw;
    return reservationsRaw.filter(
      (r: any) => matchesTeamFilter(r.reserved_by) || matchesTeamFilter(r.assigned_ad_id),
    );
  }, [reservationsRaw, matchesTeamFilter, isRegionalLead]);

  const reservationStats = useMemo(() => {
    const now = new Date();
    const in14d = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const back30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    let active = 0;
    let expiringSoon = 0;
    let expired = 0;
    let withoutAd = 0;
    let withoutProduct = 0;
    let convertedRecently = 0;

    for (const r of reservationsScoped as any[]) {
      const status = r.status ?? "reserviert";
      const until = r.reserved_until ? new Date(r.reserved_until) : null;
      const isExpiredByDate = until ? until < now : false;
      const isActive = status === "reserviert" && !isExpiredByDate;

      if (isActive) {
        active += 1;
        if (until && until <= in14d) expiringSoon += 1;
        if (!r.assigned_ad_id) withoutAd += 1;
        if (!Array.isArray(r.interested_products) || r.interested_products.length === 0) {
          withoutProduct += 1;
        }
      }

      if (status === "abgelaufen" || (status === "reserviert" && isExpiredByDate)) {
        expired += 1;
      }

      if (status === "konvertiert" && r.converted_at && new Date(r.converted_at) >= back30d) {
        convertedRecently += 1;
      }
    }

    return { active, expiringSoon, expired, withoutAd, withoutProduct, convertedRecently };
  }, [reservationsScoped]);

  const reservationActionItems = reservationStats.expired + reservationStats.expiringSoon + reservationStats.withoutAd;

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
          TIPPGEBER: Eigene simple Ansicht
         ══════════════════════════════════════════════ */}
      {isTippgeber && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <PipelineQuickCard
              label="Meine Tipp-Leads"
              icon={Lightbulb}
              iconClass="bg-amber-500/10 text-amber-600"
              to="/tipp-leads"
            />
            <PipelineQuickCard
              label="Meine Provisionen"
              icon={BarChart3}
              iconClass="bg-green-500/10 text-green-600"
              to="/vertrieb/provisionen"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button asChild className="gap-2">
              <Link to="/tipp-leads">
                <Lightbulb className="h-4 w-4" />
                Tipp-Lead einreichen
              </Link>
            </Button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════
          STANDARD ROLLEN: 4-Block Layout
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
                      accent="destructive"
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
                      accent="warning"
                    />
                  )}
                  {contractsMissingMandateMail.length > 0 && (
                    <AlertRow
                      icon={FileText}
                      iconClass="text-blue-600"
                      bgClass="bg-blue-500/5"
                      label={`${contractsMissingMandateMail.length} Vertrag/Verträge ohne SEPA-Mandat-Mail (Mail 1)`}
                      sub="Mail 1 (SEPA-Mandat-Mail mit Stripe-Link) noch nicht versendet"
                      to="/pipeline?tab=abschlussphase&filter=missing_email"
                      accent="primary"
                    />
                  )}
                  {contractsMissingConfirmationMail.length > 0 && (
                    <AlertRow
                      icon={FileText}
                      iconClass="text-blue-600"
                      bgClass="bg-blue-500/5"
                      label={`${contractsMissingConfirmationMail.length} Vertrag/Verträge ohne Vertragsbestätigung (Mail 2)`}
                      sub="Mail 2 (Vertragsdokumente + AGB) noch nicht versendet"
                      to="/pipeline?tab=abschlussphase&filter=missing_confirmation"
                      accent="primary"
                    />
                  )}
                  {contractsWaitingPayment.length > 0 && (
                    <AlertRow
                      icon={Clock}
                      iconClass="text-purple-600"
                      bgClass="bg-purple-500/5"
                      label={`${contractsWaitingPayment.length} Vertrag/Verträge warten auf Zahlung`}
                      sub="SEPA-Mandat-Mail versendet, Kundenbestätigung (Zahlung) ausstehend"
                      to="/pipeline?tab=abschlussphase&filter=waiting_payment"
                      accent="primary"
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* ── BLOCK 2: ⚡ Pipeline Schnellzugriff ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Pipeline Schnellzugriff</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <PipelineQuickCard
                label="Interessenten"
                count={leadsCount}
                icon={Users}
                iconClass="bg-purple-500/10 text-purple-600"
                to="/pipeline?tab=interessenten"
              />
              <PipelineQuickCard
                label="Abschlussphase"
                count={contractsCount}
                icon={FileText}
                iconClass="bg-blue-500/10 text-blue-600"
                to="/pipeline?tab=abschlussphase"
              />
              <PipelineQuickCard
                label="Kunden"
                count={customersCount}
                icon={Building2}
                iconClass="bg-green-500/10 text-green-600"
                to="/pipeline?tab=kunden"
              />
            </div>
          </div>

          {/* ── BLOCK 2b: 📅 Reservierungen ── */}
          {canSeeReservations && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookMarked className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-foreground text-sm">Reservierungen</h3>
                  {reservationActionItems > 0 && (
                    <span className="inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                      {reservationActionItems}
                    </span>
                  )}
                </div>
                <Link
                  to="/reservierungen"
                  className="text-xs font-medium text-primary hover:text-primary/80 inline-flex items-center gap-1"
                >
                  Alle anzeigen <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <ReservationStatCard
                  label="Aktiv"
                  count={reservationStats.active}
                  icon={CalendarCheck}
                  iconClass="bg-emerald-500/10 text-emerald-600"
                  to="/reservierungen?filter=active"
                />
                <ReservationStatCard
                  label="Läuft in 14 Tagen ab"
                  count={reservationStats.expiringSoon}
                  icon={Clock}
                  iconClass="bg-amber-500/10 text-amber-600"
                  highlight={reservationStats.expiringSoon > 0}
                  to="/reservierungen?filter=expiring"
                />
                <ReservationStatCard
                  label="Abgelaufen"
                  count={reservationStats.expired}
                  icon={CalendarX}
                  iconClass="bg-destructive/10 text-destructive"
                  highlight={reservationStats.expired > 0}
                  to="/reservierungen?filter=expired"
                />
                <ReservationStatCard
                  label="Ohne AD"
                  count={reservationStats.withoutAd}
                  icon={UserX}
                  iconClass="bg-orange-500/10 text-orange-600"
                  highlight={reservationStats.withoutAd > 0}
                  to="/reservierungen?filter=without_ad"
                />
                <ReservationStatCard
                  label="Ohne Produkt"
                  count={reservationStats.withoutProduct}
                  icon={Tag}
                  iconClass="bg-purple-500/10 text-purple-600"
                  to="/reservierungen?filter=without_product"
                />
                <ReservationStatCard
                  label="Konvertiert (30 T.)"
                  count={reservationStats.convertedRecently}
                  icon={CheckCircle2}
                  iconClass="bg-green-500/10 text-green-600"
                  to="/reservierungen?filter=converted_recently"
                />
              </div>
            </div>
          )}

          {/* ── BLOCK 3: 🎯 Meine Performance ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Meine Performance</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="stat-card">
                <p className="text-xs font-medium text-muted-foreground">Abschlüsse diesen Monat</p>
                <p className="mt-2 text-2xl font-bold text-foreground">{closingsThisMonth}</p>
                <p className="mt-1 text-xs text-muted-foreground">Verträge → aktiv</p>
              </div>
              {(role === "sales_partner" || role === "regional_lead" || role === "user") && (
                <Link to="/vertrieb/provisionen" className="stat-card group block hover:shadow-md transition-all">
                  <p className="text-xs font-medium text-muted-foreground">Gesamtprovision</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">
                    {performance?.totalProvision != null
                      ? performance.totalProvision.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
                      : "–"}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                    Details <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              )}
              {(role === "admin" || role === "sales_lead" || role === "vertragsabteilung") && (
                <div className="stat-card">
                  <p className="text-xs font-medium text-muted-foreground">Offene Alerts</p>
                  <p className="mt-2 text-2xl font-bold text-foreground">{totalAlerts}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Handlungsbedarfe gesamt</p>
                </div>
              )}
            </div>
          </div>

          {/* ── BLOCK 4: 🚀 Quick Actions ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Rocket className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground text-sm">Schnellaktionen</h3>
            </div>
            <div className="flex gap-3 flex-wrap">
              {canCreateLead && (
                <Button
                  size="sm"
                  onClick={() => setCreateLeadOpen(true)}
                  className="gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Neuer Interessent
                </Button>
              )}
              {(role !== "vertragsabteilung") && (
                <Button size="sm" variant="outline" asChild className="gap-2">
                  <Link to="/vertrieb/vertraege">
                    <PlusCircle className="h-4 w-4" />
                    Vertrag erstellen
                  </Link>
                </Button>
              )}
              {(role === "sales_partner" || role === "user" || role === "regional_lead") && (
                <Button size="sm" variant="outline" asChild className="gap-2">
                  <Link to="/reservierungen">
                    <BookMarked className="h-4 w-4" />
                    Reservierungen
                  </Link>
                </Button>
              )}
              <Button size="sm" variant="secondary" asChild className="gap-2 font-semibold">
                <Link to="/pipeline">
                  <ArrowRight className="h-4 w-4" />
                  Zur Pipeline
                </Link>
              </Button>
            </div>
          </div>

        </div>
      )}

      <CreateLeadDialog open={createLeadOpen} onOpenChange={setCreateLeadOpen} />
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
  accent: string;
}

function AlertRow({ icon: Icon, iconClass, bgClass, label, sub, to, accent }: AlertRowProps) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 p-4 ${bgClass} hover:bg-muted/50 transition-colors group`}
    >
      <div className={`shrink-0 rounded-lg p-2 bg-background border border-border`}>
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

// ── Pipeline Quick Card ──
interface PipelineQuickCardProps {
  label: string;
  count?: number;
  icon: React.ElementType;
  iconClass: string;
  to: string;
}

function PipelineQuickCard({ label, count, icon: Icon, iconClass, to }: PipelineQuickCardProps) {
  return (
    <Link
      to={to}
      className="stat-card group block transition-all hover:shadow-md"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          {count !== undefined && (
            <p className="mt-2 text-2xl font-bold text-foreground">{count}</p>
          )}
        </div>
        <div className={`rounded-lg p-2.5 ${iconClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
        Öffnen <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
  );
}

// ── Reservation Stat Card ──
interface ReservationStatCardProps {
  label: string;
  count: number;
  icon: React.ElementType;
  iconClass: string;
  highlight?: boolean;
  to?: string;
}

function ReservationStatCard({ label, count, icon: Icon, iconClass, highlight, to }: ReservationStatCardProps) {
  return (
    <Link
      to={to ?? "/reservierungen"}
      className={`group block rounded-lg border bg-card p-3 transition-all hover:shadow-md ${
        highlight ? "border-amber-500/40" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground leading-tight">{label}</p>
          <p className="mt-1.5 text-xl font-bold text-foreground">{count}</p>
        </div>
        <div className={`shrink-0 rounded-md p-1.5 ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Link>
  );
}
