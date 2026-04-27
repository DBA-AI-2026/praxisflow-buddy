import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  RESERVATION_STATUS_LABELS,
  type ReservationStatus,
} from "./types";

interface Props {
  status: ReservationStatus;
  className?: string;
}

const STYLE_BY_STATUS: Record<ReservationStatus, string> = {
  reserviert:
    "bg-primary/10 text-primary border-primary/30 hover:bg-primary/15",
  in_bearbeitung:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/15",
  konvertiert:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/15",
  abgelaufen:
    "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/15",
  freigegeben:
    "bg-muted text-muted-foreground border-border hover:bg-muted/80",
};

export function ReservationStatusBadge({ status, className }: Props) {
  return (
    <Badge
      variant="outline"
      className={cn("font-medium", STYLE_BY_STATUS[status], className)}
    >
      {RESERVATION_STATUS_LABELS[status]}
    </Badge>
  );
}
