import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Download,
  TrendingUp,
  Users,
  Receipt,
  Plus,
  Loader2,
  Upload,
  CalendarDays,
  Euro,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { de } from "date-fns/locale";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmtEur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const fmtDate = (s: string) =>
  format(new Date(s + (s.length === 10 ? "T00:00:00" : "")), "dd.MM.yyyy", { locale: de });

function downloadCsv(rows: string[][], filename: string) {
  const bom = "\uFEFF";
  const csv = bom + rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Lexware-compatible header sets
const REVENUE_HEADERS = ["Datum", "Belegnummer", "Buchungstext", "Konto", "Gegenkonto", "Nettobetrag", "USt-Satz %", "USt-Betrag", "Bruttobetrag", "Kostenstelle", "Zahlungsart"];
const COMMISSION_HEADERS = ["Datum", "Belegnummer", "Buchungstext", "Vertriebler", "Produkt", "Konto", "Gegenkonto", "Nettobetrag", "Provisionssatz", "Bruttobetrag"];
const COST_HEADERS = ["Datum", "Belegnummer", "Buchungstext", "Lieferant", "Kostenkategorie", "Kunde", "HFX-Nr", "Produkt", "Konto", "Gegenkonto", "Nettobetrag", "USt-Satz %", "USt-Betrag", "Bruttobetrag"];

// Lexware Kontenrahmen (SKR03)
const REVENUE_ACCOUNT = "8400"; // Erlöse 19% USt
const REVENUE_CONTRA = "1400";  // Forderungen
const COMMISSION_ACCOUNT = "4940"; // Provisionen
const COMMISSION_CONTRA = "1600"; // Verbindlichkeiten
const COST_ACCOUNT = "3300"; // Bezogene Waren
const COST_CONTRA = "1600"; // Verbindlichkeiten

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const d = subMonths(new Date(), i);
  return { label: format(d, "MMMM yyyy", { locale: de }), value: format(d, "yyyy-MM") };
});

const COST_CATEGORIES = ["Lizenzkosten", "Servicegebühr", "Support", "White-Label", "Sonstige"];

// ─── main component ──────────────────────────────────────────────────────────

