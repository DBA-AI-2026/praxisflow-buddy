/**
 * FreiKontingentCard — Auftrag #21 P2.
 *
 * Admin-only Anzeige des Freikontingent-Saldos je Vertrag plus manuelle
 * Vergabe über die SECURITY-DEFINER-RPCs aus P1:
 *   - Lesen:    admin_get_free_quota_overview(p_hfx_customer_number)
 *   - Schreiben: admin_create_free_quota_grant(hfx, grant_type, menge, quelle)
 *
 * Maßgeblich ist IMMER contract.hfx_customer_number des geöffneten Vertrags —
 * KEINE Umleitung auf die Träger-Nummer. Jeder Standort hat eigene Qodia-
 * Identität und eigenen Verbrauch; ein Grant am Träger deckt Standortverbrauch
 * nicht ab.
 *
 * „offen, noch nicht fakturiert" wird getrennt ausgewiesen und NICHT in
 * „frei verbleibend" eingerechnet — der Rechnungsmotor zählt nur invoiced.
 *
 * Nicht in P2: Historie, created_by, Namensauflösung (→ P3).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { isStandortHfx } from "@/lib/multiLocation";

interface QuotaOverview {
  grants_total: number;
  usage_invoiced: number;
  saldo: number;
  pending_offen: number;
}

const GRANT_TYPES: { value: string; label: string }[] = [
  { value: "bonus", label: "Bonus" },
  { value: "sales_commitment", label: "Vertriebszusage" },
  { value: "kulanz", label: "Kulanz" },
  { value: "standort", label: "Standort" },
];

export function FreiKontingentCard({ hfxNumber }: { hfxNumber: string | null }) {
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [menge, setMenge] = useState("200");
  const [grantType, setGrantType] = useState("bonus");
  const [quelle, setQuelle] = useState("");
  const [saving, setSaving] = useState(false);

  const queryKey = ["free-quota-overview", hfxNumber];
  const { data, isLoading, error } = useQuery({
    queryKey,
    enabled: isAdmin && !!hfxNumber,
    queryFn: async (): Promise<QuotaOverview | null> => {
      const { data, error } = await supabase.rpc("admin_get_free_quota_overview", {
        p_hfx_customer_number: hfxNumber!,
      });
      if (error) throw error;
      const o = (data ?? {}) as any;
      return {
        grants_total: Number(o.grants_total ?? 0),
        usage_invoiced: Number(o.usage_invoiced ?? 0),
        saldo: Number(o.saldo ?? 0),
        pending_offen: Number(o.pending_offen ?? 0),
      };
    },
  });

  if (!isAdmin || !hfxNumber) return null;

  const isStandort = isStandortHfx(hfxNumber);
  const mengeNum = Number.parseInt(menge, 10);
  const mengeValid = Number.isFinite(mengeNum) && mengeNum > 0;
  const quelleValid = quelle.trim().length > 0;

  const resetForm = () => {
    setMenge("200");
    setGrantType("bonus");
    setQuelle("");
  };

  const runGrant = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("admin_create_free_quota_grant", {
      p_hfx_customer_number: hfxNumber,
      p_grant_type: grantType,
      p_menge: mengeNum,
      p_quelle: quelle.trim(),
    });
    setSaving(false);
    setConfirmOpen(false);
    if (error) {
      toast({
        variant: "destructive",
        title: "Vergabe fehlgeschlagen",
        description: error.message,
      });
      return;
    }
    toast({
      title: "Gratis-Abrechnungen vergeben",
      description: `${mengeNum} Einheiten für ${hfxNumber} gutgeschrieben.`,
    });
    queryClient.invalidateQueries({ queryKey });
    setDialogOpen(false);
    resetForm();
  };

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <Gift className="h-3.5 w-3.5 text-primary" />
          Freikontingent
          <span className="font-mono text-muted-foreground">· {hfxNumber}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 h-7 text-xs"
          onClick={() => setDialogOpen(true)}
        >
          <Gift className="h-3.5 w-3.5" />
          Gratis-Abrechnungen vergeben
        </Button>
      </div>

      {isStandort && (
        <div className="text-[11px] text-muted-foreground">
          Standortvertrag — das Kontingent gilt ausschließlich für diesen Standort.
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Lade Kontingent…
        </div>
      ) : error ? (
        <div className="text-xs text-destructive">
          Kontingent konnte nicht geladen werden: {(error as any)?.message}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <Stat label="Vergeben gesamt" value={data.grants_total} />
            <Stat label="Bereits verrechnet" value={data.usage_invoiced} />
            <Stat label="Frei verbleibend" value={data.saldo} strong />
          </div>
          <div className="border-t pt-1.5 text-[11px] text-muted-foreground">
            Offen, noch nicht fakturiert:{" "}
            <span className="font-medium text-foreground">{data.pending_offen}</span>{" "}
            — nicht in „Frei verbleibend" enthalten.
          </div>
        </>
      ) : null}

      {/* Vergabe-Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gratis-Abrechnungen vergeben</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
              Empfänger:{" "}
              <span className="font-mono font-medium text-foreground">{hfxNumber}</span>
              {isStandort && (
                <div className="mt-1 text-muted-foreground">
                  Standortvertrag — das Kontingent gilt nur für diesen Standort.
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fq-menge">Menge</Label>
              <Input
                id="fq-menge"
                type="number"
                min={1}
                value={menge}
                onChange={(e) => setMenge(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Grund</Label>
              <Select value={grantType} onValueChange={setGrantType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRANT_TYPES.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fq-quelle">Quelle/Notiz (Pflicht)</Label>
              <Textarea
                id="fq-quelle"
                rows={2}
                value={quelle}
                onChange={(e) => setQuelle(e.target.value)}
                placeholder="z. B. Vertriebszusage vom 04.08.2026"
              />
            </div>

            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-warning-foreground">
              <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
              <span>Grants lassen sich nicht zurücknehmen.</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              disabled={!mengeValid || !quelleValid || saving}
              onClick={() => setConfirmOpen(true)}
            >
              Vergeben
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bestätigungsschritt */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vergabe bestätigen</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <div>
                  <span className="font-medium text-foreground">{mengeNum}</span>{" "}
                  Gratis-Abrechnungen werden für{" "}
                  <span className="font-mono font-medium text-foreground">{hfxNumber}</span>{" "}
                  gutgeschrieben.
                </div>
                {isStandort && (
                  <div>Hinweis: Das Kontingent gilt nur für diesen Standort.</div>
                )}
                <div>Grants lassen sich nicht zurücknehmen.</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runGrant();
              }}
              disabled={saving}
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
              Endgültig vergeben
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Stat({
  label,
  value,
  strong,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={strong ? "text-sm font-semibold text-foreground" : "text-sm text-foreground"}>
        {value}
      </div>
    </div>
  );
}
