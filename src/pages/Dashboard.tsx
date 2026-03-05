import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Building2, FlaskConical, TrendingUp, FileText,
  ArrowRight, Clock, Users,
  PlusCircle, Eye, FileSignature, Lightbulb, MapPin, BarChart3, BookMarked
} from "lucide-react";
import type { AppRole } from "@/hooks/useUserRole";

import { format } from "date-fns";
import { de } from "date-fns/locale";

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

export default function Dashboard() {
  const { profile } = useAuth();
  const { role, isAdmin, isVertragsabteilung, isSalesPartner, isSalesLead, isRegionalLead } = useUserRole();

  const firstName = profile?.full_name?.split(" ")[0] ?? "Willkommen";

  // Live KPIs from DB
  const { data: kpis } = useQuery({
    queryKey: ["dashboard-kpis"],
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
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, praxis_name, vorname, nachname, status, created_at, abrechnungszentrum")
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

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
          {getQuickLinks(role).map((ql) => (
            <Link
              key={ql.to}
              to={ql.to}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${ql.primary ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-secondary text-secondary-foreground hover:bg-secondary/80"}`}
            >
              <ql.icon className="h-4 w-4" />
              {ql.label}
            </Link>
          ))}
        </div>
      </div>

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
        {(isAdmin || isVertragsabteilung) ? (
          <KpiCard
            title="Verträge zur Freigabe"
            value={kpis?.pendingContracts ?? "–"}
            icon={FileSignature}
            iconClass={kpis?.pendingContracts ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}
            link="/vertrieb/vertraege"
            highlight={!!kpis?.pendingContracts}
          />
        ) : (
          <KpiCard
            title="Monatsumsatz"
            value={kpis?.monthRevenue != null ? kpis.monthRevenue.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "–"}
            icon={TrendingUp}
            iconClass="bg-green-500/10 text-green-600"
            link="/umsaetze"
          />
        )}
      </div>

      {/* === MAIN CONTENT GRID === */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

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
              <div key={c.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">{c.customer_name}</span>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge(c.status)}`}>
                      {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{c.product_name}</p>
                </div>
                <div className="text-right text-xs text-muted-foreground ml-2 shrink-0">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(c.created_at), "dd.MM.yy")}
                  </div>
                  {c.monthly_price > 0 && (
                    <div className="font-medium text-foreground mt-0.5">
                      {c.monthly_price.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}/Mo.
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

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
              <div key={l.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground text-sm truncate">{l.praxis_name}</span>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusBadge(l.status)}`}>
                      {l.status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {l.vorname} {l.nachname} · {l.abrechnungszentrum}
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground ml-2 shrink-0 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(l.created_at), "dd.MM.yy")}
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
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
