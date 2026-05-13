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
import { Loader2, Search, AlertCircle } from "lucide-react";
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

  const handleLookup = async () => {
    const hfx = query.trim();
    if (!hfx) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const [leadRes, contractsRes, customerRes] = await Promise.all([
        supabase.from("leads").select("*").eq("hfx_customer_number", hfx).maybeSingle(),
        supabase.from("contracts").select("*").eq("hfx_customer_number", hfx).order("created_at", { ascending: false }),
        supabase.from("customers").select("*").eq("hfx_customer_number", hfx).maybeSingle(),
      ]);
      if (leadRes.error) throw leadRes.error;
      if (contractsRes.error) throw contractsRes.error;
      if (customerRes.error) throw customerRes.error;
      setResult({
        lead: leadRes.data,
        contracts: contractsRes.data || [],
        customer: customerRes.data,
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
