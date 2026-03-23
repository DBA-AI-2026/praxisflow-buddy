import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  Building2, FlaskConical, TrendingUp, FileText,
  ArrowRight, Clock, Users,
  PlusCircle, Eye, FileSignature, Lightbulb, MapPin, BarChart3, BookMarked,
  X, Sparkles, Activity, FileCheck, UserPlus, MessageSquare, CheckCircle2, XCircle,
} from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";
import { format, formatDistanceToNow, subHours } from "date-fns";
import { de } from "date-fns/locale";
import { CreateLeadDialog } from "@/components/leads/CreateLeadDialog";
import { Button } from "@/components/ui/button";
import { useRolePreview } from "@/contexts/RolePreviewContext";

interface ActivityItem {
  id: string;
  type: "contract" | "lead" | "tipp";
  label: string;
  sub: string;
  status: string;
  time: string;
  link: string;
}

interface QuickLink {
  to: string;
  label: string;
  icon: React.ElementType;
  primary?: boolean;
}

function getQuickLinks(role: AppRole | null): QuickLink[] {
  switch (role) {
    case "tippgeber":
      return [
        { to: "/tipp-leads", label: "Tipp-Lead einreichen", icon: Lightbulb, primary: true },
        { to: "/tipp-leads", label: "Meine Tipp-Leads", icon: Eye },
      ];
    case "user":
      return [
        { to: "/interessenten", label: "Meine Leads", icon: Users, primary: true },
        { to: "/praxen", label: "Kunden", icon: Building2 },
        { to: "/reservierungen", label: "Reservierungen", icon: BookMarked },
      ];
    case "sales_partner":
      return [
        { to: "/vertrieb/vertraege", label: "Neuer Vertrag", icon: PlusCircle, primary: true },
        { to: "/interessenten", label: "Interessenten", icon: Users },
        { to: "/reservierungen", label: "Reservierungen", icon: BookMarked },
      ];
    case "regional_lead":
      return [
        { to: "/vertrieb/vertraege", label: "Neuer Vertrag", icon: PlusCircle, primary: true },
        { to: "/interessenten", label: "Interessenten", icon: Users },
        { to: "/vertrieb/provisionen", label: "Provisionen", icon: BarChart3 },
        { to: "/praxen", label: "Kunden", icon: Building2 },
      ];
    case "vertragsabteilung":
      return [
        { to: "/vertrieb/vertraege", label: "Verträge prüfen", icon: FileText, primary: true },
        { to: "/praxen", label: "Kunden", icon: Building2 },
        { to: "/umsaetze", label: "Umsätze", icon: TrendingUp },
      ];
    case "sales_lead":
      return [
        { to: "/vertrieb/vertraege", label: "Neuer Vertrag", icon: PlusCircle, primary: true },
        { to: "/interessenten", label: "Interessenten", icon: Users },
        { to: "/vertrieb/provisionen", label: "Provisionen", icon: BarChart3 },
        { to: "/admin/plz-mapping", label: "PLZ-Zuordnung", icon: MapPin },
      ];
    case "admin":
    default:
      return [
        { to: "/vertrieb/vertraege", label: "Neuer Vertrag", icon: PlusCircle, primary: true },
        { to: "/interessenten", label: "Interessenten", icon: Users },
        { to: "/praxen", label: "Kunden", icon: Eye },
      ];
  }
}

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
    text: "Reichen Sie jetzt Ihren ersten Empfehlungs-Lead ein. Wählen Sie Arzt, Praxis und gewünschte Dienstleistung – der Außendienst kümmert sich um den Rest.",
    cta: "Ersten Tipp-Lead einreichen",
    to: "/tipp-leads",
  },
  user: {
    icon: Users,
    title: "Willkommen als Gebietsleiter!",
    text: "Ihr Gebiet ist bereit. Erfassen Sie Interessenten oder schauen Sie sich Ihre zugeordneten Kunden an.",
    cta: "Interessenten anzeigen",
    to: "/interessenten",
  },
  sales_partner: {
    icon: FileText,
    title: "Willkommen als Vertriebspartner!",
    text: "Legen Sie jetzt Ihren ersten Vertrag an oder erfassen Sie neue Interessenten in Ihrem Vertriebsgebiet.",
    cta: "Ersten Vertrag erstellen",
    to: "/vertrieb/vertraege",
  },
  regional_lead: {
    icon: BarChart3,
    title: "Willkommen als Regionalleiter!",
    text: "Verwalten Sie Ihr Team, bearbeiten Sie Interessenten und behalten Sie die Provisionen im Blick.",
    cta: "Vertragsübersicht öffnen",
    to: "/vertrieb/vertraege",
  },
  vertragsabteilung: {
    icon: FileSignature,
    title: "Willkommen in der Vertragsabteilung!",
    text: "Prüfen und genehmigen Sie eingereichte Verträge. Alle gezeichneten Verträge warten auf Ihre Freigabe.",
    cta: "Verträge prüfen",
    to: "/vertrieb/vertraege",
  },
  sales_lead: {
    icon: MapPin,
    title: "Willkommen als Vertriebsleitung!",
    text: "Überblicken Sie alle Vertriebsaktivitäten. Richten Sie zunächst die PLZ-Zuordnung ein, damit Leads automatisch zugewiesen werden.",
    cta: "PLZ-Zuordnung einrichten",
    to: "/admin/plz-mapping",
  },
};

