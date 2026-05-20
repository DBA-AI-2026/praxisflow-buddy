/**
 * QodiaLiveAbrufDialog
 * --------------------
 * Ad-hoc Live-Abfrage direkt bei Qodia (read-through, kein DB-Write).
 *
 * Bewusst als Dialog (nicht Sheet) modelliert, um es visuell vom
 * vertragsbezogenen Detail-Drawer (QodiaVerbrauchDetailSheet) abzugrenzen:
 *   - Dialog  = globale Ad-hoc-Abfrage
 *   - Sheet   = Detail eines Kunden
 *
 * Die reguläre Synchronisation läuft 2× täglich via Cron (qodia-auto-usage-sync),
 * d.h. die DB-basierte Dashboard-Tabelle ist tagesaktuell. Dieser Dialog
 * existiert nur für Sonderfälle (Live-Verifikation, ad-hoc Detail-Filter).
 */
import { useCallback, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { RefreshCw, AlertCircle } from "lucide-react";

import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface UsageResult {
  hfx_customer_number: string;
  customer_name: string;
  email: string;
  error: string | null;
  usage: {
    rechnungscheck?: number;
    rechnungscheck_mini?: number;
    rechnungscheck_standard?: number;
  } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QodiaLiveAbrufDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const today = format(new Date(), "yyyy-MM-dd");
  const firstOfMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [hfxFilter, setHfxFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UsageResult[] | null>(null);

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setResults(null);
    try {
      const body: Record<string, string> = { startDate, endDate };
      if (hfxFilter.trim()) body.hfx_customer_number = hfxFilter.trim();

      const { data, error } = await supabase.functions.invoke("qodia-usage-query", { body });
      if (error) throw new Error(error.message || "Fehler beim Abruf");
      setResults(data?.results ?? []);
    } catch (err) {
      toast({
        title: "Fehler beim Live-Abruf",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, hfxFilter, toast]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Frische Daten von Qodia abrufen</DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block">
              Direkter Live-Abruf bei Qodia, ohne Schreibzugriff auf die Datenbank.
            </span>
            <span className="block text-xs">
              Reguläre Synchronisation läuft 2× täglich via Cron — die Daten auf der
              Hauptseite sind tagesaktuell.
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Filter */}
        <div className="flex flex-wrap gap-3 items-end border-b pb-4">
          <div className="space-y-1.5">
            <Label>Startdatum</Label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Enddatum</Label>
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              max={today}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label>HFX-Nr. (optional)</Label>
            <Input
              placeholder="z. B. HFX-I01070"
              value={hfxFilter}
              onChange={(e) => setHfxFilter(e.target.value)}
              className="w-44"
            />
          </div>
          <Button onClick={fetchUsage} disabled={loading} className="gap-2">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Lädt…" : "Abrufen"}
          </Button>
        </div>

        {/* Results */}
        {loading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        )}

        {!loading && results && results.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Keine Kunden gefunden.
          </div>
        )}

        {!loading && results && results.length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HFX-Nr.</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead className="text-right">Intensiv</TableHead>
                  <TableHead className="text-right">Mini</TableHead>
                  <TableHead className="text-right">Standard</TableHead>
                  <TableHead className="text-right font-semibold">Gesamt</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((row) => {
                  const intensiv = row.usage?.rechnungscheck ?? 0;
                  const mini = row.usage?.rechnungscheck_mini ?? 0;
                  const standard = row.usage?.rechnungscheck_standard ?? 0;
                  const total = intensiv + mini + standard;

                  return (
                    <TableRow key={row.hfx_customer_number + row.email}>
                      <TableCell className="font-mono text-xs">
                        {row.hfx_customer_number}
                      </TableCell>
                      <TableCell className="font-medium">{row.customer_name}</TableCell>
                      {row.error ? (
                        <TableCell
                          colSpan={4}
                          className="text-muted-foreground text-xs italic"
                        >
                          <span className="flex items-center gap-1.5">
                            <AlertCircle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                            {row.error}
                          </span>
                        </TableCell>
                      ) : (
                        <>
                          <TableCell className="text-right tabular-nums">
                            {intensiv || <span className="text-muted-foreground">–</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {mini || <span className="text-muted-foreground">–</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {standard || <span className="text-muted-foreground">–</span>}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-semibold">
                            {total}
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        {row.error ? (
                          <Badge
                            variant="outline"
                            className="border-warning/50 text-warning bg-warning/10 text-xs"
                          >
                            Fehler
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-success/50 text-success bg-success/10 text-xs"
                          >
                            OK
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
