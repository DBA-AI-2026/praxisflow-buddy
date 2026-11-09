import { useEffect, useMemo, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Eye, Search, ShieldAlert } from "lucide-react";
import { generateInvoicePdfV2 } from "@/lib/generateInvoicePdfV2";
import { openPdfBlob } from "@/lib/openPdfBlob";
import { INVOICE_STATUS_CONFIG } from "@/lib/invoiceStatus";

interface ReadonlyInvoice {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_number: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  positions: any;
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  gross_amount: number;
  invoice_date: string;
  due_date: string | null;
  billing_period_month: string | null;
  status: string;
  email_sent_at: string | null;
}

const ALL = "__all__";
const eur = (n: number) => Number(n ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("de-DE") : "—");

export default function RechnungsUebersicht() {
  const { toast } = useToast();
  const [rows, setRows] = useState<ReadonlyInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [monthFilter, setMonthFilter] = useState(ALL);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_invoices_readonly" as any);
      if (error) {
        if ((error as any).code === "42501") setForbidden(true);
        else setLoadError(error.message);
      } else {
        setRows((data as ReadonlyInvoice[]) ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const months = useMemo(
    () => Array.from(new Set(rows.map((r) => r.billing_period_month).filter(Boolean) as string[])).sort().reverse(),
    [rows],
  );
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status))).sort(), [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (statusFilter === ALL || r.status === statusFilter) &&
        (monthFilter === ALL || r.billing_period_month === monthFilter) &&
        (!q || r.customer_name?.toLowerCase().includes(q) || r.customer_number?.toLowerCase().includes(q)),
    );
  }, [rows, statusFilter, monthFilter, search]);

  const handlePdf = async (inv: ReadonlyInvoice) => {
    try {
      let logoBytes: ArrayBuffer | undefined;
      try {
        const resp = await fetch("/logo.png");
        if (resp.ok) logoBytes = await resp.arrayBuffer();
      } catch { /* kein Logo */ }
      const pdf = await generateInvoicePdfV2(
        {
          ...inv,
          positions: Array.isArray(inv.positions) ? inv.positions : [],
          rechnungs_email: null,
          notes: null,
        },
        logoBytes,
      );
      openPdfBlob(pdf, `Rechnung-${inv.invoice_number}.pdf`);
    } catch (e: any) {
      toast({ title: "PDF-Fehler", description: e.message, variant: "destructive" });
    }
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Rechnungsübersicht</h1>

        {forbidden ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
              <ShieldAlert className="h-5 w-5" /> Keine Berechtigung
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rechnungen ({filtered.length})</CardTitle>
              <div className="flex flex-wrap gap-3 pt-2">
                <div className="relative w-64">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Praxis oder HFX-Nr." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Alle Status</SelectItem>
                    {statuses.map((s) => (
                      <SelectItem key={s} value={s}>{INVOICE_STATUS_CONFIG[s]?.label ?? s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={monthFilter} onValueChange={setMonthFilter}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Monat" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Alle Monate</SelectItem>
                    {months.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Lädt…</p>
              ) : loadError ? (
                <p className="text-destructive">Rechnungen konnten nicht geladen werden: {loadError}</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Rechnungsnr.</TableHead>
                        <TableHead>HFX-Nr.</TableHead>
                        <TableHead>Praxis</TableHead>
                        <TableHead>Zeitraum</TableHead>
                        <TableHead>Rechnungsdatum</TableHead>
                        <TableHead>Fällig</TableHead>
                        <TableHead className="text-right">Netto</TableHead>
                        <TableHead className="text-right">Brutto</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Versendet am</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((inv) => {
                        const s = INVOICE_STATUS_CONFIG[inv.status] ?? INVOICE_STATUS_CONFIG.entwurf;
                        const Icon = s.icon;
                        return (
                          <TableRow key={inv.id}>
                            <TableCell className="font-mono text-sm">{inv.invoice_number}</TableCell>
                            <TableCell className="font-mono text-sm">{inv.customer_number ?? "—"}</TableCell>
                            <TableCell>{inv.customer_name}</TableCell>
                            <TableCell>{inv.billing_period_month ?? "—"}</TableCell>
                            <TableCell>{fmtDate(inv.invoice_date)}</TableCell>
                            <TableCell>{fmtDate(inv.due_date)}</TableCell>
                            <TableCell className="text-right">{eur(inv.net_amount)}</TableCell>
                            <TableCell className="text-right">{eur(inv.gross_amount)}</TableCell>
                            <TableCell>
                              <Badge variant={s.variant} className="gap-1">
                                <Icon className="h-3 w-3" /> {INVOICE_STATUS_CONFIG[inv.status]?.label ?? inv.status}
                              </Badge>
                            </TableCell>
                            <TableCell>{fmtDate(inv.email_sent_at)}</TableCell>
                            <TableCell>
                              <Button size="sm" variant="outline" onClick={() => handlePdf(inv)}>
                                <Eye className="mr-1 h-4 w-4" /> PDF ansehen
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {filtered.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={11} className="py-6 text-center text-muted-foreground">Keine Rechnungen gefunden.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
