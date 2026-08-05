/**
 * VerlaufTab — Tab 3 im KundenDialog (Etappe 4).
 *
 * - Notiz-Eingabe (NOTE_ADDED → customer_events)
 * - Timeline aller customer_events, gruppiert nach Tag
 * - Vorgänge-Vollanzeige mit „Erledigen"-Button
 */
import { useMemo, useState } from "react";
import { format, isSameDay, startOfDay, subDays } from "date-fns";
import {
  Activity,
  FileText,
  Key,
  Loader2,
  Mail,
  Plus,
  StickyNote,
  Tag,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { addCustomerNote } from "@/lib/customerEvents";
import { cn } from "@/lib/utils";
import type {
  CaseRow,
  ContractRow,
  EventRow,
  UseKundenDialogDataResult,
} from "@/hooks/useKundenDialogData";
import { CASE_TYPE_LABELS } from "@/lib/contractCaseActions";
import {
  CONTRACT_STATUS_CONFIG,
  LEAD_STATUS_CONFIG,
} from "@/lib/statusConfig";

interface VerlaufTabProps {
  data: UseKundenDialogDataResult;
}

export function VerlaufTab({ data }: VerlaufTabProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAddNote = async () => {
    setSaving(true);
    const result = await addCustomerNote({
      noteText,
      leadId: data.lead?.id ?? null,
      contractId: data.contracts[0]?.id ?? null,
      hfxCustomerNumber: data.hfxNumber,
      userId: user?.id ?? null,
      queryClient,
    });
    setSaving(false);
    if (result.success) {
      toast({ title: "Notiz gespeichert" });
      setNoteText("");
    } else {
      toast({ variant: "destructive", title: "Fehler", description: result.error });
    }
  };

  const canAddNote = !!data.lead?.id || data.contracts.length > 0;

  return (
    <div className="space-y-6">
      <NoteInputCard
        noteText={noteText}
        setNoteText={setNoteText}
        onSubmit={handleAddNote}
        isSaving={saving}
        disabled={!canAddNote}
      />
      <TimelineSection events={data.events} />
      <CasesFullSection cases={data.cases} contracts={data.contracts} />
    </div>
  );
}

/* ──────────────────── Notiz-Eingabe ──────────────────── */

function NoteInputCard({
  noteText,
  setNoteText,
  onSubmit,
  isSaving,
  disabled,
}: {
  noteText: string;
  setNoteText: (v: string) => void;
  onSubmit: () => void;
  isSaving: boolean;
  disabled: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="text-sm font-medium">Notiz hinzufügen</div>
      <Textarea
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
        placeholder={
          disabled
            ? "Notizen können erst angelegt werden, sobald ein Lead oder Vertrag existiert."
            : "Was wurde besprochen?"
        }
        rows={3}
        disabled={isSaving || disabled}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={!noteText.trim() || isSaving || disabled}
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
          ) : (
            <Plus className="h-4 w-4 mr-1.5" />
          )}
          Notiz speichern
        </Button>
      </div>
    </div>
  );
}

/* ──────────────────── Timeline ──────────────────── */

interface DayGroup {
  dayLabel: string;
  sortKey: number;
  events: EventRow[];
}

function groupEventsByDay(events: EventRow[]): DayGroup[] {
  const today = startOfDay(new Date());
  const yesterday = subDays(today, 1);
  const groups = new Map<string, DayGroup>();

  for (const ev of events) {
    const evDate = startOfDay(new Date(ev.created_at));
    let label: string;
    if (isSameDay(evDate, today)) label = "Heute";
    else if (isSameDay(evDate, yesterday)) label = "Gestern";
    else label = format(evDate, "dd.MM.yyyy");

    const existing = groups.get(label);
    if (existing) {
      existing.events.push(ev);
    } else {
      groups.set(label, { dayLabel: label, sortKey: evDate.getTime(), events: [ev] });
    }
  }

  return Array.from(groups.values()).sort((a, b) => b.sortKey - a.sortKey);
}

