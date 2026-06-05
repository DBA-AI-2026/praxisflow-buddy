/**
 * StandortBadge — einheitliche Kennzeichnung für Standortverträge (Weg A).
 *
 * Gate (zentral, an EINER Stelle):
 *   isGoaeProduct(productName) && carrierContractId != null && carrierContractId !== contractId
 *
 * GOÄ-Pflicht: Ein separater EBM-Vertrag unter demselben Kunden ist KEIN
 * Standort und darf den Badge nicht bekommen. NULL-Guard: kein Carrier → kein Badge.
 *
 * Rein visuell — keine Gruppierung, keine Sortier-/Filterwirkung.
 */
import { MapPin } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { isGoaeProduct } from "@/lib/multiLocation";
import { cn } from "@/lib/utils";

interface StandortBadgeProps {
  productName: string | null | undefined;
  contractId: string;
  carrierContractId: string | null | undefined;
  className?: string;
  /** Kompakt: nur Icon + kurzer Text (für dichte Listen). */
  compact?: boolean;
}

export function isStandortContract(
  productName: string | null | undefined,
  contractId: string,
  carrierContractId: string | null | undefined,
): boolean {
  if (!isGoaeProduct(productName)) return false;
  if (!carrierContractId) return false;
  return carrierContractId !== contractId;
}

export function StandortBadge({
  productName,
  contractId,
  carrierContractId,
  className,
  compact = false,
}: StandortBadgeProps) {
  if (!isStandortContract(productName, contractId, carrierContractId)) return null;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium text-accent-foreground border border-border bg-accent/40 rounded px-1.5 py-0.5 w-fit",
              compact && "text-[10px] px-1 py-0",
              className,
            )}
          >
            <MapPin className={cn("h-3 w-3", compact && "h-2.5 w-2.5")} />
            Standortvertrag
          </span>
        </TooltipTrigger>
        <TooltipContent>
          Standort eines Hauptaccounts — teilt SEPA-Mandat &amp; Grundgebühr mit dem Träger.
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
