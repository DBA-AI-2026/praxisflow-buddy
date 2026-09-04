/**
 * LeadUsageCell — Aktivitäts-Anzeige für Interessenten in Testphase.
 *
 * Datenquelle: die fünf qodia_*-Spalten auf public.leads, befüllt durch
 * qodia-lead-usage-sync (Cron 05:30 UTC) bzw. qodia-usage-query (source: "lead").
 *
 * Drei ehrliche Zustände:
 *   1. nie synchronisiert (synced_at NULL, kein Fehler)  → "–"
 *   2. no_account (kein Qodia-Account gefunden)           → "Keine Daten abrufbar"
 *      api_error / network_error                          → gleicher Text, aber Zahlen des
 *                                                            letzten erfolgreichen Laufs bleiben
 *   3. Daten vorhanden                                    → {total} + {month} im Monat + Ampel
 *
 * Niemals "0" anzeigen, wenn keine Daten abrufbar sind.
 *
 * Ampel (Schwellen aus lead_activity_thresholds):
 *   - total = 0            → gekoppelt ans Lead-Alter (created_at): jünger als Gelb → grau
 *                            "Keine Nutzung"; ≥ Gelb → gelb; ≥ Rot → rot
 *   - last_usage_at NULL && total > 0 → gelb (letzte Aktivität unbekannt)
 *   - Tage seit last_usage_at: < Gelb → grün, < Rot → gelb, sonst rot
 */
import { differenceInDays, format } from "date-fns";
import { de } from "date-fns/locale";
import { AlertCircle, FileText } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ActivityThresholds } from "@/hooks/useAppSettings";

export interface LeadUsageFields {
  created_at: string;
  qodia_invoice_count_total: number | null;
  qodia_invoice_count_month: number | null;
  qodia_last_usage_at: string | null;
  qodia_usage_synced_at: string | null;
  qodia_usage_error: string | null;
}

export type LeadAmpel = {
  color: "green" | "yellow" | "red" | "gray";
  label: string;
  tooltip: string;
};

const dotCls: Record<LeadAmpel["color"], string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
  gray: "bg-muted-foreground/40",
};

const fmtDate = (v: string) => format(new Date(v), "dd.MM.yyyy", { locale: de });

/** Reine Ampel-Ableitung — exportiert für Tabelle, Dialog und Kunden-Dialog-Block. */
export function computeLeadAmpel(
  lead: LeadUsageFields,
  t: ActivityThresholds,
  now: Date = new Date(),
): LeadAmpel | null {
  const total = lead.qodia_invoice_count_total;
  if (total === null || total === undefined) return null;

  if (total === 0) {
    const ageDays = differenceInDays(now, new Date(lead.created_at));
    if (ageDays >= t.red_days) {
      return {
        color: "red",
        label: "Keine Nutzung",
        tooltip: `Registriert vor ${ageDays} Tagen, noch keine Einreichung (Rot ab ${t.red_days} Tagen)`,
      };
    }
    if (ageDays >= t.yellow_days) {
      return {
        color: "yellow",
        label: "Keine Nutzung",
        tooltip: `Registriert vor ${ageDays} Tagen, noch keine Einreichung (Gelb ab ${t.yellow_days} Tagen)`,
      };
    }
    return {
      color: "gray",
      label: "Keine Nutzung",
      tooltip: `Registriert vor ${ageDays} Tagen — noch nichts zu erwarten`,
    };
  }

  if (!lead.qodia_last_usage_at) {
    return {
      color: "yellow",
      label: "Aktivität unbekannt",
      tooltip: "Letzte Aktivität unbekannt — keine Einreichung im laufenden Monat",
    };
  }

  const days = differenceInDays(now, new Date(lead.qodia_last_usage_at));
  const when = `Letzte Einreichung ${fmtDate(lead.qodia_last_usage_at)} (vor ${days} Tagen)`;
  if (days >= t.red_days) return { color: "red", label: "Inaktiv", tooltip: `${when} — Rot ab ${t.red_days} Tagen` };
  if (days >= t.yellow_days) return { color: "yellow", label: "Nachlassend", tooltip: `${when} — Gelb ab ${t.yellow_days} Tagen` };
  return { color: "green", label: "Aktiv", tooltip: when };
}

export function AmpelDot({ ampel, size = "sm" }: { ampel: LeadAmpel; size?: "sm" | "md" }) {
  const dim = size === "md" ? "h-2.5 w-2.5" : "h-2 w-2";
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-block rounded-full shrink-0 ${dim} ${dotCls[ampel.color]}`} aria-label={ampel.label} />
        </TooltipTrigger>
        <TooltipContent>{ampel.tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const ERROR_LABEL: Record<string, string> = {
  no_account: "Kein Qodia-Account zu dieser E-Mail gefunden.",
  api_error: "Letzter Abgleich fehlgeschlagen (Qodia-API-Fehler).",
  network_error: "Letzter Abgleich fehlgeschlagen (Netzwerkfehler).",
};

export function LeadUsageCell({ lead, thresholds }: { lead: LeadUsageFields; thresholds: ActivityThresholds }) {
  const synced = !!lead.qodia_usage_synced_at;
  const err = lead.qodia_usage_error;
  const hasNumbers = lead.qodia_invoice_count_total !== null && lead.qodia_invoice_count_total !== undefined;

  // Zustand 1: nie synchronisiert
  if (!synced && !err) {
    return <span className="text-[10px] text-muted-foreground/50">–</span>;
  }

  const errorNote = err ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <AlertCircle className="h-3 w-3 text-warning" />
            Keine Daten abrufbar
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {ERROR_LABEL[err] ?? err}
          {lead.qodia_usage_synced_at && (
            <div className="text-[10px] opacity-70 mt-0.5">Stand: {format(new Date(lead.qodia_usage_synced_at), "dd.MM.yy HH:mm", { locale: de })}</div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  // Zustand 2: Fehler ohne (jemals) erfolgreiche Zahlen
  if (err && (!hasNumbers || err === "no_account")) {
    return errorNote;
  }

  // Zustand 3: Zahlen vorhanden (ggf. mit Fehlerhinweis vom letzten Lauf)
  const total = lead.qodia_invoice_count_total ?? 0;
  const month = lead.qodia_invoice_count_month ?? 0;
  const ampel = computeLeadAmpel(lead, thresholds);

  // total = 0 (synchronisiert, kein no_account): Label statt "0", Farbe ans Lead-Alter gekoppelt
  if (total === 0 && ampel) {
    return (
      <div className="flex flex-col leading-tight items-start gap-0.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground whitespace-nowrap">
          <AmpelDot ampel={ampel} />
          {ampel.label}
        </span>
        {errorNote}
      </div>
    );
  }

  return (
    <div className="flex flex-col leading-tight items-start gap-0.5">
      <div className="flex items-center gap-1.5">
        {ampel && <AmpelDot ampel={ampel} />}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-[11px] font-semibold text-foreground inline-flex items-center gap-1 tabular-nums">
                <FileText className="h-3 w-3 text-muted-foreground" />
                {total}
              </span>
            </TooltipTrigger>
            <TooltipContent>Einreichungen der letzten 12 Monate</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {total > 0 && (
        <span className="text-[10px] text-muted-foreground">{month} im Monat</span>
      )}
      {errorNote}
    </div>
  );
}
