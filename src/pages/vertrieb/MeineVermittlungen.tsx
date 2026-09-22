/**
 * Meine Vermittlungen — Schritt 3b.
 *
 * Nur-Lese-Ansicht für sales_partner. Datenquelle ausschließlich die
 * SECURITY-DEFINER-RPC `get_my_referred_leads()` (parameterlos, Vermittler
 * aus auth.uid()). Es gibt bewusst KEINE Policy auf `leads` für Vermittler,
 * damit keine vollständige Lead-Zeile (nachricht, assigned_to, qodia_*)
 * sichtbar wird.
 *
 * Das RPC-Feld `provisionshinweis` wird bewusst NICHT angezeigt.
 */
import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_STATUS_CONFIG, type LeadStatus } from "@/lib/statusConfig";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

interface ReferredLead {
  praxis_name: string | null;
  ort: string | null;
  lead_status: string | null;
  erfasst_am: string | null;
  vertrag_entstanden: boolean | null;
}

// Lokale Ergänzung in dieser Ansicht (kein Rohwert-Fallback):
// unbekannter Status → "—"
const LOCAL_STATUS_LABELS: Record<string, string> = {
  kunde: "Kunde",
  kein_abschluss: "Kein Abschluss",
};

function statusLabel(status: string | null): string {
  if (!status) return "—";
  const local = LOCAL_STATUS_LABELS[status];
  if (local) return local;
  const cfg = LEAD_STATUS_CONFIG[status as LeadStatus];
  return cfg ? cfg.label : "—";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

export default function MeineVermittlungen() {
  const [rows, setRows] = useState<ReferredLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: rpcError } = await supabase.rpc("get_my_referred_leads");
      if (!active) return;
      if (rpcError) {
        setError(true);
      } else {
        setRows((data as ReferredLead[]) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <MainLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Meine Vermittlungen</h1>
          <p className="text-sm text-muted-foreground">
            Interessenten, die Sie vermittelt haben.
          </p>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center p-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="p-6 text-sm text-muted-foreground">
                Diese Übersicht steht nur Vertriebspartnern zur Verfügung.
              </div>
            ) : rows.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                Sie haben noch keine Interessenten vermittelt.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Praxis</TableHead>
                    <TableHead>Ort</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Erfasst am</TableHead>
                    <TableHead>Vertrag</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, idx) => (
                    <TableRow key={`${row.praxis_name ?? ""}-${row.erfasst_am ?? ""}-${idx}`}>
                      <TableCell>{row.praxis_name || "—"}</TableCell>
                      <TableCell>{row.ort || "—"}</TableCell>
                      <TableCell>{statusLabel(row.lead_status)}</TableCell>
                      <TableCell>{formatDate(row.erfasst_am)}</TableCell>
                      <TableCell>{row.vertrag_entstanden ? "Ja" : "Nein"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
