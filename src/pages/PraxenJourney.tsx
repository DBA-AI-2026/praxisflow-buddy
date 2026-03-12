import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Search, Users, FileText, Building2,
  CheckCircle2, XCircle, ArrowRight,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Status configs ───────────────────────────────────────────────────────────
const leadStatusMap: Record<string, { label: string; cls: string }> = {
  neu:          { label: "Neu",          cls: "bg-primary/10 text-primary" },
  kontaktiert:  { label: "Kontaktiert",  cls: "bg-secondary text-secondary-foreground" },
  qualifiziert: { label: "Qualifiziert", cls: "bg-amber-500/10 text-amber-700" },
  vertrag:      { label: "Vertrag",      cls: "bg-blue-500/10 text-blue-700" },
  abgelehnt:    { label: "Abgelehnt",   cls: "bg-destructive/10 text-destructive" },
};

const contractStatusMap: Record<string, { label: string; cls: string }> = {
  entwurf:     { label: "Entwurf",     cls: "bg-muted text-muted-foreground" },
  eingegangen: { label: "Eingegangen", cls: "bg-amber-500/10 text-amber-700" },
  gezeichnet:  { label: "Gezeichnet",  cls: "bg-blue-500/10 text-blue-700" },
  aktiv:       { label: "Aktiv",       cls: "bg-green-500/10 text-green-700" },
  gekuendigt:  { label: "Gekündigt",   cls: "bg-orange-500/10 text-orange-700" },
  beendet:     { label: "Beendet",     cls: "bg-destructive/10 text-destructive" },
};

const praxisStatusMap: Record<string, { label: string; cls: string }> = {
  aktiv:       { label: "Aktiv",       cls: "bg-green-500/10 text-green-700" },
  inaktiv:     { label: "Inaktiv",     cls: "bg-muted text-muted-foreground" },
  gekuendigt:  { label: "Gekündigt",   cls: "bg-orange-500/10 text-orange-700" },
};

// ─── Shared helpers ───────────────────────────────────────────────────────────
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

function EmptyRow({ cols, msg }: { cols: number; msg: string }) {
  return (
    <tr>
      <td colSpan={cols} className="text-center py-10 text-muted-foreground text-sm">
        {msg}
      </td>
    </tr>
  );
}

