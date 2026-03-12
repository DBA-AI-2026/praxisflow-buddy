import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Search, Users, FileText, Building2, CheckCircle2, XCircle, ArrowRight, RefreshCw, Clock } from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Status config ───────────────────────────────────────────────────────────
const leadStatusMap: Record<string, { label: string; cls: string }> = {
  neu:         { label: "Neu",         cls: "bg-primary/10 text-primary" },
  kontaktiert: { label: "Kontaktiert", cls: "bg-secondary text-secondary-foreground" },
  qualifiziert:{ label: "Qualifiziert",cls: "bg-amber-500/10 text-amber-700" },
  vertrag:     { label: "Vertrag",     cls: "bg-blue-500/10 text-blue-700" },
  abgelehnt:   { label: "Abgelehnt",  cls: "bg-destructive/10 text-destructive" },
};

const contractStatusMap: Record<string, { label: string; cls: string }> = {
  entwurf:    { label: "Entwurf",    cls: "bg-muted text-muted-foreground" },
  eingegangen:{ label: "Eingegangen",cls: "bg-amber-500/10 text-amber-700" },
  gezeichnet: { label: "Gezeichnet", cls: "bg-blue-500/10 text-blue-700" },
  aktiv:      { label: "Aktiv",      cls: "bg-green-500/10 text-green-700" },
  gekuendigt: { label: "Gekündigt",  cls: "bg-orange-500/10 text-orange-700" },
  beendet:    { label: "Beendet",    cls: "bg-destructive/10 text-destructive" },
};

