import React, { useMemo, useState } from "react";
import {
  Users, TrendingUp, TrendingDown, Target, Clock, Globe, PenLine,
  ChevronDown, ChevronUp, BarChart3,
} from "lucide-react";
import { differenceInDays } from "date-fns";
interface KpiCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  accent?: "primary" | "success" | "warning" | "destructive" | "muted";
}

const KpiCard = React.forwardRef<HTMLDivElement, KpiCardProps>(({ label, value, sub, icon, accent = "primary" }, ref) => {
  const accentCls: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    destructive: "bg-destructive/10 text-destructive",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <div ref={ref} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-card min-w-[180px]">
      <div className={`flex items-center justify-center h-9 w-9 rounded-lg shrink-0 ${accentCls[accent]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground leading-tight truncate">{label}</p>
        <p className="text-lg font-bold text-foreground leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
});
KpiCard.displayName = "KpiCard";

function FunnelBar({ stages }: { stages: { label: string; count: number; pct: number; cls: string }[] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  return (
    <div className="flex flex-col gap-1.5">
      {stages.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground w-24 text-right truncate">{s.label}</span>
          <div className="flex-1 h-4 bg-muted/50 rounded-sm overflow-hidden relative">
            <div
              className={`h-full rounded-sm transition-all ${s.cls}`}
              style={{ width: `${Math.max((s.count / maxCount) * 100, 2)}%` }}
            />
          </div>
          <span className="text-[10px] font-semibold text-foreground w-8 text-right">{s.count}</span>
          {s.pct > 0 && s.pct < 100 && (
            <span className="text-[9px] text-muted-foreground/60 w-10 text-right">{s.pct}%</span>
          )}
        </div>
      ))}
    </div>
  );
}

function SourceRow({ source, leads, conversions, rate }: { source: string; leads: number; conversions: number; rate: string }) {
  return (
    <div className="flex items-center justify-between text-xs py-1.5 border-b border-border/50 last:border-0">
      <span className="font-medium text-foreground flex items-center gap-1.5">
        {source === "Homepage" ? <Globe className="h-3 w-3 text-primary" /> : <PenLine className="h-3 w-3 text-muted-foreground" />}
        {source}
      </span>
      <div className="flex items-center gap-4">
        <span className="text-muted-foreground">{leads} Leads</span>
        <span className="text-success font-medium">{conversions} Kunden</span>
        <span className="text-foreground font-semibold w-12 text-right">{rate}</span>
      </div>
    </div>
  );
}

interface PipelineKpiBarProps {
  /** All leads visible to user (RLS + team filter applied) */
  allLeads: any[];
  /** All contracts visible to user (RLS + team filter applied) — ALL statuses */
  allContracts: any[];
  /** Leads with status "kunde" — needed for conversion calculation */
  kundeLeads: any[];
}

export function PipelineKpiBar({ allLeads, allContracts, kundeLeads }: PipelineKpiBarProps) {
  const [expanded, setExpanded] = useState(false);

  const kpis = useMemo(() => {
    const ACTIVE_STATUSES = ["neu", "kontaktiert", "qualifiziert", "vertrag"];
    const CLOSED_LOST = ["kein_abschluss", "abgelehnt"];

    // All leads including kunde for total funnel
    const totalLeads = allLeads.length + kundeLeads.length;
    const activeLeads = allLeads.filter((l: any) => ACTIVE_STATUSES.includes(l.status)).length;
    const lostLeads = allLeads.filter((l: any) => CLOSED_LOST.includes(l.status)).length;
    const kundenCount = kundeLeads.length;

    // Conversion rate: leads that became kunden / total leads
    const conversionRate = totalLeads > 0 ? ((kundenCount / totalLeads) * 100) : 0;

    // Funnel stages
    const neu = allLeads.filter((l: any) => l.status === "neu").length;
    const kontaktiert = allLeads.filter((l: any) => l.status === "kontaktiert").length;
    const qualifiziert = allLeads.filter((l: any) => l.status === "qualifiziert").length;
    const vertrag = allLeads.filter((l: any) => l.status === "vertrag").length;
    const abschlussContracts = allContracts.filter((c: any) => ["entwurf", "eingegangen", "gezeichnet"].includes(c.status)).length;
    const aktivContracts = allContracts.filter((c: any) => c.status === "aktiv").length;

    // Source analysis (3 buckets: homepage, manuell, reservierung)
    const getSource = (l: any): "homepage" | "manuell" | "reservierung" => {
      if (l.source === "reservation_conversion") return "reservierung";
      if (l.source === "manual") return "manuell";
      if (l.source === "homepage") return "homepage";
      // Legacy fallback for older rows without explicit source
      if (l.nachricht && l.nachricht.trim().length > 0) return "homepage";
      return "manuell";
    };
    const allLeadsWithKunde = [...allLeads, ...kundeLeads];
    const homepageLeads = allLeadsWithKunde.filter((l) => getSource(l) === "homepage").length;
    const manuellLeads = allLeadsWithKunde.filter((l) => getSource(l) === "manuell").length;
    const reservierungLeads = allLeadsWithKunde.filter((l) => getSource(l) === "reservierung").length;
    const homepageKunden = kundeLeads.filter((l) => getSource(l) === "homepage").length;
    const manuellKunden = kundeLeads.filter((l) => getSource(l) === "manuell").length;
    const reservierungKunden = kundeLeads.filter((l) => getSource(l) === "reservierung").length;
    const homepageRate = homepageLeads > 0 ? ((homepageKunden / homepageLeads) * 100) : 0;
    const manuellRate = manuellLeads > 0 ? ((manuellKunden / manuellLeads) * 100) : 0;
    const reservierungRate = reservierungLeads > 0 ? ((reservierungKunden / reservierungLeads) * 100) : 0;

    // Time metrics: avg days from lead creation to first contract creation
    // We approximate using leads that have status "kunde" and find matching contracts
    const leadToContractDays: number[] = [];
    const contractToActiveDays: number[] = [];

    for (const contract of allContracts) {
      if (contract.status === "aktiv" && contract.start_date && contract.created_at) {
        const created = new Date(contract.created_at);
        const started = new Date(contract.start_date);
        const diff = differenceInDays(started, created);
        if (diff >= 0 && diff < 365) contractToActiveDays.push(diff);
      }
    }

    // For lead→contract: match kunde-leads to contracts by hfx_customer_number
    const contractCreationMap = new Map<string, Date>();
    for (const c of allContracts) {
      if (c.hfx_customer_number) {
        const existing = contractCreationMap.get(c.hfx_customer_number);
        const created = new Date(c.created_at);
        if (!existing || created < existing) {
          contractCreationMap.set(c.hfx_customer_number, created);
        }
      }
    }
    for (const lead of kundeLeads) {
      if (lead.hfx_customer_number && contractCreationMap.has(lead.hfx_customer_number)) {
        const leadDate = new Date(lead.created_at);
        const contractDate = contractCreationMap.get(lead.hfx_customer_number)!;
        const diff = differenceInDays(contractDate, leadDate);
        if (diff >= 0 && diff < 365) leadToContractDays.push(diff);
      }
    }

    const avgLeadToContract = leadToContractDays.length > 0
      ? Math.round(leadToContractDays.reduce((a, b) => a + b, 0) / leadToContractDays.length)
      : null;
    const avgContractToActive = contractToActiveDays.length > 0
      ? Math.round(contractToActiveDays.reduce((a, b) => a + b, 0) / contractToActiveDays.length)
      : null;

    return {
      activeLeads, kundenCount, conversionRate, lostLeads, totalLeads,
      funnel: { neu, kontaktiert, qualifiziert, vertrag, abschlussContracts, aktivContracts },
      sources: { homepageLeads, manuellLeads, homepageKunden, manuellKunden, homepageRate, manuellRate },
      time: { avgLeadToContract, avgContractToActive },
    };
  }, [allLeads, allContracts, kundeLeads]);

  return (
    <div className="border-b border-border">
      {/* Compact KPI row — always visible */}
      <div className="px-4 py-3 flex items-center gap-3 flex-wrap bg-card/50">
        <KpiCard
          label="Aktive Leads"
          value={kpis.activeLeads}
          sub={`von ${kpis.totalLeads} gesamt`}
          icon={<Users className="h-4 w-4" />}
          accent="primary"
        />
        <KpiCard
          label="Kunden"
          value={kpis.kundenCount}
          icon={<Target className="h-4 w-4" />}
          accent="success"
        />
        <KpiCard
          label="Conversion"
          value={`${kpis.conversionRate.toFixed(1)}%`}
          sub="Lead → Kunde"
          icon={<TrendingUp className="h-4 w-4" />}
          accent={kpis.conversionRate >= 20 ? "success" : kpis.conversionRate >= 10 ? "warning" : "destructive"}
        />
        <KpiCard
          label="Verloren"
          value={kpis.lostLeads}
          sub={kpis.totalLeads > 0 ? `${((kpis.lostLeads / kpis.totalLeads) * 100).toFixed(0)}% der Leads` : ""}
          icon={<TrendingDown className="h-4 w-4" />}
          accent={kpis.lostLeads > 0 ? "destructive" : "muted"}
        />
        {kpis.time.avgLeadToContract !== null && (
          <KpiCard
            label="⌀ Lead → Vertrag"
            value={`${kpis.time.avgLeadToContract} T.`}
            icon={<Clock className="h-4 w-4" />}
            accent="muted"
          />
        )}
        {kpis.time.avgContractToActive !== null && (
          <KpiCard
            label="⌀ Vertrag → Aktiv"
            value={`${kpis.time.avgContractToActive} T.`}
            icon={<Clock className="h-4 w-4" />}
            accent="muted"
          />
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <BarChart3 className="h-3.5 w-3.5" />
          {expanded ? "Weniger" : "Details"}
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      {/* Expanded detail section */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 grid grid-cols-1 md:grid-cols-2 gap-6 bg-muted/10 border-t border-border/50">
          {/* Funnel */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
              Funnel-Übersicht
            </h4>
            <FunnelBar stages={[
              { label: "Neu", count: kpis.funnel.neu, pct: kpis.totalLeads > 0 ? Math.round((kpis.funnel.neu / kpis.totalLeads) * 100) : 0, cls: "bg-primary/60" },
              { label: "Kontaktiert", count: kpis.funnel.kontaktiert, pct: kpis.totalLeads > 0 ? Math.round((kpis.funnel.kontaktiert / kpis.totalLeads) * 100) : 0, cls: "bg-primary/70" },
              { label: "Qualifiziert", count: kpis.funnel.qualifiziert, pct: kpis.totalLeads > 0 ? Math.round((kpis.funnel.qualifiziert / kpis.totalLeads) * 100) : 0, cls: "bg-warning/70" },
              { label: "Vertrag läuft", count: kpis.funnel.vertrag, pct: kpis.totalLeads > 0 ? Math.round((kpis.funnel.vertrag / kpis.totalLeads) * 100) : 0, cls: "bg-blue-500/70" },
              { label: "Abschlussphase", count: kpis.funnel.abschlussContracts, pct: kpis.totalLeads > 0 ? Math.round((kpis.funnel.abschlussContracts / kpis.totalLeads) * 100) : 0, cls: "bg-blue-600/70" },
              { label: "Kunden", count: kpis.funnel.aktivContracts, pct: kpis.totalLeads > 0 ? Math.round((kpis.funnel.aktivContracts / kpis.totalLeads) * 100) : 0, cls: "bg-success/70" },
            ]} />
          </div>

          {/* Sources */}
          <div>
            <h4 className="text-xs font-semibold text-foreground mb-3 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5 text-primary" />
              Quellen-Analyse
            </h4>
            <div className="rounded-lg border border-border bg-card p-3">
              <SourceRow
                source="Homepage"
                leads={kpis.sources.homepageLeads}
                conversions={kpis.sources.homepageKunden}
                rate={`${kpis.sources.homepageRate.toFixed(0)}%`}
              />
              <SourceRow
                source="Manuell"
                leads={kpis.sources.manuellLeads}
                conversions={kpis.sources.manuellKunden}
                rate={`${kpis.sources.manuellRate.toFixed(0)}%`}
              />
            </div>
            {kpis.time.avgLeadToContract !== null && (
              <div className="mt-3 rounded-lg border border-border bg-card p-3">
                <p className="text-[11px] font-medium text-muted-foreground mb-1">Durchlaufzeiten</p>
                <div className="flex items-center gap-6">
                  {kpis.time.avgLeadToContract !== null && (
                    <div>
                      <p className="text-sm font-bold text-foreground">{kpis.time.avgLeadToContract} Tage</p>
                      <p className="text-[10px] text-muted-foreground">Lead → Vertrag</p>
                    </div>
                  )}
                  {kpis.time.avgContractToActive !== null && (
                    <div>
                      <p className="text-sm font-bold text-foreground">{kpis.time.avgContractToActive} Tage</p>
                      <p className="text-[10px] text-muted-foreground">Vertrag → Aktivierung</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
