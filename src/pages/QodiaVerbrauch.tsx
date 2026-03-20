import { useState, useCallback } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw, AlertCircle, TrendingUp } from "lucide-react";
import { format, startOfMonth } from "date-fns";

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
  startDate?: string;
  endDate?: string;
}

export default function QodiaVerbrauch() {
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
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        toast({
          title: "Nicht angemeldet",
          variant: "destructive",
        });
        return;
      }

      const body: Record<string, string> = {
        startDate,
        endDate,
      };
      if (hfxFilter.trim()) {
        body.hfx_customer_number = hfxFilter.trim();
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const res = await fetch(
        `${supabaseUrl}/functions/v1/qodia-usage-query`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Abruf");
      }

      setResults(data.results ?? []);
    } catch (err) {
      toast({
        title: "Fehler beim Abruf",
        description: String(err),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, hfxFilter, toast]);

  const totalSuccess = results?.filter((r) => !r.error).length ?? 0;
  const totalErrors = results?.filter((r) => r.error).length ?? 0;
  const grandTotal =
    results?.reduce((sum, r) => {
      if (!r.usage) return sum;
      return (
        sum +
        (r.usage.rechnungscheck ?? 0) +
        (r.usage.rechnungscheck_mini ?? 0) +
        (r.usage.rechnungscheck_standard ?? 0)
      );
    }, 0) ?? 0;

  return (
    <MainLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Qodia-Verbrauch
            </h1>
            <p className="text-sm text-muted-foreground">
              Live-Verbrauchsabfrage aller aktiven HFX GOÄ Kunden
            </p>
          </div>
        </div>

        {/* Filter Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Abfrage-Parameter</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1.5">
                <Label>Startdatum</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Enddatum</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  max={today}
                  className="w-44"
                />
              </div>
              <div className="space-y-1.5">
                <Label>HFX-Kundennummer (optional)</Label>
                <Input
                  placeholder="z. B. HFX-I00042"
                  value={hfxFilter}
                  onChange={(e) => setHfxFilter(e.target.value)}
                  className="w-52"
                />
              </div>
              <Button onClick={fetchUsage} disabled={loading} className="gap-2">
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
                {loading ? "Wird abgerufen…" : "Verbrauch abrufen"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {results && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5">
                <div className="text-2xl font-bold text-foreground">
                  {results.length}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Kunden abgefragt
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-2xl font-bold text-foreground">
                  {grandTotal}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Vorgänge gesamt
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-2xl font-bold text-green-600">
                  {totalSuccess}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Erfolgreich
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="text-2xl font-bold text-destructive">
                  {totalErrors}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Fehler / kein Account
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </CardContent>
          </Card>
        )}

        {/* Results Table */}
        {!loading && results && results.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Keine Kunden gefunden – prüfe den HFX-Filter oder ob aktive
              HFX-GOÄ-Verträge vorhanden sind.
            </CardContent>
          </Card>
        )}

        {!loading && results && results.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HFX-Nr.</TableHead>
                    <TableHead>Kunde</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead className="text-right">
                      Intensiv
                    </TableHead>
                    <TableHead className="text-right">Mini</TableHead>
                    <TableHead className="text-right">Standard</TableHead>
                    <TableHead className="text-right font-semibold">
                      Gesamt
                    </TableHead>
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
                        <TableCell className="font-medium">
                          {row.customer_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {row.email}
                        </TableCell>
                        {row.error ? (
                          <>
                            <TableCell
                              colSpan={4}
                              className="text-muted-foreground text-sm italic"
                            >
                              <span className="flex items-center gap-1.5">
                                <AlertCircle className="h-3.5 w-3.5 text-warning flex-shrink-0" />
                                {row.error}
                              </span>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="text-right tabular-nums">
                              {intensiv > 0 ? (
                                <span className="font-medium">{intensiv}</span>
                              ) : (
                                <span className="text-muted-foreground">–</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {mini > 0 ? (
                                <span className="font-medium">{mini}</span>
                              ) : (
                                <span className="text-muted-foreground">–</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {standard > 0 ? (
                                <span className="font-medium">{standard}</span>
                              ) : (
                                <span className="text-muted-foreground">–</span>
                              )}
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
                              className="border-green-500/50 text-green-600 bg-green-50 text-xs"
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
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
