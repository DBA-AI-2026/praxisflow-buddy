import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, Download, Trash2, Copy, RefreshCw } from "lucide-react";

interface LeadRow {
  id: string;
  hfx_customer_number: string | null;
  praxis_name: string | null;
  vorname: string | null;
  nachname: string | null;
  email: string | null;
  plz: string | null;
  status: string | null;
  source: string | null;
  created_at: string;
  qodia_synced: boolean | null;
  [k: string]: unknown;
}

export default function LeadCleanup() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [loading, setLoading] = useState(true);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [contractHfx, setContractHfx] = useState<Set<string>>(new Set());
  const [convertedLeadIds, setConvertedLeadIds] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [resultHfx, setResultHfx] = useState<string[]>([]);
  const [resultQodia, setResultQodia] = useState<string[]>([]);

  const loadLeads = async () => {
    setLoading(true);
    setSelected(new Set());
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as LeadRow[];
    setLeads(rows);
    const hfxNumbers = rows.map((l) => l.hfx_customer_number).filter(Boolean) as string[];
    const ids = rows.map((l) => l.id);
    if (hfxNumbers.length > 0) {
      const { data: contracts } = await supabase
        .from("contracts")
        .select("hfx_customer_number")
        .in("hfx_customer_number", hfxNumbers);
      setContractHfx(new Set((contracts ?? []).map((c) => c.hfx_customer_number).filter(Boolean) as string[]));
    } else {
      setContractHfx(new Set());
    }
    if (ids.length > 0) {
      const { data: praxen } = await supabase
        .from("praxen")
        .select("converted_from_lead_id")
        .in("converted_from_lead_id", ids);
      setConvertedLeadIds(new Set((praxen ?? []).map((p) => p.converted_from_lead_id).filter(Boolean) as string[]));
    } else {
      setConvertedLeadIds(new Set());
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) loadLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter((l) =>
      [l.praxis_name, l.vorname, l.nachname, l.email, l.hfx_customer_number, l.plz, l.status, l.source]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [leads, search]);

  const allFilteredSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  const toggleAll = () => {
    const next = new Set(selected);
    if (allFilteredSelected) {
      filtered.forEach((l) => next.delete(l.id));
    } else {
      filtered.forEach((l) => next.add(l.id));
    }
    setSelected(next);
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const selectedRows = useMemo(() => leads.filter((l) => selected.has(l.id)), [leads, selected]);

  const downloadJson = async (): Promise<boolean> => {
    try {
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const payload = JSON.stringify(selectedRows, null, 2);
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `lead-cleanup-recovery-${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // wait a tick to ensure browser handled the click
      await new Promise((r) => setTimeout(r, 250));
      URL.revokeObjectURL(url);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const runDelete = async () => {
    setBusy(true);
    const ok = await downloadJson();
    if (!ok) {
      toast({ title: "Abbruch", description: "Export-Download fehlgeschlagen — kein Löschen.", variant: "destructive" });
      setBusy(false);
      return;
    }
    const ids = selectedRows.map((l) => l.id);
    const { error } = await supabase.from("leads").delete().in("id", ids);
    if (error) {
      toast({ title: "Fehler beim Löschen", description: error.message, variant: "destructive" });
      setBusy(false);
      return;
    }
    const hfxList = selectedRows.map((l) => l.hfx_customer_number).filter(Boolean) as string[];
    const qodiaList = selectedRows.filter((l) => l.qodia_synced && l.hfx_customer_number).map((l) => l.hfx_customer_number as string);
    setResultHfx(hfxList);
    setResultQodia(qodiaList);
    setConfirmOpen(false);
    setResultOpen(true);
    setBusy(false);
    toast({ title: "Gelöscht", description: `${ids.length} Leads gelöscht.` });
    await loadLeads();
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => toast({ title: "Kopiert" }),
      () => toast({ title: "Kopieren fehlgeschlagen", variant: "destructive" }),
    );
  };

  if (roleLoading) return <div className="p-8">Lade…</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 text-warning mt-1" />
        <div>
          <h1 className="text-2xl font-bold">Test-Leads aufräumen</h1>
          <p className="text-sm text-muted-foreground">
            Temporäres Admin-Tool. Auswahl erfolgt manuell. Beim Löschen wird ein vollständiger JSON-Export der Datensätze
            erzeugt; ohne erfolgreichen Download wird nichts gelöscht.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suche (Praxis, Name, E-Mail, HFX, PLZ, Status, Source)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <Button variant="outline" size="sm" onClick={loadLeads} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-1" /> Neu laden
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {selected.size} ausgewählt / {filtered.length} sichtbar / {leads.length} gesamt
          </span>
          <Button
            variant="destructive"
            size="sm"
            disabled={selected.size === 0 || busy}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Auswahl löschen
          </Button>
        </div>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={allFilteredSelected} onCheckedChange={toggleAll} aria-label="Alle auswählen" />
              </TableHead>
              <TableHead>HFX</TableHead>
              <TableHead>Praxis / Name</TableHead>
              <TableHead>E-Mail</TableHead>
              <TableHead>PLZ</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead>Erstellt</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Lade…
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                  Keine Leads.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((l) => {
                const hasContract = !!(l.hfx_customer_number && contractHfx.has(l.hfx_customer_number));
                const isCustomer = l.status === "kunde" || convertedLeadIds.has(l.id);
                return (
                  <TableRow key={l.id} data-state={selected.has(l.id) ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox checked={selected.has(l.id)} onCheckedChange={() => toggleOne(l.id)} />
                    </TableCell>
                    <TableCell className="font-mono text-xs">{l.hfx_customer_number ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{l.praxis_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {[l.vorname, l.nachname].filter(Boolean).join(" ") || "—"}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{l.email ?? "—"}</TableCell>
                    <TableCell className="text-xs">{l.plz ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{l.status ?? "—"}</Badge></TableCell>
                    <TableCell className="text-xs">{l.source ?? "—"}</TableCell>
                    <TableCell className="space-x-1">
                      {isCustomer && <Badge variant="destructive">bereits Kunde</Badge>}
                      {hasContract && <Badge variant="destructive">hat Vertrag</Badge>}
                      {l.qodia_synced && <Badge variant="secondary">Qodia</Badge>}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(l.created_at).toLocaleDateString("de-DE")}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{selected.size} Lead(s) endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p>
                  Vor dem Löschen wird automatisch ein JSON-Recovery-Export aller ausgewählten Datensätze heruntergeladen.
                  Schlägt der Download fehl, wird nichts gelöscht.
                </p>
                <p className="text-warning">
                  Hinweis: Verknüpfte Audit-Einträge in <code>plz_assignment_log</code> und <code>customer_events</code>{" "}
                  bleiben bewusst als historische Spur erhalten und werden nicht mitgelöscht.
                </p>
                {selectedRows.some((l) => l.hfx_customer_number && contractHfx.has(l.hfx_customer_number)) && (
                  <p className="text-destructive">
                    Achtung: Mindestens ein ausgewählter Lead hat einen verknüpften Vertrag. Verträge werden NICHT mitgelöscht
                    und bleiben mit ihrer HFX-Nummer bestehen.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runDelete();
              }}
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Download className="h-4 w-4 mr-1" />
              Export & Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={resultOpen} onOpenChange={setResultOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Löschung abgeschlossen</DialogTitle>
            <DialogDescription>
              {resultHfx.length} HFX-Nummern wurden gelöscht. Bei Bedarf für Qodia-Weiterleitung kopieren.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">Alle gelöschten HFX-Nummern</label>
                <Button variant="outline" size="sm" onClick={() => copyText(resultHfx.join("\n"))}>
                  <Copy className="h-4 w-4 mr-1" /> Kopieren
                </Button>
              </div>
              <Textarea readOnly value={resultHfx.join("\n")} rows={6} className="font-mono text-xs" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium">Qodia-Weiterleitungsliste ({resultQodia.length})</label>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={resultQodia.length === 0}
                  onClick={() => copyText(resultQodia.join("\n"))}
                >
                  <Copy className="h-4 w-4 mr-1" /> Kopieren
                </Button>
              </div>
              <Textarea
                readOnly
                value={resultQodia.join("\n")}
                rows={4}
                className="font-mono text-xs"
                placeholder="Keine der gelöschten Leads war bei Qodia registriert."
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setResultOpen(false)}>Schließen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