// ─── Tab: Interessenten ───────────────────────────────────────────────────────
function LeadsTab({ search }: { search: string }) {
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["journey-leads"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, praxis_name, vorname, nachname, email, plz, ort, status, qodia_synced, hfx_customer_number, created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const s = search.toLowerCase();
  const filtered = leads.filter((l: any) =>
    !s ||
    l.praxis_name?.toLowerCase().includes(s) ||
    l.vorname?.toLowerCase().includes(s) ||
    l.nachname?.toLowerCase().includes(s) ||
    l.email?.toLowerCase().includes(s) ||
    l.hfx_customer_number?.toLowerCase().includes(s)
  );

  if (isLoading) return <div className="py-12 text-center text-muted-foreground text-sm">Lade Interessenten…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">HFX-Nr.</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Praxis / Arzt</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">E-Mail</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">PLZ / Ort</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Status</th>
            <th className="text-center py-2.5 px-4 text-muted-foreground font-medium text-xs">Qodia</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Datum</th>
            <th className="py-2.5 px-4 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filtered.length === 0 ? (
            <EmptyRow cols={8} msg="Keine Interessenten gefunden" />
          ) : filtered.map((l: any) => {
            const sc = leadStatusMap[l.status] ?? leadStatusMap.neu;
            return (
              <tr key={l.id} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{l.hfx_customer_number || "–"}</td>
                <td className="py-3 px-4">
                  <p className="font-medium text-foreground leading-tight">{l.praxis_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{l.vorname} {l.nachname}</p>
                </td>
                <td className="py-3 px-4 text-muted-foreground text-xs">{l.email}</td>
                <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">{l.plz}{l.ort ? ` ${l.ort}` : ""}</td>
                <td className="py-3 px-4"><StatusBadge label={sc.label} cls={sc.cls} /></td>
                <td className="py-3 px-4 text-center"><QodiaIcon synced={!!l.qodia_synced} /></td>
                <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {l.created_at ? format(new Date(l.created_at), "dd.MM.yy", { locale: de }) : "–"}
                </td>
                <td className="py-3 px-4">
                  <Link to="/interessenten" className="text-primary hover:text-primary/70 transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
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

// ─── Tab: Verträge ────────────────────────────────────────────────────────────
function VertraegeTab({ search }: { search: string }) {
  const { data: contracts = [], isLoading } = useQuery({
    queryKey: ["journey-contracts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contracts")
        .select("id, customer_name, product_name, status, monthly_price, hfx_customer_number, email, vorname, nachname, praxis, created_at")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: leadQodiaMap = {} } = useQuery({
    queryKey: ["journey-lead-qodia-map"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("hfx_customer_number, qodia_synced")
        .not("hfx_customer_number", "is", null);
      const map: Record<string, boolean> = {};
      (data ?? []).forEach((l: any) => {
        if (l.hfx_customer_number) map[l.hfx_customer_number] = !!l.qodia_synced;
      });
      return map;
    },
  });

  const s = search.toLowerCase();
  const filtered = contracts.filter((c: any) =>
    !s ||
    c.customer_name?.toLowerCase().includes(s) ||
    c.product_name?.toLowerCase().includes(s) ||
    c.hfx_customer_number?.toLowerCase().includes(s) ||
    c.email?.toLowerCase().includes(s) ||
    c.praxis?.toLowerCase().includes(s)
  );

  if (isLoading) return <div className="py-12 text-center text-muted-foreground text-sm">Lade Verträge…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">HFX-Nr.</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Praxis / Arzt</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Produkt</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Status</th>
            <th className="text-right py-2.5 px-4 text-muted-foreground font-medium text-xs">Monatlich</th>
            <th className="text-center py-2.5 px-4 text-muted-foreground font-medium text-xs">Qodia</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Datum</th>
            <th className="py-2.5 px-4 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filtered.length === 0 ? (
            <EmptyRow cols={8} msg="Keine Verträge gefunden" />
          ) : filtered.map((c: any) => {
            const sc = contractStatusMap[c.status] ?? contractStatusMap.entwurf;
            const qodiaSynced = c.hfx_customer_number ? (leadQodiaMap[c.hfx_customer_number] ?? false) : false;
            const praxisLabel = c.praxis || c.customer_name || "–";
            const arztLabel = [c.vorname, c.nachname].filter(Boolean).join(" ") || null;
            return (
              <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{c.hfx_customer_number || "–"}</td>
                <td className="py-3 px-4">
                  <p className="font-medium text-foreground leading-tight">{praxisLabel}</p>
                  {arztLabel && <p className="text-xs text-muted-foreground mt-0.5">{arztLabel}</p>}
                </td>
                <td className="py-3 px-4 text-muted-foreground text-xs">{c.product_name}</td>
                <td className="py-3 px-4"><StatusBadge label={sc.label} cls={sc.cls} /></td>
                <td className="py-3 px-4 text-right font-medium text-foreground text-xs whitespace-nowrap">
                  {c.monthly_price > 0
                    ? `${Number(c.monthly_price).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}/Mo.`
                    : "–"}
                </td>
                <td className="py-3 px-4 text-center"><QodiaIcon synced={qodiaSynced} /></td>
                <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {c.created_at ? format(new Date(c.created_at), "dd.MM.yy", { locale: de }) : "–"}
                </td>
                <td className="py-3 px-4">
                  <Link to="/vertrieb/vertraege" className="text-primary hover:text-primary/70 transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
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

// ─── Tab: Kunden ──────────────────────────────────────────────────────────────
function KundenTab({ search }: { search: string }) {
  const { data: praxen = [], isLoading } = useQuery({
    queryKey: ["journey-praxen"],
    queryFn: async () => {
      const { data } = await supabase
        .from("praxen")
        .select("id, name, mp_nr, email, plz, ort, produkt, status, buchungs_datum, converted_from_lead_id")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: leadQodiaByLeadId = { byId: {} as Record<string, boolean>, byHfx: {} as Record<string, boolean> } } = useQuery({
    queryKey: ["journey-praxen-qodia"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("id, qodia_synced, hfx_customer_number");
      const mapById: Record<string, boolean> = {};
      const mapByHfx: Record<string, boolean> = {};
      (data ?? []).forEach((l: any) => {
        if (l.id) mapById[l.id] = !!l.qodia_synced;
        if (l.hfx_customer_number) mapByHfx[l.hfx_customer_number] = !!l.qodia_synced;
      });
      return { byId: mapById, byHfx: mapByHfx };
    },
  });

  const getQodiaStatus = (p: any): boolean => {
    if (p.converted_from_lead_id && leadQodiaByLeadId.byId[p.converted_from_lead_id] !== undefined)
      return leadQodiaByLeadId.byId[p.converted_from_lead_id];
    if (p.mp_nr && leadQodiaByLeadId.byHfx[p.mp_nr] !== undefined)
      return leadQodiaByLeadId.byHfx[p.mp_nr];
    return false;
  };

  const s = search.toLowerCase();
  const filtered = praxen.filter((p: any) =>
    !s ||
    p.name?.toLowerCase().includes(s) ||
    p.mp_nr?.toLowerCase().includes(s) ||
    p.email?.toLowerCase().includes(s) ||
    p.ort?.toLowerCase().includes(s) ||
    p.plz?.toLowerCase().includes(s)
  );

  if (isLoading) return <div className="py-12 text-center text-muted-foreground text-sm">Lade Kunden…</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">MP-Nr.</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Praxis</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Ort</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Produkt</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Status</th>
            <th className="text-center py-2.5 px-4 text-muted-foreground font-medium text-xs">Qodia</th>
            <th className="text-left py-2.5 px-4 text-muted-foreground font-medium text-xs">Buchung</th>
            <th className="py-2.5 px-4 w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {filtered.length === 0 ? (
            <EmptyRow cols={8} msg="Keine Kunden gefunden" />
          ) : filtered.map((p: any) => {
            const sc = praxisStatusMap[p.status ?? "aktiv"] ?? praxisStatusMap.aktiv;
            const qodiaSynced = getQodiaStatus(p);
            return (
              <tr key={p.id} className="hover:bg-muted/20 transition-colors">
                <td className="py-3 px-4 font-mono text-xs text-muted-foreground">{p.mp_nr || "–"}</td>
                <td className="py-3 px-4 font-medium text-foreground">{p.name}</td>
                <td className="py-3 px-4 text-muted-foreground text-xs whitespace-nowrap">{p.plz}{p.ort ? ` ${p.ort}` : ""}</td>
                <td className="py-3 px-4 text-muted-foreground text-xs">{p.produkt || "–"}</td>
                <td className="py-3 px-4"><StatusBadge label={sc.label} cls={sc.cls} /></td>
                <td className="py-3 px-4 text-center"><QodiaIcon synced={qodiaSynced} /></td>
                <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                  {p.buchungs_datum ? format(new Date(p.buchungs_datum), "dd.MM.yy", { locale: de }) : "–"}
                </td>
                <td className="py-3 px-4">
                  <Link to="/praxen" className="text-primary hover:text-primary/70 transition-colors">
                    <ArrowRight className="h-3.5 w-3.5" />
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

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PraxenJourney() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"leads" | "vertraege" | "kunden">("leads");

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

  const tabs = [
    { key: "leads" as const, label: "Interessenten", icon: Users, count: counts.leads, to: "/interessenten" },
    { key: "vertraege" as const, label: "Verträge", icon: FileText, count: counts.contracts, to: "/vertrieb/vertraege" },
    { key: "kunden" as const, label: "Kunden", icon: Building2, count: counts.praxen, to: "/praxen" },
  ] as const;

  return (
    <MainLayout
      title="Praxen & Leads"
      subtitle="Interessenten · Verträge · Kunden"
    >
      <div className="card-elevated overflow-hidden">
        {/* Tab-Leiste + Suche */}
        <div className="border-b border-border">
          <div className="flex items-center gap-0">
            {tabs.map((t, i) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium border-b-2 transition-colors
                    ${active
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/30"
                    }
                    ${i > 0 ? "border-l border-l-border/50" : ""}
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {t.label}
                  <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium
                    ${active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {t.count}
                  </span>
                </button>
              );
            })}

            {/* Spacer + Suche */}
            <div className="flex-1 flex justify-end px-4 py-2">
              <div className="relative max-w-xs w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Suchen…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Inhalt */}
        {tab === "leads" && <LeadsTab search={search} />}
        {tab === "vertraege" && <VertraegeTab search={search} />}
        {tab === "kunden" && <KundenTab search={search} />}
      </div>

      {/* Hinweis auf Detailseiten */}
      <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
        <span>Detailansichten und Aktionen:</span>
        {tabs.map((t) => (
          <Link
            key={t.key}
            to={t.to}
            className="inline-flex items-center gap-1 hover:text-primary transition-colors"
          >
            <t.icon className="h-3 w-3" />
            {t.label}
          </Link>
        ))}
      </div>
    </MainLayout>
  );
}