export default function Buchhaltung() {
  const [tab, setTab] = useState("erlöse");
  const [periodMode, setPeriodMode] = useState<"month" | "custom">("month");
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const effectiveFrom = periodMode === "month"
    ? `${selectedMonth}-01`
    : dateFrom;
  const effectiveTo = periodMode === "month"
    ? format(endOfMonth(new Date(selectedMonth + "-01")), "yyyy-MM-dd")
    : dateTo;

  // ── queries ──
  const { data: revenues = [], isLoading: revLoading } = useQuery({
    queryKey: ["accounting-revenues", effectiveFrom, effectiveTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .gte("invoice_date", effectiveFrom)
        .lte("invoice_date", effectiveTo)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["accounting-contracts", effectiveFrom, effectiveTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, customer_name, product_name, monthly_price, sales_partner_name, sales_partner_id, start_date")
        .eq("status", "aktiv")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: productCommissions = [] } = useQuery({
    queryKey: ["product-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_commissions").select("*").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: costs = [], isLoading: costLoading } = useQuery({
    queryKey: ["accounting-costs", effectiveFrom, effectiveTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounting_costs")
        .select("*")
        .gte("cost_date", effectiveFrom)
        .lte("cost_date", effectiveTo)
        .order("cost_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // ── commission calculation ──
  const commissions = contracts.map((c: any) => {
    const pc = productCommissions.find((p: any) => p.product_name === c.product_name);
    let amount = 0;
    let rate = "–";
    if (pc) {
      if (pc.commission_type === "prozent") {
        amount = (c.monthly_price * pc.commission_value) / 100;
        rate = `${pc.commission_value}%`;
      } else if (pc.commission_type === "festbetrag") {
        amount = pc.commission_value;
        rate = fmtEur(pc.commission_value);
      } else {
        amount = pc.commission_value;
        rate = `${fmtEur(pc.commission_value)}/Monat`;
      }
    }
    return { ...c, commission_amount: amount, commission_rate: rate };
  }).filter((c: any) => c.commission_amount > 0 && c.sales_partner_name);

  // ── summary numbers ──
  const totalRevenue = revenues.reduce((s: number, r: any) => s + (r.gross_amount ?? 0), 0);
  const totalCommission = commissions.reduce((s: number, c: any) => s + c.commission_amount, 0);
  const totalCosts = costs.reduce((s: number, c: any) => s + (c.gross_amount ?? 0), 0);

  // ── CSV exports ──
  const exportRevenues = () => {
    const rows = [REVENUE_HEADERS, ...revenues.map((r: any) => [
      fmtDate(r.invoice_date), r.invoice_number, `Rechnung ${r.customer_name}`,
      REVENUE_ACCOUNT, REVENUE_CONTRA,
      r.net_amount?.toFixed(2), r.tax_rate?.toFixed(0), r.tax_amount?.toFixed(2), r.gross_amount?.toFixed(2),
      "", "SEPA"
    ])];
    const label = periodMode === "month" ? selectedMonth : `${effectiveFrom}_${effectiveTo}`;
    downloadCsv(rows, `HFX_Erlöse_${label}.csv`);
    toast({ title: "Export erfolgreich", description: `${revenues.length} Erlösbuchungen exportiert.` });
  };

  const exportCommissions = () => {
    const rows = [COMMISSION_HEADERS, ...commissions.map((c: any) => [
      fmtDate(c.start_date), `PROV-${c.id.slice(0, 8).toUpperCase()}`, `Provision ${c.product_name}`,
      c.sales_partner_name, c.product_name,
      COMMISSION_ACCOUNT, COMMISSION_CONTRA,
      c.commission_amount.toFixed(2), c.commission_rate, c.commission_amount.toFixed(2)
    ])];
    const label = periodMode === "month" ? selectedMonth : `${effectiveFrom}_${effectiveTo}`;
    downloadCsv(rows, `HFX_Provisionen_${label}.csv`);
    toast({ title: "Export erfolgreich", description: `${commissions.length} Provisionsbuchungen exportiert.` });
  };

  const exportCosts = () => {
    const rows = [COST_HEADERS, ...costs.map((c: any) => [
      fmtDate(c.cost_date), c.invoice_reference ?? `KOST-${c.id.slice(0, 8).toUpperCase()}`,
      `${c.category} ${c.supplier}`, c.supplier, c.category, c.customer_name,
      c.hfx_customer_number ?? "", c.product_name ?? "",
      COST_ACCOUNT, COST_CONTRA,
      c.net_amount?.toFixed(2), c.tax_rate?.toFixed(0), c.tax_amount?.toFixed(2), c.gross_amount?.toFixed(2)
    ])];
    const label = periodMode === "month" ? selectedMonth : `${effectiveFrom}_${effectiveTo}`;
    downloadCsv(rows, `HFX_Kosten_${label}.csv`);
    toast({ title: "Export erfolgreich", description: `${costs.length} Kostenbuchungen exportiert.` });
  };

  const exportAll = () => {
    exportRevenues();
    exportCommissions();
    exportCosts();
  };

  return (
    <MainLayout title="Buchhaltung" subtitle="Lexware-kompatible Buchungssätze für die Finanzbuchhaltung">
      {/* Period selector */}
      <div className="card-elevated p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div className="flex gap-2">
          <Button
            variant={periodMode === "month" ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriodMode("month")}
          >
            <CalendarDays className="h-4 w-4 mr-2" />
            Monat
          </Button>
          <Button
            variant={periodMode === "custom" ? "default" : "outline"}
            size="sm"
            onClick={() => setPeriodMode("custom")}
          >
            Freie Auswahl
          </Button>
        </div>

        {periodMode === "month" ? (
          <div>
            <Label className="text-xs text-muted-foreground mb-1 block">Monat</Label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_OPTIONS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex gap-3">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Von</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Bis</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
          </div>
        )}

        <div className="ml-auto">
          <Button onClick={exportAll} className="gap-2">
            <Download className="h-4 w-4" />
            Alle 3 CSV exportieren
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-green-500/10">
              <TrendingUp className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Erlöse (Brutto)</p>
              <p className="text-xl font-semibold text-foreground">{fmtEur(totalRevenue)}</p>
              <p className="text-xs text-muted-foreground">{revenues.length} Rechnungen</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Provisionen</p>
              <p className="text-xl font-semibold text-foreground">{fmtEur(totalCommission)}</p>
              <p className="text-xs text-muted-foreground">{commissions.length} Vertriebler</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-amber-500/10">
              <Receipt className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Kosten (Brutto)</p>
              <p className="text-xl font-semibold text-foreground">{fmtEur(totalCosts)}</p>
              <p className="text-xs text-muted-foreground">{costs.length} Belege</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="erlöse">Erlöse ({revenues.length})</TabsTrigger>
          <TabsTrigger value="provisionen">Provisionen ({commissions.length})</TabsTrigger>
          <TabsTrigger value="kosten">Kosten ({costs.length})</TabsTrigger>
        </TabsList>

        {/* ── Erlöse ── */}
        <TabsContent value="erlöse" className="mt-4">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Buchungssatz 1: Erlöse</h3>
              <Button variant="outline" size="sm" onClick={exportRevenues}>
                <Download className="h-4 w-4 mr-2" />CSV exportieren
              </Button>
            </div>
            <div className="overflow-x-auto">
              {revLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : revenues.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Keine Rechnungen im gewählten Zeitraum.</div>
              ) : (
                <table className="data-table">
                  <thead className="bg-muted/50">
                    <tr>
                      <th>Datum</th><th>Belegnummer</th><th>Kunde</th><th>Konto</th>
                      <th>Netto</th><th>USt %</th><th>USt</th><th>Brutto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenues.map((r: any) => (
                      <tr key={r.id}>
                        <td className="text-muted-foreground">{fmtDate(r.invoice_date)}</td>
                        <td className="font-mono text-xs">{r.invoice_number}</td>
                        <td className="font-medium text-foreground">{r.customer_name}</td>
                        <td className="font-mono text-xs text-muted-foreground">{REVENUE_ACCOUNT}/{REVENUE_CONTRA}</td>
                        <td className="text-right">{fmtEur(r.net_amount)}</td>
                        <td className="text-right text-muted-foreground">{r.tax_rate}%</td>
                        <td className="text-right text-muted-foreground">{fmtEur(r.tax_amount)}</td>
                        <td className="text-right font-semibold text-foreground">{fmtEur(r.gross_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Provisionen ── */}
        <TabsContent value="provisionen" className="mt-4">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Buchungssatz 2: Provisionen</h3>
              <Button variant="outline" size="sm" onClick={exportCommissions}>
                <Download className="h-4 w-4 mr-2" />CSV exportieren
              </Button>
            </div>
            <div className="overflow-x-auto">
              {commissions.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Keine Provisionen berechnet.</div>
              ) : (
                <table className="data-table">
                  <thead className="bg-muted/50">
                    <tr>
                      <th>Vertriebler</th><th>Produkt</th><th>Kunde</th>
                      <th>Konto</th><th>Satz</th><th>Betrag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissions.map((c: any) => (
                      <tr key={c.id}>
                        <td className="font-medium text-foreground">{c.sales_partner_name}</td>
                        <td className="text-muted-foreground">{c.product_name}</td>
                        <td>{c.customer_name}</td>
                        <td className="font-mono text-xs text-muted-foreground">{COMMISSION_ACCOUNT}/{COMMISSION_CONTRA}</td>
                        <td><Badge variant="outline">{c.commission_rate}</Badge></td>
                        <td className="text-right font-semibold text-foreground">{fmtEur(c.commission_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Kosten ── */}
        <TabsContent value="kosten" className="mt-4">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Buchungssatz 3: Kosten (Drittanbieter/White-Label)</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCsvImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />CSV-Import
                </Button>
                <Button variant="outline" size="sm" onClick={exportCosts}>
                  <Download className="h-4 w-4 mr-2" />CSV exportieren
                </Button>
                <Button size="sm" onClick={() => setCostDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />Kostenposten
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {costLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : costs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Keine Kostenbelege im gewählten Zeitraum.</div>
              ) : (
                <table className="data-table">
                  <thead className="bg-muted/50">
                    <tr>
                      <th>Datum</th><th>Lieferant</th><th>Kategorie</th><th>Kunde</th>
                      <th>Produkt</th><th>Konto</th><th>Netto</th><th>USt %</th><th>Brutto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {costs.map((c: any) => (
                      <tr key={c.id}>
                        <td className="text-muted-foreground">{fmtDate(c.cost_date)}</td>
                        <td className="font-medium text-foreground">{c.supplier}</td>
                        <td><Badge variant="outline" className="text-xs">{c.category}</Badge></td>
                        <td className="text-muted-foreground">{c.customer_name}</td>
                        <td className="text-muted-foreground">{c.product_name ?? "–"}</td>
                        <td className="font-mono text-xs text-muted-foreground">{COST_ACCOUNT}/{COST_CONTRA}</td>
                        <td className="text-right">{fmtEur(c.net_amount)}</td>
                        <td className="text-right text-muted-foreground">{c.tax_rate}%</td>
                        <td className="text-right font-semibold text-foreground">{fmtEur(c.gross_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <CostDialog open={costDialogOpen} onOpenChange={setCostDialogOpen} userId={user?.id} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["accounting-costs"] })} />
      <CsvCostImportDialog open={csvImportOpen} onOpenChange={setCsvImportOpen} userId={user?.id} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["accounting-costs"] })} />
    </MainLayout>
  );
}

// ─── Cost entry dialog ────────────────────────────────────────────────────────

function CostDialog({ open, onOpenChange, userId, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; userId?: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ cost_date: format(new Date(), "yyyy-MM-dd"), supplier: "", customer_name: "", hfx_customer_number: "", product_name: "", category: "Lizenzkosten", description: "", net_amount: "", tax_rate: "19", invoice_reference: "" });

  const net = parseFloat(form.net_amount) || 0;
  const rate = parseFloat(form.tax_rate) || 0;
  const tax = net * (rate / 100);
  const gross = net + tax;

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("accounting_costs").insert({
        cost_date: form.cost_date,
        supplier: form.supplier,
        customer_name: form.customer_name,
        hfx_customer_number: form.hfx_customer_number || null,
        product_name: form.product_name || null,
        category: form.category,
        description: form.description || null,
        net_amount: net,
        tax_rate: rate,
        tax_amount: parseFloat(tax.toFixed(2)),
        gross_amount: parseFloat(gross.toFixed(2)),
        invoice_reference: form.invoice_reference || null,
        created_by: userId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Kostenposten gespeichert" });
      onSuccess();
      onOpenChange(false);
      setForm({ cost_date: format(new Date(), "yyyy-MM-dd"), supplier: "", customer_name: "", hfx_customer_number: "", product_name: "", category: "Lizenzkosten", description: "", net_amount: "", tax_rate: "19", invoice_reference: "" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Kostenposten erfassen</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Datum *</Label><Input type="date" value={form.cost_date} onChange={(e) => f("cost_date", e.target.value)} /></div>
            <div className="space-y-2"><Label>Kategorie *</Label>
              <Select value={form.category} onValueChange={(v) => f("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2"><Label>Lieferant/Anbieter *</Label><Input value={form.supplier} onChange={(e) => f("supplier", e.target.value)} placeholder="Drittanbieter GmbH" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Kunde *</Label><Input value={form.customer_name} onChange={(e) => f("customer_name", e.target.value)} placeholder="Praxis Dr. Müller" /></div>
            <div className="space-y-2"><Label>HFX-Nr.</Label><Input value={form.hfx_customer_number} onChange={(e) => f("hfx_customer_number", e.target.value)} placeholder="HFX-00001" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Produkt</Label><Input value={form.product_name} onChange={(e) => f("product_name", e.target.value)} placeholder="HFX GOÄ" /></div>
            <div className="space-y-2"><Label>Belegreferenz</Label><Input value={form.invoice_reference} onChange={(e) => f("invoice_reference", e.target.value)} placeholder="EK-2024-001" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2 col-span-2"><Label>Nettobetrag (€) *</Label><Input type="number" step="0.01" value={form.net_amount} onChange={(e) => f("net_amount", e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>USt %</Label>
              <Select value={form.tax_rate} onValueChange={(v) => f("tax_rate", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="7">7%</SelectItem>
                  <SelectItem value="19">19%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {net > 0 && (
            <div className="bg-muted rounded-md p-3 text-sm flex gap-6">
              <span>Netto: <strong>{fmtEur(net)}</strong></span>
              <span>USt: <strong>{fmtEur(tax)}</strong></span>
              <span>Brutto: <strong>{fmtEur(gross)}</strong></span>
            </div>
          )}
        </div>
        <DialogFooter className="pt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.supplier || !form.customer_name || !form.net_amount || mutation.isPending}>
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Speichern...</> : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CSV import dialog ────────────────────────────────────────────────────────

function CsvCostImportDialog({ open, onOpenChange, userId, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; userId?: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      const header = lines[0].split(/[;,]/).map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(/[;,]/).map((c) => c.replace(/^"|"$/g, "").trim());
        const obj: any = {};
        header.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
        return obj;
      }).filter((r) => r["lieferant"] || r["supplier"]);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const handleImport = async () => {
    if (!preview.length) return;
    setImporting(true);
    try {
      const rows = preview.map((r) => {
        const net = parseFloat(r["nettobetrag"] || r["net_amount"] || "0") || 0;
        const rate = parseFloat(r["ust"] || r["tax_rate"] || "19") || 19;
        const tax = net * (rate / 100);
        return {
          cost_date: r["datum"] || r["cost_date"] || format(new Date(), "yyyy-MM-dd"),
          supplier: r["lieferant"] || r["supplier"] || "Unbekannt",
          customer_name: r["kunde"] || r["customer_name"] || "Unbekannt",
          hfx_customer_number: r["hfx-nr"] || r["hfx_customer_number"] || null,
          product_name: r["produkt"] || r["product_name"] || null,
          category: r["kategorie"] || r["category"] || "Sonstige",
          description: r["beschreibung"] || r["description"] || null,
          net_amount: net,
          tax_rate: rate,
          tax_amount: parseFloat(tax.toFixed(2)),
          gross_amount: parseFloat((net + tax).toFixed(2)),
          invoice_reference: r["beleg"] || r["invoice_reference"] || null,
          created_by: userId,
        };
      });
      const { error } = await supabase.from("accounting_costs").insert(rows as any);
      if (error) throw error;
      toast({ title: "Import erfolgreich", description: `${rows.length} Kostenposten importiert.` });
      onSuccess();
      onOpenChange(false);
      setPreview([]);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Kostenposten CSV importieren</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Erwartete Spalten (Semikolon- oder Komma-getrennt):<br />
            <code className="text-xs bg-muted px-1 rounded">Datum; Lieferant; Kunde; HFX-Nr; Produkt; Kategorie; Nettobetrag; USt; Beleg</code>
          </p>
          <Input type="file" accept=".csv" onChange={handleFile} />
          {preview.length > 0 && (
            <div className="overflow-x-auto max-h-48 border rounded-md">
              <table className="data-table text-xs">
                <thead className="bg-muted/50"><tr>
                  {["Datum","Lieferant","Kunde","Produkt","Netto","Kategorie"].map((h) => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td>{r["datum"] || r["cost_date"]}</td>
                      <td>{r["lieferant"] || r["supplier"]}</td>
                      <td>{r["kunde"] || r["customer_name"]}</td>
                      <td>{r["produkt"] || r["product_name"]}</td>
                      <td>{r["nettobetrag"] || r["net_amount"]}</td>
                      <td>{r["kategorie"] || r["category"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground p-2">Vorschau: erste {preview.length} Zeilen</p>
            </div>
          )}
        </div>
        <DialogFooter className="pt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleImport} disabled={!preview.length || importing}>
            {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importiere...</> : `${preview.length} Zeilen importieren`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