export default function Dashboard() {
  const { profile } = useAuth();
  const { role, isAdmin, isVertragsabteilung } = useUserRole();
  const { previewRole, isPreviewActive, setPreviewRole } = useRolePreview();
  const navigate = useNavigate();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [createLeadOpen, setCreateLeadOpen] = useState(false);

  const firstName = profile?.full_name?.split(" ")[0] ?? "Willkommen";

  // Live KPIs from DB
  const { data: kpis } = useQuery({
    queryKey: ["dashboard-kpis"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const [praxen, demos, tickets, contracts, revenues] = await Promise.all([
        supabase.from("praxen").select("id", { count: "exact", head: true }).eq("status", "aktiv"),
        supabase.from("demo_downloads").select("id", { count: "exact", head: true }).eq("status", "aktiv"),
        supabase.from("leads").select("id", { count: "exact", head: true }).eq("status", "neu"),
        supabase.from("contracts").select("id", { count: "exact", head: true }).eq("status", "gezeichnet"),
        supabase.from("customer_revenues").select("gross_amount").eq("payment_status", "bezahlt"),
      ]);
      const monthRevenue = (revenues.data ?? []).reduce((s, r) => s + (r.gross_amount ?? 0), 0);
      return {
        activePraxen: praxen.count ?? 0,
        activeDemos: demos.count ?? 0,
        openLeads: tickets.count ?? 0,
        pendingContracts: contracts.count ?? 0,
        monthRevenue,
      };
    },
  });

  // Recent contracts
  const { data: recentContracts = [] } = useQuery({
    queryKey: ["dashboard-recent-contracts"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, customer_name, product_name, status, created_at, monthly_price, hfx_customer_number")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  // Recent leads
  const { data: recentLeads = [] } = useQuery({
    queryKey: ["dashboard-recent-leads"],
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, praxis_name, vorname, nachname, status, created_at, abrechnungszentrum, qodia_synced")
        .not("status", "eq", "kunde")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  // Onboarding check: does this user already have relevant data?
  const { data: hasOwnData } = useQuery({
    queryKey: ["dashboard-onboarding-check", role],
    enabled: !!role && role !== "admin",
    queryFn: async () => {
      if (role === "tippgeber") {
        const { count } = await supabase
          .from("tipp_leads")
          .select("id", { count: "exact", head: true });
        return (count ?? 0) > 0;
      }
      const { count } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true });
      return (count ?? 0) > 0;
    },
  });

  // Activity feed: last 48h changes, role-filtered
  const { data: activityFeed = [] } = useQuery({
    queryKey: ["dashboard-activity", role],
    enabled: !!role,
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const since = subHours(new Date(), 48).toISOString();
      const items: ActivityItem[] = [];

      if (role === "tippgeber") {
        const { data } = await supabase
          .from("tipp_leads")
          .select("id, praxis_name, arzt_name, status, created_at, updated_at")
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(10);
        (data ?? []).forEach((r) => items.push({
          id: r.id, type: "tipp", label: r.praxis_name, sub: r.arzt_name,
          status: r.status, time: r.updated_at, link: "/tipp-leads",
        }));
      } else {
        // Contracts
        const { data: contracts } = await supabase
          .from("contracts")
          .select("id, customer_name, product_name, status, created_at, updated_at")
          .gte("updated_at", since)
          .order("updated_at", { ascending: false })
          .limit(8);
        (contracts ?? []).forEach((r) => items.push({
          id: r.id, type: "contract", label: r.customer_name, sub: r.product_name,
          status: r.status, time: r.updated_at, link: `/praxen-journey?tab=vertraege&id=${r.id}`,
        }));

        // Leads always shown in else-branch (tippgeber is already handled above)
        if (true) {
          const { data: leads } = await supabase
            .from("leads")
            .select("id, praxis_name, vorname, nachname, status, created_at, updated_at")
            .not("status", "eq", "kunde")
            .gte("updated_at", since)
            .order("updated_at", { ascending: false })
            .limit(8);
          (leads ?? []).forEach((r) => items.push({
            id: r.id, type: "lead", label: r.praxis_name, sub: `${r.vorname} ${r.nachname}`.trim(),
            status: r.status, time: r.updated_at, link: `/praxen-journey?tab=leads&id=${r.id}`,
          }));
        }
      }

      // Sort combined by time desc, limit 12
      return items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()).slice(0, 12);
    },
  });

  const showOnboarding = !bannerDismissed && hasOwnData === false && !!role && role !== "admin";
  const onboarding = role ? onboardingConfig[role] : undefined;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      entwurf: "bg-muted text-muted-foreground",
      aktiv: "bg-green-500/10 text-green-700",
      gezeichnet: "bg-blue-500/10 text-blue-700",
      gekuendigt: "bg-orange-500/10 text-orange-700",
      beendet: "bg-destructive/10 text-destructive",
      neu: "bg-primary/10 text-primary",
      demo: "bg-amber-500/10 text-amber-700",
      interessent: "bg-purple-500/10 text-purple-700",
    };
    return map[status] ?? "bg-muted text-muted-foreground";
  };

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

      {/* === HEADER: Personalisierte Begrüßung === */}
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
        {/* Quick Actions – rollenspezifisch */}
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            onClick={() => setCreateLeadOpen(true)}
            className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" />
            Neuer Interessent
          </Button>
          {getQuickLinks(role).map((ql) => (
            <Link
              key={ql.to + ql.label}
              to={ql.to}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${ql.primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
            >
              <ql.icon className="h-4 w-4" />
              {ql.label}
            </Link>
          ))}
        </div>
      </div>

      {/* === ONBOARDING BANNER === */}
      {showOnboarding && onboarding && (
        <div className="mb-6 relative overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-5">
          {/* Decorative sparkle */}
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

      {/* === KPI CARDS === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          title="Aktive Kunden"
          value={kpis?.activePraxen ?? "–"}
          icon={Building2}
          iconClass="bg-primary/10 text-primary"
          link="/praxen"
        />
        <KpiCard
          title="Demo-Phase"
          value={kpis?.activeDemos ?? "–"}
          icon={FlaskConical}
          iconClass="bg-amber-500/10 text-amber-600"
          link="/demo-tracking"
        />
        <KpiCard
          title="Neue Interessenten"
          value={kpis?.openLeads ?? "–"}
          icon={Users}
          iconClass="bg-purple-500/10 text-purple-600"
          link="/interessenten"
        />
        <KpiCard
          title="Monatsumsatz"
          value={kpis?.monthRevenue != null ? kpis.monthRevenue.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "–"}
          icon={TrendingUp}
          iconClass="bg-green-500/10 text-green-600"
          link="/umsaetze"
        />
      </div>

      {/* === MAIN CONTENT GRID === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Letzte Interessenten */}
        <div className="card-elevated">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              <h3 className="font-semibold text-foreground">Letzte Interessenten</h3>
            </div>
            <Link to="/interessenten" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
              Alle <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentLeads.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Noch keine Interessenten vorhanden.</p>
            ) : recentLeads.map((l) => (
              <button
                key={l.id}
                onClick={() => navigate(`/praxen-journey?tab=leads&id=${l.id}`)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">{l.praxis_name}</span>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge(l.status)}`}>
                      {l.status}
                    </span>
                    {l.qodia_synced ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground/30 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {l.vorname} {l.nachname} · {l.abrechnungszentrum}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground ml-2 shrink-0 flex items-center gap-2">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(l.created_at), "dd.MM.yy")}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Letzte Verträge */}
        <div className="card-elevated">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="font-semibold text-foreground">Letzte Verträge</h3>
            </div>
            <Link to="/vertrieb/vertraege" className="text-sm text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
              Alle <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentContracts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Noch keine Verträge vorhanden.</p>
            ) : recentContracts.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/praxen-journey?tab=vertraege&id=${c.id}`)}
                className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left group"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">{c.customer_name}</span>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge(c.status)}`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {c.product_name}{c.hfx_customer_number ? ` · ${c.hfx_customer_number}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground ml-2 shrink-0 flex items-center gap-2">
                  <div>
                    <div className="flex items-center gap-1 justify-end">
                      <Clock className="h-3 w-3" />
                      {format(new Date(c.created_at), "dd.MM.yy")}
                    </div>
                    {c.monthly_price > 0 && (
                      <div className="font-medium text-foreground mt-0.5">
                        {c.monthly_price.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}/Mo.
                      </div>
                    )}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-primary transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* === AKTIVITÄTS-FEED === */}
      <div className="mt-6 card-elevated">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground">Letzte Aktivitäten</h3>
            <span className="text-xs text-muted-foreground">(48 Std.)</span>
          </div>
        </div>
        <div className="divide-y divide-border">
          {activityFeed.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">Keine Aktivitäten in den letzten 48 Stunden.</p>
          ) : activityFeed.map((item) => {
            const Icon = item.type === "contract" ? FileCheck : item.type === "lead" ? UserPlus : MessageSquare;
            const iconClass = item.type === "contract"
              ? "bg-primary/10 text-primary"
              : item.type === "lead"
              ? "bg-purple-500/10 text-purple-600"
              : "bg-amber-500/10 text-amber-600";
            const typeLabel = item.type === "contract" ? "Vertrag" : item.type === "lead" ? "Interessent" : "Tipp-Lead";
            return (
              <Link
                key={item.id + item.type}
                to={item.link}
                className="flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
              >
                <div className={`shrink-0 rounded-lg p-2 ${iconClass}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">{item.label}</span>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {typeLabel} · {item.sub}
                  </p>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground hidden sm:flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(item.time), { addSuffix: true, locale: de })}
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <CreateLeadDialog open={createLeadOpen} onOpenChange={setCreateLeadOpen} />
    </MainLayout>
  );
}

// ---- Kleine KPI-Karte ----
interface KpiCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  iconClass: string;
  link: string;
  highlight?: boolean;
}

function KpiCard({ title, value, icon: Icon, iconClass, link, highlight }: KpiCardProps) {
  return (
    <Link
      to={link}
      className={`stat-card group block transition-all hover:shadow-md ${highlight ? "ring-2 ring-destructive/30" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
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
