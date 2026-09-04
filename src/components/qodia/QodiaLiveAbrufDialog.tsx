/**
 * QodiaLiveAbrufDialog
 * --------------------
 * Ad-hoc Live-Abfrage direkt bei Qodia.
 *
 * Zwei Modi:
 *   - Kunden        : read-through (kein DB-Write), freies Datumsfenster.
 *   - Interessenten : source: "lead" — feste Fenster (12 Monate / laufender Monat),
 *                     serverseitiges Rückschreiben auf public.leads mit exakt
 *                     derselben Kohorten-/Delta-Logik wie der 05:30-Cron.
 *                     Danach wird ["journey-leads"] invalidiert, damit die
 *                     Interessenten-Liste den Rückschreibe-Stand zeigt.
 *
 * Bewusst als Dialog (nicht Sheet) modelliert, um es visuell vom
 * vertragsbezogenen Detail-Drawer (QodiaVerbrauchDetailSheet) abzugrenzen.
 */
import { useCallback, useState } from "react";
import { format, startOfMonth } from "date-fns";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { useLeadActivityThresholds } from "@/hooks/useAppSettings";
import { AmpelDot, computeLeadAmpel } from "@/components/pipeline/LeadUsageCell";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

interface LeadUsageResult {
  lead_id: string;
  hfx_customer_number: string | null;
  customer_name: string;
  email: string;
  error: string | null;
  error_code: "no_account" | "api_error" | "network_error" | null;
  count_total: number | null;
  count_month: number | null;
  last_usage_at: string | null;
  /** created_at wird für die Alters-Kopplung der Ampel (total = 0) benötigt. */
  created_at?: string | null;
}

type Mode = "contract" | "lead";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Startmodus, Default: Kunden. */
  initialMode?: Mode;
}

