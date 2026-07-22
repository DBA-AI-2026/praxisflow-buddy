import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUserRole } from "@/hooks/useUserRole";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { MainLayout } from "@/components/layout/MainLayout";

type Mode = "dry_run" | "canary" | "batch";

interface ResultRow {
  hfx_customer_number: string;
  name?: string;
  outcome?: string;
  contract_id?: string | null;
  error?: string | null;
  status?: number;
}

const MODE_LABELS: Record<Mode, string> = {
  dry_run: "Dry-Run",
  canary: "Kanarienvogel",
  batch: "Batch",
};

const MODE_DESCRIPTIONS: Record<Mode, string> = {
  dry_run: "Zeigt die Zielliste an. Es werden KEINE Verträge angelegt.",
  canary: "Legt genau EINEN Vertrag still an (skip_mail=true), dann Stopp.",
  batch: "Legt alle übrigen Verträge still an (skip_mail=true, 200ms Pause).",
};

export default function CampaignMint() {
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const [busy, setBusy] = useState<Mode | null>(null);
  const [rows, setRows] = useState<ResultRow[]>([]);
  const [lastMode, setLastMode] = useState<Mode | null>(null);
  const [count, setCount] = useState<number | null>(null);

  if (roleLoading) return null;
  if (!isAdmin) return <Navigate to="/" replace />;

  const run = async (mode: Mode) => {
    setBusy(mode);
    setLastMode(mode);
    try {
      const { data, error } = await supabase.functions.invoke("campaign-mint-runner", {
        body: { mode },
      });
      if (error) throw error;
      if (mode === "dry_run") {
        setRows(
          (data?.targets ?? []).map((t: any) => ({
            hfx_customer_number: t.hfx_customer_number,
            name: t.name,
            outcome: "(Dry-Run)",
          })),
        );
      } else {
        setRows(data?.results ?? []);
      }
      setCount(data?.count ?? 0);
      toast({
        title: `${MODE_LABELS[mode]} abgeschlossen`,
        description: `${data?.count ?? 0} Einträge.`,
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

  const renderButton = (mode: Mode, variant: "outline" | "secondary" | "default") => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={variant} disabled={busy !== null}>
          {busy === mode ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          {MODE_LABELS[mode]}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{MODE_LABELS[mode]} ausführen?</AlertDialogTitle>
          <AlertDialogDescription>{MODE_DESCRIPTIONS[mode]}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Abbrechen</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(mode)}>Bestätigen</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <MainLayout title="Campaign Mint">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Campaign Mint</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Stille Anlage von GOÄ-Verträgen für qualifizierte Leads ohne bestehenden Vertrag
            (skip_mail=true). Kein Mail-Versand.
          </p>
        </div>

        <div className="flex gap-2">
          {renderButton("dry_run", "outline")}
          {renderButton("canary", "secondary")}
          {renderButton("batch", "default")}
        </div>

        {lastMode && (
          <div className="text-sm text-muted-foreground">
            Letzter Lauf: <Badge variant="outline">{MODE_LABELS[lastMode]}</Badge>{" "}
            {count !== null && `— ${count} Einträge`}
          </div>
        )}

        {rows.length > 0 && (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HFX-Nr.</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Ergebnis</TableHead>
                  <TableHead>Vertrag / Fehler</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => (
                  <TableRow key={`${r.hfx_customer_number}-${idx}`}>
                    <TableCell className="font-mono text-xs">
                      {r.hfx_customer_number}
                    </TableCell>
                    <TableCell>{r.name ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.outcome === "gemintet"
                            ? "default"
                            : r.outcome === "Fehler"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {r.outcome}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {r.contract_id ?? r.error ?? "—"}
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
