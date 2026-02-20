import { MainLayout } from "@/components/layout/MainLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { RecentTickets } from "@/components/dashboard/RecentTickets";
import { RecentPraxen } from "@/components/dashboard/RecentPraxen";
import { Building2, Ticket, FlaskConical, TrendingUp } from "lucide-react";

export default function Dashboard() {
  return (
    <MainLayout title="Dashboard" subtitle="Übersicht aller wichtigen Kennzahlen">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <StatCard
          title="Aktive Kunden"
          value={247}
          change="+12 diesen Monat"
          changeType="positive"
          icon={Building2}
          iconColor="bg-primary/10 text-primary"
        />
        <StatCard
          title="Demo-Phase"
          value={34}
          change="8 laufen diese Woche aus"
          changeType="neutral"
          icon={FlaskConical}
          iconColor="bg-amber-500/10 text-amber-600"
        />
        <StatCard
          title="Offene Tickets"
          value={18}
          change="5 dringend"
          changeType="negative"
          icon={Ticket}
          iconColor="bg-warning/10 text-warning"
        />
        <StatCard
          title="Monatsumsatz"
          value="42.850 €"
          change="+15,3% vs. Vormonat"
          changeType="positive"
          icon={TrendingUp}
          iconColor="bg-success/10 text-success"
        />
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecentTickets />
        <RecentPraxen />
      </div>
    </MainLayout>
  );
}