function TimelineSection({ events }: { events: EventRow[] }) {
  const grouped = useMemo(() => groupEventsByDay(events), [events]);

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium">Verlauf</div>
      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Noch keine Ereignisse aufgezeichnet.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ dayLabel, events: dayEvents }) => (
            <div key={dayLabel}>
              <div className="text-xs font-medium text-muted-foreground mb-2">
                {dayLabel}
              </div>
              <div className="space-y-2 border-l-2 border-muted pl-5 ml-1">
                {dayEvents.map((ev) => (
                  <EventRowItem key={ev.id} event={ev} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EventRowItem({ event }: { event: EventRow }) {
  const time = format(new Date(event.created_at), "HH:mm");
  const { icon, label, detail } = renderEvent(event);
  return (
    <div className="relative flex items-start gap-3 text-sm">
      <div className="absolute -left-[1.65rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
      <div className="text-xs text-muted-foreground tabular-nums w-10 pt-0.5 shrink-0">
        {time}
      </div>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground">{label}</div>
        {detail && (
          <div className="text-xs text-muted-foreground break-words">{detail}</div>
        )}
      </div>
    </div>
  );
}

function renderEvent(event: EventRow): {
  icon: JSX.Element;
  label: string;
  detail?: string;
} {
  const d = event.event_data ?? {};
  switch (event.event_type) {
    case "LEAD_STATUS_CHANGED": {
      const oldS = String(d.old_status ?? "");
      const newS = String(d.new_status ?? "");
      const oldLabel = (LEAD_STATUS_CONFIG as any)[oldS]?.label ?? oldS;
      const newLabel = (LEAD_STATUS_CONFIG as any)[newS]?.label ?? newS;
      return {
        icon: <Tag className="h-4 w-4 text-blue-500" />,
        label: `Lead-Status: ${oldLabel} → ${newLabel}`,
        detail: d.source ? `(${d.source})` : undefined,
      };
    }
    case "CONTRACT_STATUS_CHANGED": {
      const oldS = String(d.old_status ?? "");
      const newS = String(d.new_status ?? "");
      const oldLabel = (CONTRACT_STATUS_CONFIG as any)[oldS]?.label ?? oldS;
      const newLabel = (CONTRACT_STATUS_CONFIG as any)[newS]?.label ?? newS;
      return {
        icon: <FileText className="h-4 w-4 text-purple-500" />,
        label: `Vertrag: ${oldLabel} → ${newLabel}`,
        detail: d.source ? `(${d.source})` : undefined,
      };
    }
    case "MAIL_SENT_MANDATE":
      return {
        icon: <Mail className="h-4 w-4 text-green-500" />,
        label: d.force === true ? "Mandat-Mail erneut gesendet" : "Mandat-Mail gesendet",
      };
    case "MAIL_SENT_CONFIRMATION":
      return {
        icon: <Mail className="h-4 w-4 text-green-500" />,
        label: d.force === true ? "Vertragsbestätigungs-Mail erneut gesendet" : "Vertragsbestätigungs-Mail gesendet",
      };
    case "MAIL_SENT_CREDENTIALS":
      return {
        icon: <Key className="h-4 w-4 text-green-500" />,
        label: "Zugangsdaten gesendet",
      };
    // ROLLBACK 04.08.2026: Empfänger zurück auf BUCHHALTUNG_EMAIL,
    // customer_events-Insert und den VerlaufTab-case entfernen.
    case "USAGE_PLAUSIBILITY_BLOCKED": {
      const parts = [
        d.billing_period_month ? `Monat ${d.billing_period_month}` : null,
        d.quantity != null ? `Menge ${d.quantity}` : null,
        typeof d.reason === "string" ? d.reason : null,
      ].filter(Boolean);
      return {
        icon: <AlertTriangle className="h-4 w-4 text-orange-500" />,
        label: "Abrechnung angehalten (Plausibilitätsbremse)",
        detail: parts.length ? parts.join(" · ") : undefined,
      };
    }
    case "NOTE_ADDED":
      return {
        icon: <StickyNote className="h-4 w-4 text-yellow-500" />,
        label: "Notiz",
        detail: typeof d.note_text === "string" ? d.note_text : undefined,
      };
    default:
      return {
        icon: <Activity className="h-4 w-4 text-muted-foreground" />,
        label: event.event_type,
      };
  }
}

/* ──────────────────── Vorgänge-Vollanzeige ──────────────────── */

function CasesFullSection({
  cases,
  contracts,
}: {
  cases: CaseRow[];
  contracts: ContractRow[];
}) {
  const openCases = cases.filter((c) => c.status === "offen");
  const closedCases = cases.filter((c) => c.status !== "offen");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">Vorgänge</div>
        {cases.length > 0 && (
          <div className="text-xs text-muted-foreground">
            {openCases.length} offen
            {closedCases.length > 0 && ` · ${closedCases.length} erledigt`}
          </div>
        )}
      </div>

      {cases.length === 0 ? (
        <div className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
          Keine Vorgänge angelegt.
        </div>
      ) : (
        <div className="space-y-2">
          {[...openCases, ...closedCases].map((c) => (
            <CaseCard key={c.id} caseItem={c} contracts={contracts} />
          ))}
        </div>
      )}
    </div>
  );
}

function CaseCard({
  caseItem,
  contracts,
}: {
  caseItem: CaseRow;
  contracts: ContractRow[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [closing, setClosing] = useState(false);
  const contract = caseItem.contract_id
    ? contracts.find((c) => c.id === caseItem.contract_id)
    : null;
  const typeLabel = CASE_TYPE_LABELS[caseItem.case_type] ?? caseItem.case_type;
  const isOpen = caseItem.status === "offen";

  const handleClose = async () => {
    setClosing(true);
    const { error } = await (supabase as any)
      .from("contract_cases")
      .update({ status: "erledigt", resolved_at: new Date().toISOString() })
      .eq("id", caseItem.id);
    setClosing(false);
    if (error) {
      toast({ variant: "destructive", title: "Fehler", description: error.message });
      return;
    }
    toast({ title: "Vorgang erledigt" });
    queryClient.invalidateQueries({ queryKey: ["kunden-dialog-cases"] });
    queryClient.invalidateQueries({ queryKey: ["customer-cases"] });
    queryClient.invalidateQueries({ queryKey: ["contract_cases"] });
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 space-y-2",
        !isOpen && "opacity-70",
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">{typeLabel}</Badge>
        <div className="font-medium text-sm flex-1 min-w-0 truncate">{caseItem.title}</div>
        {contract && (
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {contract.contract_number ?? contract.id.slice(0, 8)}
          </span>
        )}
      </div>

      {caseItem.notes && (
        <div className="text-xs text-muted-foreground break-words">
          {caseItem.notes}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {format(new Date(caseItem.created_at), "dd.MM.yyyy HH:mm")}
        </span>
        {isOpen ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            disabled={closing}
            onClick={handleClose}
          >
            {closing ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : null}
            Erledigen
          </Button>
        ) : (
          <Badge variant="secondary" className="text-[10px]">Erledigt</Badge>
        )}
      </div>
    </div>
  );
}
