import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface ReconciliationRow {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  customer_name: string;
  customer_number: string | null;
  contract_id: string | null;
  invoice_net: number;
  invoice_tax: number;
  invoice_gross: number;
  invoice_status: string;
  invoice_created_at: string;
  fibu_event_count: number;
  fibu_net_total: number | null;
  fibu_tax_total: number | null;
  fibu_gross_total: number | null;
  fibu_event_types: string[] | null;
  reconciliation_status: string;
  delta_net: number;
  delta_gross: number;
}

type FilterStatus = "all" | "missing" | "amount_mismatch" | "ok";

export default function FibuReconciliation() {
  const [filter, setFilter] = useState<FilterStatus>("all");

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["fibu-reconciliation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_invoice_fibu_reconciliation" as any)
        .select("*")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ReconciliationRow[];
    },
  });

  const filtered = rows?.filter((r) => filter === "all" || r.reconciliation_status === filter) ?? [];
  const totalCount = rows?.length ?? 0;
  const missingCount = rows?.filter((r) => r.reconciliation_status === "missing").length ?? 0;
  const mismatchCount = rows?.filter((r) => r.reconciliation_status === "amount_mismatch").length ?? 0;
  const okCount = rows?.filter((r) => r.reconciliation_status === "ok").length ?? 0;

  const statusBadge = (status: string) => {
    switch (status) {
      case "ok":
        return <Badge variant="default" className="bg-green-600"><CheckCircle className="h-3 w-3 mr-1" />OK</Badge>;
      case "missing":
        return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Fehlend</Badge>;
      case "amount_mismatch":
        return <Badge variant="secondary" className="bg-amber-500 text-white"><AlertTriangle className="h-3 w-3 mr-1" />Abweichung</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const fmt = (n: number | null) => n != null ? new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n) : "–";

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">FiBu Reconciliation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Abgleich zwischen Rechnungen und Buchhaltungsereignissen (Phase 1 – nur Monitoring)
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Aktualisieren
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <Card
            className={`cursor-pointer transition-shadow ${filter === "all" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter("all")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Gesamt</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalCount}</p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-shadow ${filter === "ok" ? "ring-2 ring-green-500" : ""}`}
            onClick={() => setFilter("ok")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-green-600 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" /> Konsistent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{okCount}</p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-shadow ${filter === "missing" ? "ring-2 ring-destructive" : ""}`}
            onClick={() => setFilter("missing")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-destructive flex items-center gap-1">
                <XCircle className="h-4 w-4" /> Ohne FiBu-Event
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-destructive">{missingCount}</p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-shadow ${filter === "amount_mismatch" ? "ring-2 ring-amber-500" : ""}`}
            onClick={() => setFilter("amount_mismatch")}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> Betragsabweichung
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-amber-600">{mismatchCount}</p>
            </CardContent>
          </Card>
        </div>

        {/* Data Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">Lade Daten…</div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                {filter === "all" ? "Keine Rechnungen vorhanden" : "Keine Einträge mit diesem Status"}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Status</TableHead>
                      <TableHead>Rechnungsnr.</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead>Kunde</TableHead>
                      <TableHead className="text-right">RE Netto</TableHead>
                      <TableHead className="text-right">RE Brutto</TableHead>
                      <TableHead className="text-right">FiBu Netto</TableHead>
                      <TableHead className="text-right">FiBu Brutto</TableHead>
                      <TableHead className="text-right">Δ Netto</TableHead>
                      <TableHead className="text-center">Events</TableHead>
                      <TableHead>Event-Typen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((row) => (
                      <TableRow
                        key={row.invoice_id}
                        className={
                          row.reconciliation_status === "missing"
                            ? "bg-destructive/5"
                            : row.reconciliation_status === "amount_mismatch"
                            ? "bg-amber-500/5"
                            : ""
                        }
                      >
                        <TableCell>{statusBadge(row.reconciliation_status)}</TableCell>
                        <TableCell className="font-mono text-xs">{row.invoice_number}</TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(row.invoice_date), "dd.MM.yyyy", { locale: de })}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{row.customer_name}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(row.invoice_net)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(row.invoice_gross)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(row.fibu_net_total)}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{fmt(row.fibu_gross_total)}</TableCell>
                        <TableCell className={`text-right font-mono text-sm ${Math.abs(row.delta_net) > 0.01 ? "text-destructive font-semibold" : ""}`}>
                          {fmt(row.delta_net)}
                        </TableCell>
                        <TableCell className="text-center">{row.fibu_event_count}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                          {row.fibu_event_types?.join(", ") || "–"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
