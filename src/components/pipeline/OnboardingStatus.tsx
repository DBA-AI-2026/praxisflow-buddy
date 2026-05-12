/**
 * Konsolidierte Onboarding- & Aktivitäts-Anzeige (Kunden-Tab).
 *
 * - OnboardingBadge: 4 Stufen (Offen / In Einrichtung / Einsatzbereit / Fehler),
 *   mit Überfällig-Akzent (orange) wenn > 7 Tage in {Offen, In Einrichtung}.
 * - OnboardingCell: pro Vertrag eine oder mehrere Produkt-Zeilen.
 * - ActivityCell: GOÄ → Ampel + Zähler; EBM/sonstige → "—".
 */
import { useState } from "react";
import { differenceInDays, format } from "date-fns";
import { de } from "date-fns/locale";
import { CircleCheck, Info, Loader2 } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import type { ProviderStatusRow } from "@/components/pipeline/QodiaStatusBadges";
import type { ActivityThresholds } from "@/hooks/useAppSettings";

export type OnboardingStage = "offen" | "in_einrichtung" | "einsatzbereit" | "fehler";

export interface ProductOnboardingInput {
  productLabel: string;          // Mini-Label "GOÄ" / "EBM" / Produktname
  provider: "qodia" | "honorarplus" | string;
  status?: ProviderStatusRow | null;
  hasUsage: boolean;             // wenn true: Aktivitätsmessung möglich (qodia)
  contractId?: string;           // benötigt für Inline-Mark-Ready
  contractCreatedAt?: string | null; // für Überfällig-Fallback bei brandneuen Verträgen
  customerLabel?: string;        // Praxis/Name für Confirm-Dialog
}

const stageCfg: Record<OnboardingStage, { label: string; cls: string }> = {
  offen:           { label: "Offen",           cls: "bg-muted text-muted-foreground" },
  in_einrichtung:  { label: "In Einrichtung", cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  einsatzbereit:   { label: "Einsatzbereit",  cls: "bg-success/10 text-success" },
  fehler:          { label: "Fehler",          cls: "bg-destructive/10 text-destructive" },
};

const overdueCls = "bg-orange-500/10 text-orange-700 dark:text-orange-400";
const OVERDUE_DAYS = 7;

export function deriveOnboardingStage(row?: ProviderStatusRow | null): OnboardingStage {
  if (!row) return "offen";
  if (row.sync_status === "error") return "fehler";
  if (row.sync_status === "transferred") {
    if (row.registration_status === "registered" || row.registration_status === "active") return "einsatzbereit";
    if (row.registration_status === "invited") return "in_einrichtung";
  }
  return "offen";
}

function isOverdue(stage: OnboardingStage, row?: ProviderStatusRow | null, contractCreatedAt?: string | null): boolean {
  if (stage !== "offen" && stage !== "in_einrichtung") return false;
  // Bevorzugt: Alter der provider-status-Zeile; sonst Vertrags-Erstelldatum (verhindert false-overdue für brandneue Verträge ohne CPS-Row).
  const ageRef = row?.created_at ?? contractCreatedAt ?? null;
  if (!ageRef) return false; // kein Bezugsdatum → nicht überfällig markieren
  return differenceInDays(new Date(), new Date(ageRef)) > OVERDUE_DAYS;
}

function fmtDate(v: string | null | undefined) {
  return v ? format(new Date(v), "dd.MM.yy HH:mm", { locale: de }) : "–";
}

async function markContractReady(contractId: string, provider: string): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("contract_provider_status")
    .upsert({
      contract_id: contractId,
      provider,
      sync_status: "transferred",
      registration_status: "active",
      manual_set_by: uid,
      manual_set_at: now,
      last_sync_at: now,
    }, { onConflict: "contract_id,provider" });
  if (error) throw error;
}

