/**
 * Konsolidierte Onboarding- & Aktivitäts-Anzeige (Kunden-Tab).
 *
 * - OnboardingBadge: 4 Stufen (Offen / In Einrichtung / Einsatzbereit / Fehler),
 *   mit Überfällig-Akzent (orange) wenn > 7 Tage in {Offen, In Einrichtung}.
 * - OnboardingCell: pro Vertrag eine oder mehrere Produkt-Zeilen.
 * - ActivityCell: GOÄ → Ampel + Zähler; EBM/sonstige → "—".
 */
import { differenceInDays, format } from "date-fns";
import { de } from "date-fns/locale";
import { Info } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProviderStatusRow } from "@/components/pipeline/QodiaStatusBadges";
import type { ActivityThresholds } from "@/hooks/useAppSettings";

export type OnboardingStage = "offen" | "in_einrichtung" | "einsatzbereit" | "fehler";

export interface ProductOnboardingInput {
  productLabel: string;          // Mini-Label "GOÄ" / "EBM" / Produktname
  provider: "qodia" | "honorarplus" | string;
  status?: ProviderStatusRow | null;
  hasUsage: boolean;             // wenn true: Aktivitätsmessung möglich (qodia)
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

function isOverdue(stage: OnboardingStage, row?: ProviderStatusRow | null): boolean {
  if (stage !== "offen" && stage !== "in_einrichtung") return false;
  if (!row?.created_at) return true; // keine Row & wir können kein Alter berechnen → konservativ markieren
  return differenceInDays(new Date(), new Date(row.created_at)) > OVERDUE_DAYS;
}

function fmtDate(v: string | null | undefined) {
  return v ? format(new Date(v), "dd.MM.yy HH:mm", { locale: de }) : "–";
}

export function OnboardingBadge({
  productLabel,
  status,
  manualSetByName,
}: {
  productLabel: string;
  status?: ProviderStatusRow | null;
  manualSetByName?: string | null;
}) {
  const stage = deriveOnboardingStage(status);
  const overdue = isOverdue(stage, status);
  const cfg = stageCfg[stage];
  const cls = overdue ? overdueCls : cfg.cls;
  const label = overdue && stage !== "fehler" ? `${cfg.label} (überfällig)` : cfg.label;
  const manualSetAt = (status as any)?.manual_set_at as string | undefined;
  const tooltip = stage === "fehler" && status?.sync_error_message
    ? status.sync_error_message
    : manualSetAt
      ? `Manuell gesetzt${manualSetByName ? ` von ${manualSetByName}` : ""} am ${fmtDate(manualSetAt)}`
      : `Letzter Sync: ${fmtDate(status?.last_sync_at)}`;

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
          </span>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function OnboardingCell({ products, manualSetByName }: { products: ProductOnboardingInput[]; manualSetByName?: string | null }) {
  if (products.length === 0) {
    return <span className="text-[10px] text-muted-foreground/50">–</span>;
  }
  return (
    <div className="flex flex-col gap-0.5 items-start">
      {products.map((p, i) => (
        <OnboardingBadge key={i} productLabel={p.productLabel} status={p.status} manualSetByName={manualSetByName} />
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
