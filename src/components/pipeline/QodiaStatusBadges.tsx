/**
 * Compact badge set for the generic provider-status model.
 * Used in the Pipeline (Abschlussphase + Kunden tabs) for Qodia today,
 * but designed to render any provider status row.
 */
import { format, differenceInDays } from "date-fns";
import { de } from "date-fns/locale";
import { AlertTriangle, CheckCircle2, Clock, FileText, XCircle } from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ProviderStatusRow {
  provider: string;
  sync_status: "not_started" | "transferred" | "error" | "unknown";
  registration_status: "not_registered" | "invited" | "registered" | "active";
  usage_status: "no_usage" | "first_usage" | "active" | "inactive";
  submitted_invoice_count_total: number;
  submitted_invoice_count_current_month: number;
  first_usage_at: string | null;
  last_usage_at: string | null;
  last_sync_at: string | null;
  sync_error_message: string | null;
  created_at?: string | null;
  manual_set_by?: string | null;
  manual_set_at?: string | null;
  auto_overridden_at?: string | null;
}

const syncCfg = {
  not_started: { label: "Nicht übergeben", cls: "bg-muted text-muted-foreground" },
  transferred: { label: "Übergeben",       cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  error:       { label: "Sync-Fehler",     cls: "bg-destructive/10 text-destructive" },
  unknown:     { label: "Unbekannt",       cls: "bg-muted text-muted-foreground" },
} as const;

const regCfg = {
  not_registered: { label: "Nicht registriert", cls: "bg-muted text-muted-foreground" },
  invited:        { label: "Eingeladen",        cls: "bg-warning/15 text-warning" },
  registered:     { label: "Registriert",       cls: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  active:         { label: "Aktiv",             cls: "bg-success/10 text-success" },
} as const;

const usageCfg = {
  no_usage:    { label: "Keine Nutzung", cls: "bg-muted text-muted-foreground" },
  first_usage: { label: "Erste Nutzung", cls: "bg-warning/15 text-warning" },
  active:      { label: "Aktiv",         cls: "bg-success/10 text-success" },
  inactive:    { label: "Inaktiv",       cls: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
} as const;

export function Pill({ label, cls, title }: { label: string; cls: string; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${cls}`}
    >
      {label}
    </span>
  );
}

/**
 * Compact pill for Lead Qodia state, fed by the two lead booleans
 * (qodia_synced, qodia_conflict). Reuses Pill styling for visual
 * consistency with QodiaStatusCell on the Abschlussphase tab.
 */
export function QodiaLeadStatusCell({
  synced,
  conflict,
}: {
  synced: boolean;
  conflict?: boolean;
}) {
  if (synced) {
    return (
      <Pill
        label="Übergeben"
        cls={syncCfg.transferred.cls}
        title="Qodia-Account ist angelegt und übergeben."
      />
    );
  }
  if (conflict) {
    return (
      <Pill
        label="E-Mail-Konflikt"
        cls="bg-warning/15 text-warning"
        title="E-Mail-Adresse kollidiert mit einem bestehenden Qodia-Account."
      />
    );
  }
  return (
    <Pill
      label="Nicht übergeben"
      cls={syncCfg.not_started.cls}
      title="Noch kein Qodia-Account für diesen Lead angelegt."
    />
  );
}

/** Compact dual-pill: sync + registration status */
export function QodiaStatusCell({ row }: { row?: ProviderStatusRow | null }) {
  if (!row) {
    return <span className="text-[10px] text-muted-foreground/50">–</span>;
  }
  const sc = syncCfg[row.sync_status];
  const rc = regCfg[row.registration_status];
  return (
    <TooltipProvider>
      <div className="flex flex-col gap-0.5 items-start">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${sc.cls}`}>
              {sc.label}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {row.sync_status === "error" && row.sync_error_message
              ? row.sync_error_message
              : row.last_sync_at
                ? `Letzter Sync: ${format(new Date(row.last_sync_at), "dd.MM.yy HH:mm", { locale: de })}`
                : "Noch kein Sync"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${rc.cls}`}>
              {rc.label}
            </span>
          </TooltipTrigger>
          <TooltipContent>Registrierungsstatus bei Qodia</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/** Usage cell: "23 gesamt | 5 Monat" */
export function QodiaUsageCell({ row }: { row?: ProviderStatusRow | null }) {
  if (!row) return <span className="text-[10px] text-muted-foreground/50">–</span>;
  const total = row.submitted_invoice_count_total;
  const month = row.submitted_invoice_count_current_month;
  if (total === 0) {
    return <span className="text-[11px] text-muted-foreground">0 Rechnungen</span>;
  }
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[11px] font-semibold text-foreground inline-flex items-center gap-1">
        <FileText className="h-3 w-3 text-muted-foreground" />
        {total} gesamt
      </span>
      {month > 0 && (
        <span className="text-[10px] text-muted-foreground">{month} im Monat</span>
      )}
    </div>
  );
}

/** Last activity cell with stale indicator */
export function QodiaLastActivityCell({ row }: { row?: ProviderStatusRow | null }) {
  if (!row || !row.last_usage_at) {
    return <span className="text-[10px] text-muted-foreground/50">keine Nutzung</span>;
  }
  const date = new Date(row.last_usage_at);
  const days = differenceInDays(new Date(), date);
  const stale = days > 30;
  return (
    <div className="flex flex-col leading-tight">
      <span className={`text-[11px] font-medium whitespace-nowrap ${stale ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
        {format(date, "dd.MM.yy", { locale: de })}
      </span>
      <span className="text-[10px] text-muted-foreground">vor {days} Tagen</span>
    </div>
  );
}

/** Inline warning icon for problematic states */
export function QodiaWarningIcon({ row, contractStatus }: {
  row?: ProviderStatusRow | null;
  contractStatus?: string;
}) {
  if (!row) return null;

  // Contract active but not transferred
  if (contractStatus === "aktiv" && row.sync_status === "not_started") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
          </TooltipTrigger>
          <TooltipContent>Vertrag aktiv, aber noch nicht an Qodia übergeben</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Sync error
  if (row.sync_status === "error") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <XCircle className="h-3 w-3 text-destructive shrink-0" />
          </TooltipTrigger>
          <TooltipContent>{row.sync_error_message || "Sync-Fehler"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Registered but no usage
  if (row.registration_status === "registered" && row.usage_status === "no_usage") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Clock className="h-3 w-3 text-warning shrink-0" />
          </TooltipTrigger>
          <TooltipContent>Registriert, aber noch keine Nutzung</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Stale > 30 days
  if (row.usage_status === "inactive") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <AlertTriangle className="h-3 w-3 text-orange-500 shrink-0" />
          </TooltipTrigger>
          <TooltipContent>Seit über 30 Tagen keine Aktivität</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return null;
}

/** Detail block for contract-detail dialog */
export function QodiaDetailBlock({ row }: { row?: ProviderStatusRow | null }) {
  if (!row) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        Für dieses Produkt ist kein Qodia-Status hinterlegt.
      </div>
    );
  }
  const sc = syncCfg[row.sync_status];
  const rc = regCfg[row.registration_status];
  const uc = usageCfg[row.usage_status];

  const fmt = (v: string | null) =>
    v ? format(new Date(v), "dd.MM.yyyy HH:mm", { locale: de }) : "–";

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Qodia-Status</h3>
        <div className="flex gap-1">
          <Pill label={sc.label} cls={sc.cls} />
          <Pill label={rc.label} cls={rc.cls} />
          <Pill label={uc.label} cls={uc.cls} />
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="text-muted-foreground">Übergabe an Qodia</dt>
        <dd className="text-foreground">{row.sync_status === "transferred" ? fmt(row.last_sync_at) : "noch nicht übergeben"}</dd>

        <dt className="text-muted-foreground">Erste Nutzung</dt>
        <dd className="text-foreground">{fmt(row.first_usage_at)}</dd>

        <dt className="text-muted-foreground">Letzte Nutzung</dt>
        <dd className="text-foreground">{fmt(row.last_usage_at)}</dd>

        <dt className="text-muted-foreground">Rechnungen gesamt</dt>
        <dd className="text-foreground font-medium">{row.submitted_invoice_count_total}</dd>

        <dt className="text-muted-foreground">Rechnungen aktueller Monat</dt>
        <dd className="text-foreground font-medium">{row.submitted_invoice_count_current_month}</dd>

        <dt className="text-muted-foreground">Letzter Sync</dt>
        <dd className="text-foreground">{fmt(row.last_sync_at)}</dd>

        {row.sync_error_message && (
          <>
            <dt className="text-destructive">Fehlermeldung</dt>
            <dd className="text-destructive">{row.sync_error_message}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
