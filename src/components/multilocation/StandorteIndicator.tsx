/**
 * StandorteIndicator — geteilte Hilfen für Standort-Anzeige in Kundenansichten.
 *
 * Stufe 1: `<StandorteToggleBadge />` zeigt einen "N Standorte"-Indikator
 * mit Chevron auf der Hauptaccount-Zeile (nur wenn N > 0).
 * Stufe 2: `<StandorteSubRow />` rendert eine schmale Sub-Zeile mit HFX,
 * Status und StandortBadge. Beide Konsumenten (Pipeline-KundenTab und
 * Kunden-Liste) reichen ihren passenden `colSpan` ein und steuern ihren
 * eigenen Aufklapp-Zustand.
 *
 * Standort-Erkennung ausschließlich über `isStandortContract` aus
 * StandortBadge (GOÄ-gegated, NULL-sicher) — keine duplizierte Logik.
 */
import { ChevronDown, ChevronRight, MapPin } from "lucide-react";
import { isStandortContract, StandortBadge } from "@/components/contracts/StandortBadge";
import { CONTRACT_STATUS_CONFIG } from "@/lib/statusConfig";
import { cn } from "@/lib/utils";

export interface StandortRow {
  id: string;
  product_name: string;
  status: string;
  hfx_customer_number?: string | null;
  praxis?: string | null;
  customer_name?: string | null;
}

/** Filtert die Verträge eines Kunden auf reine Standortverträge. NULL-sicher. */
export function pickStandorte<T extends { id: string; product_name: string }>(
  contracts: T[] | undefined,
  carrierContractId: string | null | undefined,
): T[] {
  if (!contracts || contracts.length === 0) return [];
  return contracts.filter((c) =>
    isStandortContract(c.product_name, c.id, carrierContractId),
  );
}

export function StandorteToggleBadge({
  count,
  expanded,
  onToggle,
  className,
}: {
  count: number;
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={expanded ? "Standorte einklappen" : "Standorte aufklappen"}
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-medium text-accent-foreground border border-border bg-accent/40 rounded px-1.5 py-0.5 hover:bg-accent/70 transition-colors",
        className,
      )}
    >
      {expanded ? (
        <ChevronDown className="h-3 w-3" />
      ) : (
        <ChevronRight className="h-3 w-3" />
      )}
      <MapPin className="h-3 w-3" />
      {count} {count === 1 ? "Standort" : "Standorte"}
    </button>
  );
}

/**
 * Sub-Zeile für einen Standort. Spannt sich über `colSpan` Spalten der
 * Eltern-Tabelle. Klick → `onOpen()` öffnet den Hauptaccount-Dialog (nicht
 * isoliert), gesteuert vom Konsumenten.
 */
export function StandorteSubRow({
  standort,
  carrierContractId,
  colSpan,
  onOpen,
}: {
  standort: StandortRow;
  carrierContractId: string | null | undefined;
  colSpan: number;
  onOpen: () => void;
}) {
  const sc =
    CONTRACT_STATUS_CONFIG[
      standort.status as keyof typeof CONTRACT_STATUS_CONFIG
    ] ?? { label: standort.status, class: "bg-muted text-muted-foreground" };
  const label =
    standort.praxis || standort.customer_name || standort.product_name || "Standort";
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={(e) => {
        if (
          (e.target as HTMLElement).closest("button, a, label, input, [role='menuitem']")
        )
          return;
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if ((e.target as HTMLElement) !== e.currentTarget) return;
        e.preventDefault();
        onOpen();
      }}
      className="bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
    >
      <td colSpan={colSpan} className="py-2 pl-10 pr-4">
        <div className="flex items-center gap-3 flex-wrap text-xs">
          <span className="font-mono text-primary/80">
            {standort.hfx_customer_number || "—"}
          </span>
          <span className="font-medium text-foreground">{label}</span>
          <span className="text-muted-foreground">· {standort.product_name}</span>
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
              sc.class,
            )}
          >
            {sc.label}
          </span>
          <StandortBadge
            productName={standort.product_name}
            contractId={standort.id}
            carrierContractId={carrierContractId}
            compact
          />
        </div>
      </td>
    </tr>
  );
}
