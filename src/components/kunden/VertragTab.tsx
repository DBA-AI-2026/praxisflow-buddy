/**
 * VertragTab — Tab 2 im KundenDialog (Etappe 3a + 3b-i).
 *
 * Lese-Modus für Verträge mit drei PDF-Buttons (3a) und klickbarer
 * Status-Pille mit echtem Status-Wechsel (3b-i, via changeContractStatus).
 *
 * Lead-Phase (kein Vertrag): zusätzlich Lead-Status-Karte oben mit
 * klickbarer Pille (changeLeadStatus). `kunde` wird ausgefiltert —
 * konsistent zu LeadDetailDialog Z. 477.
 *
 * TODO Etappe 3b-ii: Mail-Aktionen (Mandat-Mail, Buchungslink, Bestätigung),
 * Qodia-Registrierung, Vertragsanlage-Trigger, Vorgang/Case anlegen.
 */
import { useState, useMemo } from "react";
import {
  Eye,
  FileText,
  Upload,
  ExternalLink,
  Loader2,
  Plus,
  Check,
  ChevronDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import type {
  UseKundenDialogDataResult,
  ContractRow,
} from "@/hooks/useKundenDialogData";
import {
  previewContractPdf,
  templateContractPdf,
  getContractStorageSignedUrl,
} from "@/lib/contractPdfActions";
import {
  CONTRACT_STATUS_CONFIG,
  CONTRACT_STATUS_ORDER,
  LEAD_STATUS_CONFIG,
  LEAD_STATUS_ORDER,
  type ContractStatus,
  type LeadStatus,
} from "@/lib/statusConfig";
import { changeContractStatus } from "@/lib/contractStatusActions";
import { changeLeadStatus } from "@/lib/leadStatusActions";

interface VertragTabProps {
  data: UseKundenDialogDataResult;
}

const FINAL_STATUSES = ["beendet", "gekuendigt", "gesperrt"];

export function VertragTab({ data }: VertragTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { contracts, isLoading, ssot, lead } = data;

  const sorted = useMemo(() => {
    const active = contracts.filter(
      (c) => !FINAL_STATUSES.includes((c.status ?? "").toLowerCase()),
    );
    const finished = contracts.filter((c) =>
      FINAL_STATUSES.includes((c.status ?? "").toLowerCase()),
    );
    const byDateDesc = (a: ContractRow, b: ContractRow) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? "");
    active.sort(byDateDesc);
    finished.sort(byDateDesc);
    return [...active, ...finished];
  }, [contracts]);

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Lade Verträge…
      </div>
    );
  }

  const showLeadStatusCard = ssot === "lead" && !!lead;
  const hasContracts = contracts.length > 0;

  return (
    <div className="space-y-4">
      {showLeadStatusCard && <LeadStatusCard lead={lead!} />}

      {!hasContracts && (
        <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
          <div className="text-sm font-medium text-foreground">Noch kein Vertrag</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Für diesen Datensatz existiert noch kein Vertrag.
            Anlage erfolgt aktuell über das Vertrags-Modul.
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 gap-1.5"
            onClick={() => {
              if (lead?.id) {
                navigate(`/vertrieb/vertraege?leadId=${lead.id}`);
              } else {
                toast({
                  title: "Kein verknüpfter Lead",
                  description: "Bitte Vertragsdaten manuell im Vertrags-Modul eingeben.",
                });
                navigate("/vertrieb/vertraege");
              }
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            Vertrag erstellen
          </Button>
        </div>
      )}

      {hasContracts &&
        sorted.map((c) => {
          const isFinal = FINAL_STATUSES.includes((c.status ?? "").toLowerCase());
          return <ContractCard key={c.id} contract={c} dimmed={isFinal} />;
        })}

      {hasContracts && (
        <div className="text-xs text-muted-foreground text-center pt-2">
          Weitere Aktionen folgen in Kürze. Vorübergehend erreichbar über das Vertrags-Modul.
        </div>
      )}
    </div>
  );
}

/* ────────────────────── Lead-Status-Karte ────────────────────── */

function LeadStatusCard({ lead }: { lead: NonNullable<UseKundenDialogDataResult["lead"]> }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const currentStatus = (lead.status ?? "neu") as LeadStatus;
  const isKunde = currentStatus === "kunde";

  const onSelect = async (newStatus: LeadStatus) => {
    if (newStatus === currentStatus) return;
    setBusy(true);
    const result = await changeLeadStatus({
      leadId: lead.id,
      newStatus,
      oldStatus: lead.status,
      hfxCustomerNumber: lead.hfx_customer_number,
      userId: user?.id ?? null,
      queryClient,
      source: "kunden_dialog_lead_status",
    });
    setBusy(false);
    if (result.success) {
      toast({
        title: "Lead-Status geändert",
        description: `Auf „${LEAD_STATUS_CONFIG[newStatus]?.label}" gesetzt.`,
      });
    } else {
      toast({ variant: "destructive", title: "Fehler", description: result.error });
    }
  };

  const cfg = LEAD_STATUS_CONFIG[currentStatus] ?? LEAD_STATUS_CONFIG.neu;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-foreground">Lead-Status</div>
          <div className="text-xs text-muted-foreground">
            Aktueller Status dieses Interessenten
          </div>
        </div>
        {isKunde ? (
          // `kunde` ist System-gesetzt → reine Anzeige, kein Dropdown
          <TooltipProvider delayDuration={150}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant={cfg.variant}>{cfg.label}</Badge>
              </TooltipTrigger>
              <TooltipContent>
                Wird automatisch bei Vertragsabschluss gesetzt und kann hier nicht geändert werden.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                disabled={busy}
                className="inline-flex items-center gap-1 disabled:opacity-50"
              >
                <Badge variant={cfg.variant} className="cursor-pointer hover:opacity-80">
                  {busy ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : null}
                  {cfg.label}
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Badge>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[200px]">
              {LEAD_STATUS_ORDER.map((s) => {
                const c = LEAD_STATUS_CONFIG[s];
                const isCurrent = currentStatus === s;
                return (
                  <DropdownMenuItem
                    key={s}
                    disabled={isCurrent}
                    onClick={() => onSelect(s)}
                    className="gap-2"
                  >
                    <Badge variant={c.variant}>{c.label}</Badge>
                    {isCurrent && <Check className="h-3 w-3 ml-auto" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

/* ────────────────────── Contract Card + Status Pill ────────────────────── */

function ContractStatusPill({
  contract,
  onChange,
  busy,
}: {
  contract: ContractRow;
  onChange: (s: ContractStatus) => void;
  busy: boolean;
}) {
  const { isAdmin, isVertragsabteilung } = useUserRole();
  const current = (contract.status ?? "entwurf") as ContractStatus;
  const cfg = CONTRACT_STATUS_CONFIG[current] ?? CONTRACT_STATUS_CONFIG.entwurf;
  const Icon = cfg.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={busy}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium",
            "border border-transparent hover:border-current transition-colors cursor-pointer",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            cfg.class,
          )}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Icon className="h-3 w-3" />
          )}
          {cfg.label}
          <ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[180px]">
        <TooltipProvider delayDuration={150}>
          {CONTRACT_STATUS_ORDER.map((s) => {
            const c = CONTRACT_STATUS_CONFIG[s];
            const SubIcon = c.icon;
            const isCurrent = current === s;
            const isAdminGated = s === "aktiv" && !isAdmin && !isVertragsabteilung;
            const item = (
              <DropdownMenuItem
                key={s}
                disabled={isCurrent || isAdminGated}
                onClick={() => onChange(s)}
                className="gap-2"
              >
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.class}`}
                >
                  <SubIcon className="h-3 w-3" />
                  {c.label}
                </span>
                {isCurrent && <Check className="h-3 w-3 ml-auto" />}
              </DropdownMenuItem>
            );
            if (isAdminGated) {
              return (
                <Tooltip key={s}>
                  <TooltipTrigger asChild>
                    <div>{item}</div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Nur Admin oder Vertragsabteilung darf einen Vertrag aktivieren.
                  </TooltipContent>
                </Tooltip>
              );
            }
            return item;
          })}
        </TooltipProvider>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContractCard({
  contract,
  dimmed,
}: {
  contract: ContractRow;
  dimmed?: boolean;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"preview" | "template" | "storage" | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  const product = contract.product_name ?? "—";
  const number = contract.contract_number ?? contract.id.slice(0, 8);
  const price =
    contract.monthly_price != null
      ? `${Number(contract.monthly_price).toLocaleString("de-DE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })} €/Monat`
      : "—";
  const laufzeit = contract.duration_months
    ? `${contract.duration_months} Monate`
    : "—";
  const start = contract.start_date
    ? new Date(contract.start_date).toLocaleDateString("de-DE")
    : "—";

  const runPdfAction = async (
    kind: "preview" | "template" | "storage",
    fn: () => Promise<void>,
  ) => {
    setBusy(kind);
    try {
      await fn();
    } catch (err: any) {
      toast({
        title: "PDF-Fehler",
        description: err?.message ?? "Unbekannter Fehler.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const onStatusChange = async (newStatus: ContractStatus) => {
    setStatusBusy(true);
    const result = await changeContractStatus({
      contractId: contract.id,
      newStatus,
      oldStatus: contract.status ?? null,
      hfxCustomerNumber: contract.hfx_customer_number ?? null,
      userId: user?.id ?? null,
      queryClient,
      contract,
      source: "kunden_dialog_vertrag_tab",
    });
    setStatusBusy(false);
    if (!result.success) {
      const isMandate = /SEPA|Mandat/i.test(result.error ?? "");
      toast({
        variant: "destructive",
        title: isMandate ? "⚠️ SEPA-Mandat fehlt" : "Fehler beim Statuswechsel",
        description: result.error,
      });
      return;
    }
    if (result.praxenCreated) {
      toast({
        title: "✅ Kunde angelegt",
        description: `${contract.praxis || contract.customer_name} wurde erfolgreich als Kunden hinterlegt.`,
      });
    }
    toast({
      title: "Status aktualisiert",
      description: `Auf „${CONTRACT_STATUS_CONFIG[newStatus]?.label}" gesetzt.`,
    });
  };

  const openInVertraege = () => {
    toast({
      title: "Vertrags-Modul wird geöffnet",
      description: `Bitte suche nach „${number}" oder dem Praxisnamen.`,
    });
    navigate("/vertrieb/vertraege");
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 space-y-3 transition-opacity",
        dimmed && "opacity-60 hover:opacity-100",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium text-foreground">{product}</div>
          <div className="text-xs text-muted-foreground font-mono">{number}</div>
        </div>
        <ContractStatusPill
          contract={contract}
          onChange={onStatusChange}
          busy={statusBusy}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
        <Field label="Preis" value={price} />
        <Field label="Laufzeit" value={laufzeit} />
        <Field label="Start" value={start} />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() => runPdfAction("preview", () => previewContractPdf(contract))}
        >
          {busy === "preview" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
          Vorschau
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={busy !== null}
          onClick={() => runPdfAction("template", () => templateContractPdf(contract))}
        >
          {busy === "template" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileText className="h-3.5 w-3.5" />
          )}
          Vertragsdaten als PDF
        </Button>
        {contract.document_url && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={busy !== null}
            onClick={() =>
              runPdfAction("storage", async () => {
                const url = await getContractStorageSignedUrl(contract.document_url!);
                window.open(url, "_blank");
              })
            }
          >
            {busy === "storage" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            Manuell hochgeladenes Original
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 ml-auto"
          onClick={openInVertraege}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Im Vertrags-Modul öffnen
        </Button>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="font-medium text-foreground">{value}</div>
    </div>
  );
}