// ─── Shared sub-components ───────────────────────────────────────────────────
function QodiaIcon({ synced }: { synced: boolean }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {synced ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          )}
        </TooltipTrigger>
        <TooltipContent>
          {synced ? "Bei Qodia registriert" : "Noch nicht bei Qodia registriert"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function StatusBadge({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ─── Leads Tab ───────────────────────────────────────────────────────────────
function LeadsTab({ search }: { search: string }) {
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["journey-leads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, praxis_name, vorname, nachname, email, plz, status, qodia_synced, hfx_customer_number, created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const filtered = leads.filter((l: any) => {
    const s = search.toLowerCase();
    return !s || l.praxis_name?.toLowerCase().includes(s) || l.vorname?.toLowerCase().includes(s)
      || l.nachname?.toLowerCase().includes(s) || l.email?.toLowerCase().includes(s)
      || l.hfx_customer_number?.toLowerCase().includes(s);
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Lade Interessenten…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">HFX-Nr.</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Praxis / Name</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">E-Mail</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">PLZ</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
            <th className="text-center py-3 px-4 text-muted-foreground font-medium">Qodia</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Datum</th>
            <th className="py-3 px-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filtered.length === 0 ? (
            <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Keine Interessenten gefunden</td></tr>
          ) : filtered.map((l: any) => {
            const sc = leadStatusMap[l.status] ?? leadStatusMap.neu;
            return (
              <tr key={l.id} className="hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{l.hfx_customer_number || "–"}</td>
                <td className="py-3 px-4">
                  <p className="font-medium text-foreground">{l.praxis_name}</p>
                  <p className="text-xs text-muted-foreground">{l.vorname} {l.nachname}</p>
                </td>
                <td className="py-3 px-4 text-muted-foreground">{l.email}</td>
                <td className="py-3 px-4 text-muted-foreground">{l.plz}</td>
                <td className="py-3 px-4"><StatusBadge label={sc.label} cls={sc.cls} /></td>
                <td className="py-3 px-4 text-center"><QodiaIcon synced={l.qodia_synced} /></td>
                <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(l.created_at), "dd.MM.yy", { locale: de })}
                </td>
                <td className="py-3 px-4">
                  <Link to="/interessenten" className="text-xs text-primary hover:underline flex items-center gap-1">
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Verträge Tab ────────────────────────────────────────────────────────────
function VertraegeTab({ search }: { search: string }) {
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["journey-contracts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, customer_name, product_name, status, monthly_price, hfx_customer_number, email, created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Fetch qodia status for contracts via lead hfx_customer_number mapping
  const { data: leadQodiaMap = {} } = useQuery({
    queryKey: ["journey-lead-qodia-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("hfx_customer_number, qodia_synced")
        .not("hfx_customer_number", "is", null);
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((l: any) => { if (l.hfx_customer_number) map[l.hfx_customer_number] = l.qodia_synced; });
      return map;
    },
  });

  const filtered = contracts.filter((c: any) => {
    const s = search.toLowerCase();
    return !s || c.customer_name?.toLowerCase().includes(s) || c.product_name?.toLowerCase().includes(s)
      || c.hfx_customer_number?.toLowerCase().includes(s) || c.email?.toLowerCase().includes(s);
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Lade Verträge…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">HFX-Nr.</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Kunde</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Produkt</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
            <th className="text-right py-3 px-4 text-muted-foreground font-medium">Monatlich</th>
            <th className="text-center py-3 px-4 text-muted-foreground font-medium">Qodia</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Datum</th>
            <th className="py-3 px-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filtered.length === 0 ? (
            <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Keine Verträge gefunden</td></tr>
          ) : filtered.map((c: any) => {
            const sc = contractStatusMap[c.status] ?? contractStatusMap.entwurf;
            const qodiaSynced = c.hfx_customer_number ? leadQodiaMap[c.hfx_customer_number] ?? false : false;
            return (
              <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{c.hfx_customer_number || "–"}</td>
                <td className="py-3 px-4 font-medium text-foreground">{c.customer_name}</td>
                <td className="py-3 px-4 text-muted-foreground">{c.product_name}</td>
                <td className="py-3 px-4"><StatusBadge label={sc.label} cls={sc.cls} /></td>
                <td className="py-3 px-4 text-right font-medium text-foreground">
                  {c.monthly_price > 0 ? `${c.monthly_price.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}/Mo.` : "–"}
                </td>
                <td className="py-3 px-4 text-center"><QodiaIcon synced={qodiaSynced} /></td>
                <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(c.created_at), "dd.MM.yy", { locale: de })}
                </td>
                <td className="py-3 px-4">
                  <Link to="/vertrieb/vertraege" className="text-xs text-primary hover:underline">
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Kunden Tab ──────────────────────────────────────────────────────────────
function KundenTab({ search }: { search: string }) {
  const { data: praxen = [], isLoading } = useQuery({
    queryKey: ["journey-praxen"],
    queryFn: async () => {
      const { data } = await supabase
        .from("praxen")
        .select("id, name, mp_nr, hfx_customer_number, email, plz, ort, produkt, status, buchungs_datum, converted_from_lead_id")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Fetch qodia_synced from leads via converted_from_lead_id
  const { data: leadQodiaByLeadId = { byId: {} as Record<string, boolean>, byHfx: {} as Record<string, boolean> } } = useQuery({
    queryKey: ["journey-praxen-qodia"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, qodia_synced, hfx_customer_number")
        .not("id", "is", null);
      const mapById: Record<string, boolean> = {};
      const mapByHfx: Record<string, boolean> = {};
      (data ?? []).forEach((l: any) => {
        if (l.id) mapById[l.id] = l.qodia_synced;
        if (l.hfx_customer_number) mapByHfx[l.hfx_customer_number] = l.qodia_synced;
      });
      return { byId: mapById, byHfx: mapByHfx };
    },
  });

  const filtered = praxen.filter((p: any) => {
    const s = search.toLowerCase();
    const hfx = (p as any).hfx_customer_number || p.mp_nr || "";
    return !s || p.name?.toLowerCase().includes(s) || hfx.toLowerCase().includes(s)
      || p.email?.toLowerCase().includes(s) || p.ort?.toLowerCase().includes(s);
  });

  if (isLoading) return <div className="py-12 text-center text-muted-foreground">Lade Kunden…</div>;

  const getQodiaStatus = (p: any): boolean => {
    if (p.converted_from_lead_id && leadQodiaByLeadId.byId?.[p.converted_from_lead_id] !== undefined)
      return leadQodiaByLeadId.byId[p.converted_from_lead_id];
    const hfx = (p as any).hfx_customer_number || p.mp_nr;
    if (hfx && leadQodiaByLeadId.byHfx?.[hfx] !== undefined)
      return leadQodiaByLeadId.byHfx[hfx];
    return false;
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">HFX-Nr.</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Praxis</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Ort</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Produkt</th>
            <th className="text-left py-3 px-4 text-muted-foreground font-medium">Status</th>
            <th className="text-center py-3 px-4 text-muted-foreground font-medium">Qodia</th>
            <th className="py-3 px-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filtered.length === 0 ? (
            <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Keine Kunden gefunden</td></tr>
          ) : filtered.map((p: any) => {
            const hfx = (p as any).hfx_customer_number || p.mp_nr || "–";
            const qodiaSynced = getQodiaStatus(p);
            return (
              <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{hfx}</td>
                <td className="py-3 px-4 font-medium text-foreground">{p.name}</td>
                <td className="py-3 px-4 text-muted-foreground">{p.plz} {p.ort}</td>
                <td className="py-3 px-4 text-muted-foreground">{p.produkt || "–"}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${p.status === "aktiv" ? "bg-green-500/10 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {p.status ?? "aktiv"}
                  </span>
                </td>
                <td className="py-3 px-4 text-center"><QodiaIcon synced={qodiaSynced} /></td>
                <td className="py-3 px-4">
                  <Link to="/praxen" className="text-xs text-primary hover:underline">
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function PraxenJourney() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("leads");

  // Counts for tab badges
  const { data: counts = { leads: 0, contracts: 0, praxen: 0 } } = useQuery({
    queryKey: ["journey-counts"],
    queryFn: async () => {
      const [l, c, p] = await Promise.all([
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase.from("contracts").select("id", { count: "exact", head: true }),
        supabase.from("praxen").select("id", { count: "exact", head: true }),
      ]);
      return { leads: l.count ?? 0, contracts: c.count ?? 0, praxen: p.count ?? 0 };
    },
  });

  return (
    <MainLayout
      title="Praxis-Journey"
      subtitle="Interessenten → Verträge → Kunden – alles auf einen Blick"
    >
      {/* Journey-Pfeil */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        <button onClick={() => setTab("leads")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${tab === "leads" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
          <Users className="h-3.5 w-3.5" />
          Interessenten
          <span className="ml-1 rounded-full bg-background/20 px-1.5 py-0.5 text-[10px] font-medium">{counts.leads}</span>
        </button>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        <button onClick={() => setTab("vertraege")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${tab === "vertraege" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
          <FileText className="h-3.5 w-3.5" />
          Verträge
          <span className="ml-1 rounded-full bg-background/20 px-1.5 py-0.5 text-[10px] font-medium">{counts.contracts}</span>
        </button>
        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
        <button onClick={() => setTab("kunden")} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors ${tab === "kunden" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}>
          <Building2 className="h-3.5 w-3.5" />
          Kunden
          <span className="ml-1 rounded-full bg-background/20 px-1.5 py-0.5 text-[10px] font-medium">{counts.praxen}</span>
        </button>
      </div>

      <div className="card-elevated overflow-hidden">
        {/* Search + Tabs */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Suchen…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Tabs value={tab} onValueChange={setTab} className="ml-auto">
            <TabsList>
              <TabsTrigger value="leads" className="gap-1.5 text-xs">
                <Users className="h-3.5 w-3.5" /> Interessenten
              </TabsTrigger>
              <TabsTrigger value="vertraege" className="gap-1.5 text-xs">
                <FileText className="h-3.5 w-3.5" /> Verträge
              </TabsTrigger>
              <TabsTrigger value="kunden" className="gap-1.5 text-xs">
                <Building2 className="h-3.5 w-3.5" /> Kunden
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Content */}
        {tab === "leads" && <LeadsTab search={search} />}
        {tab === "vertraege" && <VertraegeTab search={search} />}
        {tab === "kunden" && <KundenTab search={search} />}
      </div>

      {/* Hinweis: Vorschau-Seite */}
      <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 font-medium">Vorschau</span>
        Diese Seite ist eine vereinfachte Journey-Ansicht. Die vollständigen Aktionen sind weiterhin über die jeweiligen Menüpunkte verfügbar.
      </div>
    </MainLayout>
  );
}
