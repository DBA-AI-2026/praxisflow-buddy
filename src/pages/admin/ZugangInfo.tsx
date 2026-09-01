/**
 * /admin/zugang-info — Einrichtungs-Mail „Zugang einrichten" (GOÄ).
 *
 * Bauplan analog src/pages/admin/Kampagne.tsx:
 *   1. Anhang (PDF verwalten)  2. Dry-Run  3. Testmail (Canary)  4. Versand
 *
 * Zielmenge ist eine eingegebene Liste von HFX-Nummern (eine pro Zeile
 * oder komma-getrennt). Solange kein PDF im Storage liegt, sind Canary und
 * Versand gesperrt — die Function würde ohnehin abbrechen (nie ohne Anhang).
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
import { toast } from "@/hooks/use-toast";
import { Loader2, Upload, FileText } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";

type Mode = "dry_run" | "canary" | "send";

const BUCKET = "email-assets";
const FOLDER = "zugang";
const FILE_NAME = "hfx-zugang-einrichten.pdf";
const FULL_PATH = `${FOLDER}/${FILE_NAME}`;
const MAX_BYTES = 1024 * 1024; // 1 MB

interface TargetRow {
  hfx_customer_number: string;
  lead_id: string | null;
  name: string | null;
  email: string | null;
  status: string | null;
  qodia_synced: boolean | null;
  found: boolean;
  last_zugang_info_at: string | null;
  last_credentials_at: string | null;
}

interface ResultRow {
  lead_id: string | null;
  hfx_customer_number: string;
  name: string;
  outcome: string;
  sent_to?: string | null;
  error?: string | null;
}

interface AssetInfo {
  name: string;
  size: number | null;
  updatedAt: string | null;
  url: string;
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("de-DE");
}

function parseNumbers(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

export default function ZugangInfo() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();

  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState<Mode | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [lastMode, setLastMode] = useState<Mode | null>(null);

  const [canaryTo, setCanaryTo] = useState("");
  const [canarySent, setCanarySent] = useState(false);
  const [dryRunDone, setDryRunDone] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [asset, setAsset] = useState<AssetInfo | null>(null);
  const [assetLoading, setAssetLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const loadAsset = useCallback(async () => {
    setAssetLoading(true);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(FOLDER, { search: FILE_NAME, limit: 100 });
    if (error) {
      setAsset(null);
      setAssetLoading(false);
      return;
    }
    const hit = (data ?? []).find((f) => f.name === FILE_NAME);
    if (!hit) {
      setAsset(null);
    } else {
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(FULL_PATH);
      setAsset({
        name: hit.name,
        size: (hit.metadata as any)?.size ?? null,
        updatedAt: (hit as any).updated_at ?? (hit as any).created_at ?? null,
        url: `${pub.publicUrl}?v=${Date.now()}`,
      });
    }
    setAssetLoading(false);
  }, []);

  useEffect(() => {
    void loadAsset();
  }, [loadAsset]);

  if (roleLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const numbers = parseNumbers(raw);

  const handleUpload = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast({
        title: "Nur PDF erlaubt",
        description: "Bitte eine Datei vom Typ application/pdf wählen.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      toast({
        title: "Datei zu groß",
        description: "Maximal 1 MB erlaubt.",
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(FULL_PATH, file, { upsert: true, contentType: "application/pdf" });
    setUploading(false);
    if (error) {
      toast({ title: "Upload fehlgeschlagen", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "PDF hochgeladen", description: `${FULL_PATH} wurde aktualisiert.` });
    await loadAsset();
  };

  const call = async (mode: Mode, extra: Record<string, unknown> = {}) => {
    return await supabase.functions.invoke("send-zugang-info", {
      body: { mode, hfx_numbers: numbers, ...extra },
    });
  };

  const runDryRun = async () => {
    setBusy("dry_run");
    setLastMode("dry_run");
    setResults([]);
    try {
      const { data, error } = await call("dry_run");
      if (error) throw error;
      setTargets(data?.targets ?? []);
      setDryRunDone(true);
      toast({
        title: "Dry-Run abgeschlossen",
        description: `${data?.count ?? 0} von ${numbers.length} Nummern gefunden.`,
      });
    } catch (err: any) {
      toast({ title: "Fehler", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const runCanary = async () => {
    const addr = canaryTo.trim();
    if (!addr) return;
    setBusy("canary");
    setLastMode("canary");
    try {
      const { data, error } = await call("canary", { canary_to: addr });
      if (error) throw error;
      setCanarySent(true);
      toast({
        title: "Testmail versendet",
        description: `Mail für ${data?.rendered_for ?? "—"} ging an ${addr}.`,
      });
    } catch (err: any) {
      toast({
        title: "Fehler beim Testversand",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const runSend = async () => {
    setBusy("send");
    setLastMode("send");
    try {
      const { data, error } = await call("send");
      if (error) throw error;
      setResults(data?.results ?? []);
      toast({
        title: "Versand abgeschlossen",
        description: `${data?.count ?? 0} Einträge verarbeitet.`,
      });
    } catch (err: any) {
      toast({ title: "Fehler", description: err?.message ?? String(err), variant: "destructive" });
    } finally {
      setBusy(null);
      setConfirmOpen(false);
    }
  };

  const hasAsset = !!asset;
  const foundCount = targets.filter((t) => t.found).length;
  const canCanary = hasAsset && numbers.length > 0 && canaryTo.trim().length > 0 && busy === null;
  const canSend = hasAsset && dryRunDone && canarySent && foundCount > 0 && busy === null;

  return (
    <MainLayout title="Zugang einrichten">
      <TooltipProvider delayDuration={150}>
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold">Einrichtungs-Mail „Zugang einrichten"</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Versand der Einrichtungs-Anleitung inkl. PDF-Anhang an ausgewählte
              HFX-Nummern. Der Versand ist wiederholbar; die Vorgeschichte wird
              im Dry-Run angezeigt.
            </p>
          </div>

          {/* Anhang */}
          <div className="border rounded-lg p-4 space-y-3">
            <div className="text-sm font-medium">Anhang (PDF)</div>
            {assetLoading ? (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Lade…
              </div>
            ) : asset ? (
              <div className="flex items-center gap-3 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-mono text-xs">{FULL_PATH}</span>
                <span className="text-muted-foreground">
                  {asset.size !== null ? `${Math.round(asset.size / 1024)} KB` : "—"}
                </span>
                <span className="text-muted-foreground">{fmtDate(asset.updatedAt)}</span>
                <a
                  className="text-primary underline"
                  href={asset.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Download
                </a>
              </div>
            ) : (
              <div className="text-sm text-destructive">
                Keine Datei hinterlegt. Ohne PDF wird nicht versendet.
              </div>
            )}
            <div className="flex items-center gap-2">
              <Label htmlFor="pdf-upload" className="sr-only">
                PDF hochladen
              </Label>
              <Input
                id="pdf-upload"
                type="file"
                accept="application/pdf"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void handleUpload(f);
                }}
                className="max-w-md"
              />
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Nur PDF, max. 1 MB. Die Datei wird unter <code>{FULL_PATH}</code>{" "}
              abgelegt und ersetzt eine vorhandene Version.
            </p>
          </div>

          {/* Zielmenge */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="text-sm font-medium">1. HFX-Nummern eingeben</div>
            <Textarea
              rows={5}
              placeholder={"HFX-I01070\nHFX-I01101"}
              value={raw}
              onChange={(e) => {
                setRaw(e.target.value);
                setDryRunDone(false);
                setCanarySent(false);
                setTargets([]);
                setResults([]);
              }}
              disabled={busy !== null}
              className="font-mono text-xs max-w-xl"
            />
            <div className="text-xs text-muted-foreground">
              {numbers.length} Nummer(n) erkannt.
            </div>
          </div>

          {/* Dry-Run */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="text-sm font-medium">2. Zielliste prüfen (Dry-Run)</div>
            <Button
              variant="outline"
              disabled={busy !== null || numbers.length === 0}
              onClick={runDryRun}
            >
              {busy === "dry_run" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Dry-Run ausführen
            </Button>
          </div>

          {/* Canary */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="text-sm font-medium">3. Testmail an interne Adresse</div>
            <div className="flex gap-2 items-end max-w-xl">
              <div className="flex-1 space-y-1">
                <Label htmlFor="canary-to">Testadresse</Label>
                <Input
                  id="canary-to"
                  type="email"
                  placeholder="test@hfx-honorarfuchs.de"
                  value={canaryTo}
                  onChange={(e) => setCanaryTo(e.target.value)}
                  disabled={busy !== null}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="outline" disabled={!canCanary} onClick={runCanary}>
                      {busy === "canary" ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : null}
                      Testmail senden
                    </Button>
                  </span>
                </TooltipTrigger>
                {!hasAsset && <TooltipContent>Zuerst PDF hochladen</TooltipContent>}
              </Tooltip>
            </div>
            <p className="text-xs text-muted-foreground">
              Gesendet wird die gerenderte Mail des ersten gelisteten Leads —
              an die Testadresse, nicht an den Kunden. Kein Event.
            </p>
            {canarySent && (
              <div className="text-xs text-green-700">
                Testmail wurde in dieser Sitzung mindestens einmal versendet.
              </div>
            )}
          </div>

          {/* Versand */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="text-sm font-medium">4. Mails versenden</div>
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button disabled={!canSend} onClick={() => setConfirmOpen(true)}>
                      {busy === "send" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                      Mails versenden ({foundCount})
                    </Button>
                  </span>
                </TooltipTrigger>
                {!hasAsset && <TooltipContent>Zuerst PDF hochladen</TooltipContent>}
              </Tooltip>
              {!canSend && (
                <p className="text-xs text-muted-foreground">
                  Versand freigeschaltet, sobald ein PDF hinterlegt ist und
                  Dry-Run sowie Testmail in dieser Sitzung gelaufen sind.
                </p>
              )}
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Versand bestätigen</AlertDialogTitle>
                  <AlertDialogDescription>
                    Es werden <strong>{foundCount}</strong> Einrichtungs-Mails mit
                    PDF-Anhang sequenziell versendet. Der Versand ist
                    wiederholbar und wird als Ereignis am Lead protokolliert.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!canSend}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!canSend) return;
                      void runSend();
                    }}
                  >
                    Jetzt versenden
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          {lastMode && (
            <div className="text-sm text-muted-foreground">
              Letzter Lauf:{" "}
              <Badge variant="outline">
                {lastMode === "dry_run"
                  ? "Dry-Run"
                  : lastMode === "canary"
                    ? "Testmail"
                    : "Versand"}
              </Badge>
            </div>
          )}

          {targets.length > 0 && results.length === 0 && (
            <div className="border rounded-lg">
              <div className="px-4 py-2 text-sm font-medium bg-muted/40">
                Zielliste ({targets.length})
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HFX-Nr.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>E-Mail</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Qodia</TableHead>
                    <TableHead>Zugangsdaten-Mail</TableHead>
                    <TableHead>Zugang-Info zuletzt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targets.map((t) => (
                    <TableRow key={t.hfx_customer_number}>
                      <TableCell className="font-mono text-xs">
                        {t.hfx_customer_number}
                      </TableCell>
                      <TableCell>
                        {t.found ? (t.name ?? "—") : (
                          <Badge variant="destructive">nicht gefunden</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{t.email ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {t.status ? <Badge variant="secondary">{t.status}</Badge> : "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {t.qodia_synced === true ? (
                          <span className="text-green-700">synced</span>
                        ) : t.qodia_synced === false ? (
                          <span className="text-destructive">nicht synced</span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(t.last_credentials_at)}</TableCell>
                      <TableCell className="text-xs">
                        {t.last_zugang_info_at ? (
                          <span className="text-amber-700">
                            {fmtDate(t.last_zugang_info_at)}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {results.length > 0 && (
            <div className="border rounded-lg">
              <div className="px-4 py-2 text-sm font-medium bg-muted/40">
                Ergebnisse ({results.length})
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>HFX-Nr.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Ergebnis</TableHead>
                    <TableHead>Gesendet an</TableHead>
                    <TableHead>Fehler</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((r, idx) => (
                    <TableRow key={`${r.hfx_customer_number}-${idx}`}>
                      <TableCell className="font-mono text-xs">
                        {r.hfx_customer_number}
                      </TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.outcome === "gesendet"
                              ? "default"
                              : r.outcome === "Fehler"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {r.outcome}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">{r.sent_to ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {r.error ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </TooltipProvider>
    </MainLayout>
  );
}
