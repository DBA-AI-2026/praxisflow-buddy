import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";

type Mode = "dry_run" | "canary" | "send";

interface TargetRow {
  lead_id: string;
  hfx_customer_number: string | null;
  name?: string;
  email?: string;
  status?: string;
}

interface ResultRow {
  lead_id: string;
  hfx_customer_number: string | null;
  name?: string;
  outcome: string;
  error?: string | null;
}

export default function Kampagne() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();

  const [busy, setBusy] = useState<Mode | null>(null);
  const [targets, setTargets] = useState<TargetRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [lastMode, setLastMode] = useState<Mode | null>(null);
  const [count, setCount] = useState<number | null>(null);

  const [testEmail, setTestEmail] = useState("");
  const [canarySent, setCanarySent] = useState(false);
  const [dryRunDone, setDryRunDone] = useState(false);

  // AGB-Gate: kein Default-Häkchen, keine Persistenz über Sessions.
  const [agbConfirmed, setAgbConfirmed] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (roleLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const runDryRun = async () => {
    setBusy("dry_run");
    setLastMode("dry_run");
    setResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("campaign-mail-send", {
        body: { mode: "dry_run" },
      });
      if (error) throw error;
      setTargets(data?.targets ?? []);
      setCount(data?.count ?? 0);
      setDryRunDone(true);
      toast({
        title: "Dry-Run abgeschlossen",
        description: `${data?.count ?? 0} Leads würden angeschrieben.`,
      });
    } catch (err: any) {
      toast({
        title: "Fehler",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const runCanary = async () => {
    const addr = testEmail.trim();
    if (!addr) {
      toast({
        title: "Testadresse fehlt",
        description: "Bitte eine E-Mail-Adresse für die Testmail eingeben.",
        variant: "destructive",
      });
      return;
    }
    setBusy("canary");
    setLastMode("canary");
    try {
      const { data, error } = await supabase.functions.invoke("campaign-mail-send", {
        body: { mode: "canary", test_email: addr },
      });
      if (error) throw error;
      setCanarySent(true);
      toast({
        title: "Testmail versendet",
        description: `Eine Mail wurde an ${addr} gesendet (Wegwerf-Link).`,
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
      const { data, error } = await supabase.functions.invoke("campaign-mail-send", {
        body: { mode: "send" },
      });
      if (error) throw error;
      setResults(data?.results ?? []);
      setCount(data?.count ?? 0);
      toast({
        title: "Versand abgeschlossen",
        description: `${data?.count ?? 0} Mails verarbeitet.`,
      });
    } catch (err: any) {
      toast({
        title: "Fehler",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setBusy(null);
      setAgbConfirmed(false);
      setConfirmOpen(false);
    }
  };

  const canOpenConfirm =
    targets.length > 0 && dryRunDone && canarySent && busy === null;
  const canSend = canOpenConfirm && agbConfirmed;

  return (
    <MainLayout title="GOÄ-Kampagne">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">GOÄ-Kampagne</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Versand der personalisierten Kampagnen-Mail an qualifizierte Leads
            ohne bisherige Kampagnen-Mail. Jeder Empfänger erhält seinen
            persönlichen /kampagne-Link. Einmal versandt bleibt{" "}
            <code>campaign_mail_sent_at</code> gesetzt (kein Doppel-Versand).
          </p>
        </div>

        {/* Schritt 1: Dry-Run */}
        <div className="border rounded-lg p-4 space-y-2">
          <div className="text-sm font-medium">1. Zielliste prüfen (Dry-Run)</div>
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={runDryRun}
          >
            {busy === "dry_run" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : null}
            Dry-Run ausführen
          </Button>
        </div>

        {/* Schritt 2: Testmail (Canary) */}
        <div className="border rounded-lg p-4 space-y-2">
          <div className="text-sm font-medium">2. Testmail an interne Adresse</div>
          <div className="flex gap-2 items-end max-w-xl">
            <div className="flex-1 space-y-1">
              <Label htmlFor="canary-email">Testadresse</Label>
              <Input
                id="canary-email"
                type="email"
                placeholder="test@hfx-honorarfuchs.de"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                disabled={busy !== null}
              />
            </div>
            <Button
              variant="outline"
              disabled={busy !== null || !testEmail.trim()}
              onClick={runCanary}
            >
              {busy === "canary" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Testmail senden
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Der Link in der Testmail ist bewusst ungültig und führt auf die
            Info-Seite. Es wird kein Vertrag angelegt.
          </p>
          {canarySent && (
            <div className="text-xs text-green-700">
              Testmail wurde in dieser Sitzung mindestens einmal versendet.
            </div>
          )}
        </div>

        {/* Schritt 3: Echt-Versand */}
        <div className="border rounded-lg p-4 space-y-2">
          <div className="text-sm font-medium">3. Kampagne versenden</div>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <Button
              disabled={!canOpenConfirm}
              onClick={() => {
                setAgbConfirmed(false);
                setConfirmOpen(true);
              }}
            >
              {busy === "send" ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Mails versenden ({targets.length})
            </Button>
            {!canOpenConfirm && (
              <p className="text-xs text-muted-foreground">
                Versand freigeschaltet, sobald Dry-Run UND Testmail in dieser
                Sitzung gelaufen sind und mindestens ein Ziel-Lead vorliegt.
              </p>
            )}
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Versand bestätigen</AlertDialogTitle>
                <AlertDialogDescription>
                  Es werden <strong>{targets.length}</strong> Kampagnen-Mails
                  sequenziell versendet. Nach Versand wird{" "}
                  <code>campaign_mail_sent_at</code> gesetzt und ein erneuter
                  Versand an dieselben Leads ist ausgeschlossen.
                </AlertDialogDescription>
              </AlertDialogHeader>

              <label className="flex items-start gap-2 rounded-md border p-3 text-sm cursor-pointer">
                <Checkbox
                  checked={agbConfirmed}
                  onCheckedChange={(v) => setAgbConfirmed(v === true)}
                />
                <span>
                  Die neue AGB-Fassung liegt hinter dem Link auf{" "}
                  <code>/buchen</code> vor.
                </span>
              </label>

              <AlertDialogFooter>
                <AlertDialogCancel
                  onClick={() => {
                    setAgbConfirmed(false);
                  }}
                >
                  Abbrechen
                </AlertDialogCancel>
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
            </Badge>{" "}
            {count !== null && `— ${count} Einträge`}
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {targets.map((t) => (
                  <TableRow key={t.lead_id}>
                    <TableCell className="font-mono text-xs">
                      {t.hfx_customer_number ?? "—"}
                    </TableCell>
                    <TableCell>{t.name ?? "—"}</TableCell>
                    <TableCell className="text-xs">{t.email ?? "—"}</TableCell>
                    <TableCell className="text-xs">
                      <Badge variant="secondary">{t.status ?? "—"}</Badge>
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
                  <TableHead>Fehler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r, idx) => (
                  <TableRow key={`${r.lead_id}-${idx}`}>
                    <TableCell className="font-mono text-xs">
                      {r.hfx_customer_number ?? "—"}
                    </TableCell>
                    <TableCell>{r.name ?? "—"}</TableCell>
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
    </MainLayout>
  );
}
