/**
 * HFX-Nummer-Lookup / Diagnose-Seite
 *
 * Zweck: Schnelle Sicht auf alle Datensätze (Lead + Verträge) zu einer
 * HFX-Nummer. Zeigt Mail-1 / Mail-2 Status, Stripe-IDs, Adressfelder.
 *
 * Bewusst als LISTE — eine HFX-Nummer kann mehrfach in `contracts` vorkommen
 * (Doubletten bei Schnellklick, Korrektur-Verträge, Addenda).
 */
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Search, AlertCircle, GitMerge } from "lucide-react";
import { format } from "date-fns";

interface LookupResult {
  lead: any | null;
  contracts: any[];
  customer: any | null;
}

const fmt = (v: any) => {
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
    try { return format(new Date(v), "yyyy-MM-dd HH:mm"); } catch { return v; }
  }
  return String(v);
};

export default function ContractInspect() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [mergeLoading, setMergeLoading] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergePlan, setMergePlan] = useState<any | null>(null);

  const handleMergeDiagnose = async () => {
    setMergeLoading(true);
    setMergeError(null);
    setMergePlan(null);
    try {
      const { data, error } = await supabase.functions.invoke("contract-merge-diagnose", {
        body: { hfx_customer_number: query.trim() },
      });
      if (error) throw error;
      setMergePlan(data);
    } catch (err: any) {
      setMergeError(err.message || String(err));
    } finally {
      setMergeLoading(false);
    }
  };

  const handleLookup = async () => {
    const hfx = query.trim();
    if (!hfx) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setMergePlan(null);
    setMergeError(null);
    try {
      const { data, error } = await supabase.functions.invoke("contract-inspect-lookup", {
        body: { hfx_customer_number: hfx },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setResult({
        lead: data?.lead ?? null,
        contracts: data?.contracts ?? [],
        customer: data?.customer ?? null,
      });
    } catch (err: any) {
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      <h1 className="text-2xl font-semibold mb-2">Vertrags-Diagnose</h1>
      <p className="text-sm text-muted-foreground mb-4">
        HFX-Nummer eingeben — zeigt Lead, alle Verträge (Doubletten möglich) und Customer-Datensatz.
      </p>

      <div className="flex gap-2 mb-6">
        <Input
          placeholder="HFX-I01101"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleLookup()}
          className="max-w-sm"
        />
        <Button onClick={handleLookup} disabled={loading || !query.trim()}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Search className="h-4 w-4 mr-2" />}
          Lookup
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive mb-4">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* LEAD */}
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-3">Lead {result.lead ? "" : "— nicht gefunden"}</h2>
            {result.lead ? (
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                {Object.entries(result.lead).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-mono text-xs break-all">{fmt(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Kein Lead-Eintrag mit dieser HFX-Nummer.</p>
            )}
          </Card>

          {/* CUSTOMER */}
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-3">Customer {result.customer ? "" : "— nicht gefunden"}</h2>
            {result.customer ? (
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                {Object.entries(result.customer).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-xs text-muted-foreground">{k}</dt>
                    <dd className="font-mono text-xs break-all">{fmt(v)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Kein Customer-Eintrag.</p>
            )}
          </Card>

          {/* CONTRACTS */}
          <Card className="p-4">
            <h2 className="text-lg font-semibold mb-3">
              Verträge ({result.contracts.length})
              {result.contracts.length > 1 && (
                <span className="ml-2 text-xs font-normal text-warning">⚠ Doublette / mehrere Datensätze</span>
              )}
            </h2>
            {result.contracts.length > 1 && (
              <div className="mb-4">
                <Button size="sm" variant="outline" onClick={handleMergeDiagnose} disabled={mergeLoading}>
                  {mergeLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <GitMerge className="h-4 w-4 mr-2" />}
                  Merge-Plan anzeigen
                </Button>
                {mergeError && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" /> {mergeError}
                  </div>
                )}
                {mergePlan && (
                  <div className="mt-3 space-y-3">
                    {mergePlan.merge_recommendation ? (
                      <>
                        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                          <div><span className="font-semibold">Winner:</span> <span className="font-mono text-xs">{mergePlan.merge_recommendation.winner_id}</span></div>
                          <div><span className="font-semibold">Loser:</span> <span className="font-mono text-xs">{(mergePlan.merge_recommendation.loser_ids || []).join(", ")}</span></div>
                          <div className="mt-2"><span className="font-semibold">Begründung:</span></div>
                          <ul className="list-disc ml-5 text-xs">
                            {(mergePlan.merge_recommendation.reasons || []).map((r: string, i: number) => <li key={i}>{r}</li>)}
                          </ul>
                          {(mergePlan.merge_recommendation.warnings || []).length > 0 && (
                            <div className="mt-2 text-warning">
                              <span className="font-semibold">⚠ Warnungen:</span>
                              <ul className="list-disc ml-5 text-xs">
                                {mergePlan.merge_recommendation.warnings.map((w: string, i: number) => <li key={i}>{w}</li>)}
                              </ul>
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-semibold mb-1">SQL-Plan (in dieser Reihenfolge ausführen):</div>
                          <pre className="text-xs font-mono bg-muted/50 p-3 rounded border overflow-x-auto whitespace-pre-wrap">
{(mergePlan.merge_recommendation.actions || []).map((a: any) => `-- step ${a.step} (${a.operation} ${a.table}, ${a.row_count} row${a.row_count !== 1 ? "s" : ""})\n${a.sql}`).join("\n\n")}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Kein Merge nötig.</p>
                    )}
                    <details className="text-xs">
                      <summary className="cursor-pointer text-muted-foreground">Roh-JSON</summary>
                      <pre className="mt-2 font-mono bg-muted/30 p-3 rounded border overflow-x-auto">{JSON.stringify(mergePlan, null, 2)}</pre>
                    </details>
                  </div>
                )}
              </div>
            )}
            {result.contracts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Verträge.</p>
            ) : (
              <div className="space-y-4">
                {result.contracts.map((c, i) => (
                  <div key={c.id} className="border rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-muted-foreground">#{i + 1}</span>
                      <span className="font-medium">{c.product_name}</span>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted">{c.status}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{c.id}</span>
                    </div>
                    <dl className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm">
                      {Object.entries(c).map(([k, v]) => (
                        <div key={k}>
                          <dt className="text-xs text-muted-foreground">{k}</dt>
                          <dd className="font-mono text-xs break-all">{fmt(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