function MarkReadyButton({
  contractId,
  provider,
  customerLabel,
  onDone,
}: { contractId: string; provider: string; customerLabel?: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(true); }}
              className="inline-flex items-center justify-center h-4 w-4 rounded text-muted-foreground/60 hover:text-success hover:bg-success/10 transition-colors shrink-0"
              aria-label="Als einsatzbereit markieren"
            >
              <CircleCheck className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Als einsatzbereit markieren</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Einsatzbereit markieren</AlertDialogTitle>
            <AlertDialogDescription>
              {customerLabel ? <><strong>{customerLabel}</strong> </> : null}
              für HonorarPlus als einsatzbereit markieren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await markContractReady(contractId, provider);
                  toast.success("Als einsatzbereit markiert");
                  setOpen(false);
                  onDone?.();
                } catch (err: any) {
                  toast.error(err?.message ?? "Konnte nicht gespeichert werden");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Bestätigen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function OnboardingBadge({
  productLabel,
  status,
  manualSetByName,
  contractCreatedAt,
  showMarkReady = false,
  contractId,
  provider,
  customerLabel,
  onMarkReady,
}: {
  productLabel: string;
  status?: ProviderStatusRow | null;
  manualSetByName?: string | null;
  contractCreatedAt?: string | null;
  showMarkReady?: boolean;
  contractId?: string;
  provider?: string;
  customerLabel?: string;
  onMarkReady?: () => void;
}) {
  const stage = deriveOnboardingStage(status);
  const overdue = isOverdue(stage, status, contractCreatedAt);
  const cfg = stageCfg[stage];
  const cls = overdue ? overdueCls : cfg.cls;
  const label = overdue && stage !== "fehler" ? `${cfg.label} (überfällig)` : cfg.label;
  const manualSetAt = (status as any)?.manual_set_at as string | undefined;
  const tooltip = stage === "fehler" && status?.sync_error_message
    ? status.sync_error_message
    : manualSetAt
      ? `Manuell gesetzt${manualSetByName ? ` von ${manualSetByName}` : ""} am ${fmtDate(manualSetAt)}`
      : `Letzter Sync: ${fmtDate(status?.last_sync_at)}`;
  const canMark = showMarkReady
    && !!contractId
    && !!provider
    && (stage === "offen" || stage === "in_einrichtung");

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1">
            <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide w-7 shrink-0">{productLabel}</span>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${cls}`}>
              {label}
            </span>
            {manualSetAt && <Info className="h-3 w-3 text-muted-foreground/60 shrink-0" />}
            {canMark && (
              <MarkReadyButton
                contractId={contractId!}
                provider={provider!}
                customerLabel={customerLabel}
                onDone={onMarkReady}
              />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function OnboardingCell({
  products,
  manualSetByName,
  showMarkReady = false,
  customerLabel,
  onMarkReady,
}: {
  products: ProductOnboardingInput[];
  manualSetByName?: string | null;
  showMarkReady?: boolean;
  customerLabel?: string;
  onMarkReady?: () => void;
}) {
  if (products.length === 0) {
    return <span className="text-[10px] text-muted-foreground/50">–</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 items-start">
      {products.map((p, i) => (
        <OnboardingBadge
          key={i}
          productLabel={p.productLabel}
          status={p.status}
          manualSetByName={manualSetByName}
          contractCreatedAt={p.contractCreatedAt}
          showMarkReady={showMarkReady && p.provider === "honorarplus"}
          contractId={p.contractId}
          provider={p.provider}
          customerLabel={p.customerLabel ?? customerLabel}
          onMarkReady={onMarkReady}
        />
      ))}
    </div>
  );
}

export function ActivityCell({ products, thresholds }: {
  products: ProductOnboardingInput[];
  thresholds: ActivityThresholds;
}) {
  const measurable = products.filter((p) => p.hasUsage);
  if (measurable.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[11px] text-muted-foreground">—</span>
          </TooltipTrigger>
          <TooltipContent>Aktivitätsmessung folgt mit HonorarPlus-API</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 items-start">
      {measurable.map((p, i) => {
        const total = p.status?.submitted_invoice_count_total ?? 0;
        const last = p.status?.last_usage_at ? new Date(p.status.last_usage_at) : null;
        const days = last ? differenceInDays(new Date(), last) : null;
        let dotCls = "bg-muted-foreground/40";
        let txtCls = "text-muted-foreground";
        if (total === 0) {
          dotCls = "bg-muted-foreground/40";
        } else if (days != null) {
          if (days >= thresholds.red_days) { dotCls = "bg-destructive"; txtCls = "text-destructive"; }
          else if (days >= thresholds.yellow_days) { dotCls = "bg-warning"; txtCls = "text-warning"; }
          else { dotCls = "bg-success"; txtCls = "text-foreground"; }
        }
        const txt = total === 0
          ? "0 Rg"
          : days != null
            ? `${total} Rg · vor ${days} T`
            : `${total} Rg`;
        return (
          <span key={i} className="inline-flex items-center gap-1.5 leading-tight">
            <span className="text-[9px] font-medium text-muted-foreground uppercase tracking-wide w-7 shrink-0">{p.productLabel}</span>
            <span className={`h-2 w-2 rounded-full shrink-0 ${dotCls}`} />
            <span className={`text-[11px] ${txtCls} whitespace-nowrap`}>{txt}</span>
          </span>
        );
      })}
    </div>
  );
}

/** Mini-Helper: bestimmt Produkt-Label aus Produktname */
export function productMiniLabel(productName: string): string {
  const n = (productName || "").toLowerCase();
  if (n.includes("ebm")) return "EBM";
  if (n.includes("goä") || n.includes("goa") || n.includes("goz")) return "GOÄ";
  return productName.slice(0, 4).toUpperCase();
}