export function QodiaLiveAbrufDialog({ open, onOpenChange, initialMode = "contract" }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: leadThresholds = { yellow_days: 7, red_days: 14 } } = useLeadActivityThresholds();
  const today = format(new Date(), "yyyy-MM-dd");
  const firstOfMonth = format(startOfMonth(new Date()), "yyyy-MM-dd");

  const [mode, setMode] = useState<Mode>(initialMode);
  const [startDate, setStartDate] = useState(firstOfMonth);
  const [endDate, setEndDate] = useState(today);
  const [hfxFilter, setHfxFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UsageResult[] | null>(null);
  const [leadResults, setLeadResults] = useState<LeadUsageResult[] | null>(null);
  const [excludedByContract, setExcludedByContract] = useState<number>(0);

  const switchMode = (m: Mode) => {
    setMode(m);
    setResults(null);
    setLeadResults(null);
  };

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setResults(null);
    setLeadResults(null);
    try {
      const filter = hfxFilter.trim();

      if (mode === "lead") {
        const body: Record<string, string> = { source: "lead" };
        if (filter) body.hfx_customer_number = filter;
        const { data, error } = await supabase.functions.invoke("qodia-usage-query", { body });
        if (error) throw new Error(error.message || "Fehler beim Abruf");
        setLeadResults((data?.results as LeadUsageResult[]) ?? []);
        setExcludedByContract(Number(data?.excluded_by_contract ?? 0));
        // Rückschreibe-Stand in der Interessenten-Liste + Kunden-Dialog sichtbar machen
        qc.invalidateQueries({ queryKey: ["journey-leads"] });
        qc.invalidateQueries({ queryKey: ["kunden-dialog-lead"] });
        return;
      }

      const body: Record<string, string> = { startDate, endDate };
      if (filter) body.hfx_customer_number = filter;
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
  }, [mode, startDate, endDate, hfxFilter, toast, qc]);

  const isLead = mode === "lead";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Frische Daten von Qodia abrufen</DialogTitle>
          <DialogDescription className="space-y-1">
            {isLead ? (
              <>
                <span className="block">
                  Live-Abruf für Interessenten in der Testphase. Die Werte werden direkt auf den
                  Interessenten zurückgeschrieben (gleiche Logik wie der nächtliche Abgleich um 05:30 UTC).
                </span>
                <span className="block text-xs">
                  Feste Fenster: letzte 12 Monate (ab Lead-Anlage) und laufender Monat.
                </span>
              </>
            ) : (
              <>
                <span className="block">
                  Direkter Live-Abruf bei Qodia, ohne Schreibzugriff auf die Datenbank.
                </span>
                <span className="block text-xs">
                  Reguläre Synchronisation läuft 2× täglich via Cron — die Daten auf der
                  Hauptseite sind tagesaktuell.
                </span>
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => switchMode(v as Mode)}>
          <TabsList>
            <TabsTrigger value="contract">Kunden</TabsTrigger>
            <TabsTrigger value="lead">Interessenten</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filter */}
        <div className="flex flex-wrap gap-3 items-end border-b pb-4">
          {!isLead && (
            <>
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
            </>
          )}
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
            {loading ? "Lädt…" : isLead ? "Abrufen & speichern" : "Abrufen"}
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

        {/* ── Kunden ─────────────────────────────────────────────────────── */}
        {!loading && !isLead && results && results.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Keine Kunden gefunden.
          </div>
        )}

        {!loading && !isLead && results && results.length > 0 && (
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

        {/* ── Interessenten ──────────────────────────────────────────────── */}
        {!loading && isLead && leadResults && leadResults.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Keine Interessenten in der Testphasen-Kohorte gefunden.
            {excludedByContract > 0 && (
              <span className="block text-xs mt-1">
                {excludedByContract} durch bestehenden Vertrag ausgeschlossen.
              </span>
            )}
          </div>
        )}

        {!loading && isLead && leadResults && leadResults.length > 0 && (
          <div className="space-y-2">
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HFX-Nr.</TableHead>
                    <TableHead>Interessent</TableHead>
                    <TableHead className="text-right">12 Monate</TableHead>
                    <TableHead className="text-right">Monat</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadResults.map((row) => {
                    const hasData = !row.error && row.count_total !== null;
                    const ampel = hasData && row.created_at
                      ? computeLeadAmpel(
                          {
                            created_at: row.created_at,
                            qodia_invoice_count_total: row.count_total,
                            qodia_invoice_count_month: row.count_month,
                            qodia_last_usage_at: row.last_usage_at,
                            qodia_usage_synced_at: new Date().toISOString(),
                            qodia_usage_error: null,
                          },
                          leadThresholds,
                        )
                      : null;
                    return (
                      <TableRow key={row.lead_id}>
                        <TableCell className="font-mono text-xs">
                          {row.hfx_customer_number ?? "–"}
                        </TableCell>
                        <TableCell className="font-medium">{row.customer_name}</TableCell>
                        {hasData ? (
                          <>
                            <TableCell className="text-right tabular-nums font-semibold">
                              {row.count_total}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {row.count_month ?? 0}
                            </TableCell>
                          </>
                        ) : (
                          <TableCell colSpan={2} className="text-muted-foreground text-xs italic">
                            <span className="flex items-center gap-1.5">
                              <AlertCircle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                              {row.error_code === "no_account" ? "Keine Daten abrufbar" : (row.error ?? "Fehler")}
                            </span>
                          </TableCell>
                        )}
                        <TableCell>
                          {hasData ? (
                            <span className="inline-flex items-center gap-1.5 text-xs">
                              {ampel && <AmpelDot ampel={ampel} size="md" />}
                              {ampel?.label ?? "OK"}
                            </span>
                          ) : (
                            <Badge
                              variant="outline"
                              className="border-warning/50 text-warning bg-warning/10 text-xs"
                            >
                              {row.error_code === "no_account" ? "Kein Account" : "Fehler"}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              {leadResults.length} Interessent(en) abgeglichen
              {excludedByContract > 0 && `, ${excludedByContract} durch bestehenden Vertrag ausgeschlossen`}.
              Werte wurden gespeichert.
            </p>
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
