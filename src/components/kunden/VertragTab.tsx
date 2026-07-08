/**
 * VertragTab — Tab 2 im KundenDialog (Etappe 3a + 3b-i + 3b-ii).
 *
 * Lese-Modus mit drei PDF-Buttons, klickbarer Status-Pille, phasen-
 * abhängigen Mail-/Link-Aktionen pro Vertrag, Lead-Aktionen-Karte und
 * „Vorgang anlegen"-Dialog.
 *
 * TODO Folge-Etappen: Inline-Vertragsanlage, Konditions-Anpassungen,
 * RLS-Erweiterung für Lead-only Cases (über customer_id).
 */
import { useState, useMemo } from "react";
import {
  Eye,
  FileText,
  Download,
  Upload,
  ExternalLink,
  Loader2,
  Plus,
  Check,
  ChevronDown,
  ChevronRight,
  Mail,
  Link2,
  RefreshCw,
  Cloud,
  KeyRound,
  ListChecks,
  AlertTriangle,
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
import { StandortBadge } from "@/components/contracts/StandortBadge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { cn } from "@/lib/utils";
import type {
  UseKundenDialogDataResult,
  ContractRow,
  CaseRow,
} from "@/hooks/useKundenDialogData";
import {
  previewContractPdf,
  downloadContractPdf,
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
import {
  sendMandateMail,
  resendConfirmationMail,
  copyBuchungslink,
} from "@/lib/contractMailActions";
import {
  registerLeadAtQodia,
  sendQodiaCredentials,
} from "@/lib/leadActions";
import {
  createContractCase,
  CASE_TYPE_LABELS,
} from "@/lib/contractCaseActions";

interface VertragTabProps {
  data: UseKundenDialogDataResult;
  onSwitchToTab?: (tab: string) => void;
}

const FINAL_STATUSES = ["beendet", "gekuendigt", "gesperrt"];

export function VertragTab({ data, onSwitchToTab }: VertragTabProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { contracts, isLoading, ssot, lead, customer, derivedPhase, cases, hfxNumber } = data;
  const [newCaseOpen, setNewCaseOpen] = useState(false);

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
  const showLeadActionsCard = !!lead;
  const hasContracts = contracts.length > 0;
  const hasOwner = !!lead?.id || !!customer?.id;
  const canCreateCase = hasContracts; // RLS: nur mit contract_id für Nicht-Admins

  return (
    <div className="space-y-4">
      {hasOwner && (
        <div className="flex justify-end">
          <TooltipProvider delayDuration={150}>
            {canCreateCase ? (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => setNewCaseOpen(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                Vorgang anlegen
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      disabled
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Vorgang anlegen
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Vorgänge können erst nach Vertragsanlage erfasst werden.
                </TooltipContent>
              </Tooltip>
            )}
          </TooltipProvider>
        </div>
      )}

      {cases.length > 0 && (
        <CasesCounterLink
          cases={cases}
          onSwitchToVerlauf={() => onSwitchToTab?.("verlauf")}
        />
      )}

      {showLeadStatusCard && <LeadStatusCard lead={lead!} />}
      {showLeadActionsCard && <LeadActionsCard lead={lead!} />}

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
          return <ContractCard key={c.id} contract={c} dimmed={isFinal} customer={customer} />;
        })}

      <AddLocationButton customer={customer} contracts={contracts} />

      <NewCaseDialog
        open={newCaseOpen}
        onOpenChange={setNewCaseOpen}
        contracts={contracts}
        customerId={customer?.id ?? null}
      />
    </div>
  );
}

/* ─────────────────── Standort hinzufügen (Multi-Standort) ─────────────────── */

function AddLocationButton({
  customer,
  contracts,
}: {
  customer: UseKundenDialogDataResult["customer"];
  contracts: ContractRow[];
}) {
  const navigate = useNavigate();
  const { isAdmin, isVertragsabteilung, isSalesLead, isUser, isRegionalLead } = useUserRole();
  const canCreate = isAdmin || isVertragsabteilung || isSalesLead || isUser || isRegionalLead;
  if (!customer || !canCreate) return null;
  const hasGoae = contracts.some((c) => /GOÄ|GOA/i.test(c.product_name ?? ""));
  if (!hasGoae) return null;
  const hasMandate = !!customer.stripe_customer_id;

  const btn = (
    <Button
      variant="outline"
      size="sm"
      className="gap-1.5"
      disabled={!hasMandate}
      onClick={() => navigate(`/vertrieb/vertraege?addLocationFor=${customer.id}`)}
    >
      <Plus className="h-3.5 w-3.5" />
      Standort hinzufügen
    </Button>
  );

  if (hasMandate) {
    return <div className="flex justify-end">{btn}</div>;
  }
  return (
    <div className="flex justify-end">
      <TooltipProvider delayDuration={150}>
        <Tooltip>
          <TooltipTrigger asChild><span>{btn}</span></TooltipTrigger>
          <TooltipContent>
            Hauptaccount braucht erst aktives Mandat
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
                  {busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
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

/* ────────────────────── Lead-Aktionen-Karte (3b-ii) ────────────────────── */

function LeadActionsCard({ lead }: { lead: NonNullable<UseKundenDialogDataResult["lead"]> }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [registering, setRegistering] = useState(false);
  const [sendingCreds, setSendingCreds] = useState(false);

  const qodiaSynced = !!lead.qodia_synced;

  const handleRegister = async () => {
    setRegistering(true);
    const res = await registerLeadAtQodia({ leadId: lead.id, queryClient });
    setRegistering(false);
    if (res.success) {
      toast({
        title: res.alreadySynced ? "Bereits registriert" : "Bei Qodia registriert",
        description: res.alreadySynced
          ? "Lead war schon bei Qodia angelegt."
          : "Lead wurde erfolgreich übermittelt.",
      });
    } else {
      toast({
        variant: "destructive",
        title: res.conflict ? "Konflikt" : "Fehler",
        description: res.error,
      });
    }
  };

  const handleSendCreds = async () => {
    setSendingCreds(true);
    const res = await sendQodiaCredentials({
      leadId: lead.id,
      queryClient,
      hfxCustomerNumber: lead.hfx_customer_number ?? null,
      userId: user?.id ?? null,
    });
    setSendingCreds(false);
    if (res.success) {
      toast({
        title: "Zugangsdaten gesendet",
        description: `E-Mail an ${lead.email} verschickt.`,
      });
    } else {
      toast({ variant: "destructive", title: "Fehler", description: res.error });
    }
  };

  return (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      <div className="text-sm font-medium text-foreground">Lead-Aktionen</div>
      <div className="flex flex-wrap gap-2">
        <TooltipProvider delayDuration={150}>
          {qodiaSynced ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled>
                    <Cloud className="h-3.5 w-3.5" />
                    Bei Qodia registriert
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Bereits bei Qodia registriert</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={registering}
              onClick={handleRegister}
            >
              {registering ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Cloud className="h-3.5 w-3.5" />
              )}
              Bei Qodia registrieren
            </Button>
          )}

          {!qodiaSynced ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="outline" size="sm" className="gap-1.5" disabled>
                    <KeyRound className="h-3.5 w-3.5" />
                    Zugangsdaten zusenden
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>Erst bei Qodia registrieren</TooltipContent>
            </Tooltip>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={sendingCreds}
              onClick={handleSendCreds}
            >
              {sendingCreds ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <KeyRound className="h-3.5 w-3.5" />
              )}
              Zugangsdaten zusenden
            </Button>
          )}
        </TooltipProvider>
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
  const { isAdmin } = useUserRole();
  const current = (contract.status ?? "entwurf") as ContractStatus;
  const cfg = CONTRACT_STATUS_CONFIG[current] ?? CONTRACT_STATUS_CONFIG.entwurf;
  const Icon = cfg.icon;
  const PROTECTED_TARGETS: ContractStatus[] = ["aktiv", "gekuendigt", "beendet", "gesperrt"];

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
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Icon className="h-3 w-3" />}
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
            // Spiegelt den DB-Guard: geschützte Zielstatus + Rückwärts aus 'aktiv' nur für Admin/System.
            const isAdminGated =
              !isAdmin && (PROTECTED_TARGETS.includes(s) || current === "aktiv");
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
            if (isAdminGated && !isCurrent) {
              return (
                <Tooltip key={s}>
                  <TooltipTrigger asChild>
                    <div>{item}</div>
                  </TooltipTrigger>
                  <TooltipContent>
                    Nur durch Admin änderbar — zur Ausführung bitte Admin kontaktieren.
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
  customer,
}: {
  contract: ContractRow;
  dimmed?: boolean;
  customer?: UseKundenDialogDataResult["customer"];
}) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<"preview" | "download" | "storage" | null>(null);
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
  const laufzeit = (() => {
    const m = contract.duration_months;
    if (m === null || m === undefined) return "—";
    if (m === 0) return "Unbefristet";
    return `${m} Monate`;
  })();
  const start = contract.start_date
    ? new Date(contract.start_date).toLocaleDateString("de-DE")
    : "—";

  const runPdfAction = async (
    kind: "preview" | "download" | "storage",
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
        <div className="flex items-center gap-2 flex-wrap">
          <div>
            <div className="font-medium text-foreground">{product}</div>
            <div className="text-xs text-muted-foreground font-mono">{number}</div>
          </div>
          {/* Multi-Standort: zentraler Badge (GOÄ-Gate + NULL-Guard inside). */}
          <StandortBadge
            productName={contract.product_name}
            contractId={contract.id}
            carrierContractId={customer?.base_fee_contract_id ?? null}
          />

        </div>
        <ContractStatusPill contract={contract} onChange={onStatusChange} busy={statusBusy} />
      </div>

      {/* Pre-System-Hinweis: aktiv ohne Stripe-Customer (= kein SEPA-Mandat hinterlegt) */}
      {(contract.status ?? "").toLowerCase() === "aktiv" && !contract.stripe_customer_id && (
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-2 text-xs text-warning-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0 mt-0.5" />
          <span>
            Pre-System-Vertrag: aktiv, aber kein SEPA-Mandat hinterlegt. Mandat-Mail kann unten ausgelöst werden.
          </span>
        </div>
      )}

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
          onClick={() => runPdfAction("download", () => downloadContractPdf(contract))}
        >
          {busy === "download" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          PDF herunterladen
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

      <div className="border-t pt-3 mt-1">
        <ContractActions contract={contract} />
      </div>
    </div>
  );
}

/* ────────────────────── ContractActions (3b-ii) ────────────────────── */

function ContractActions({ contract }: { contract: ContractRow }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<"mandate" | "resend-mandate" | "link" | "confirm" | null>(null);
  const [confirmOpen, setConfirmOpen] = useState<"resend-mandate" | "confirm" | null>(null);

  const status = (contract.status ?? "entwurf").toLowerCase();
  const mandateSent = !!contract.mandate_email_sent_at;
  const hfxNum = (contract.hfx_customer_number as string | null | undefined) ?? null;
  const userId = user?.id ?? null;

  const phase: "entwurf" | "eingegangen" | "gezeichnet" | "aktiv" | "final" | "other" =
    status === "entwurf"
      ? "entwurf"
      : status === "eingegangen"
        ? "eingegangen"
        : status === "gezeichnet"
          ? "gezeichnet"
          : status === "aktiv"
            ? "aktiv"
            : FINAL_STATUSES.includes(status)
              ? "final"
              : "other";

  const isPreSystemAktiv = phase === "aktiv" && !contract.stripe_customer_id;

  if (phase === "entwurf" || phase === "final" || phase === "other") {
    return (
      <div className="text-xs text-muted-foreground">
        Keine Aktionen in diesem Status verfügbar.
      </div>
    );
  }

  const runMandateInitial = async () => {
    setPending("mandate");
    const res = await sendMandateMail({
      contractId: contract.id,
      force: false,
      queryClient,
      hfxCustomerNumber: hfxNum,
      userId,
    });
    setPending(null);
    if (res.success) {
      toast({
        title: res.skipped ? "Bereits gesendet" : "SEPA-Mandat-Mail gesendet",
        description: res.skipped
          ? "Die Mandat-Mail wurde bereits versendet."
          : "E-Mail wurde an den Kunden verschickt.",
      });
    } else {
      toast({ variant: "destructive", title: "Fehler", description: res.error });
    }
  };

  const runMandateResend = async () => {
    setPending("resend-mandate");
    const res = await sendMandateMail({
      contractId: contract.id,
      force: true,
      queryClient,
      hfxCustomerNumber: hfxNum,
      userId,
    });
    setPending(null);
    if (res.success) {
      toast({
        title: "Mandat-Mail erneut gesendet",
        description: "E-Mail wurde an den Kunden verschickt.",
      });
    } else {
      toast({ variant: "destructive", title: "Fehler", description: res.error });
    }
  };

  const runCopyLink = async () => {
    setPending("link");
    const res = await copyBuchungslink({ contractId: contract.id });
    setPending(null);
    if (res.success) {
      toast({ title: "Link kopiert", description: res.url });
    } else {
      toast({
        variant: "destructive",
        title: "Konnte nicht kopieren",
        description: `${res.error ?? "Fehler"} — ${res.url}`,
      });
    }
  };

  const runResendConfirm = async () => {
    setPending("confirm");
    const res = await resendConfirmationMail({
      contractId: contract.id,
      force: true,
      queryClient,
      hfxCustomerNumber: hfxNum,
      userId,
    });
    setPending(null);
    if (res.success) {
      if (res.skipped) {
        toast({
          title: "Mail nicht erneut gesendet",
          description: "Aus unbekanntem Grund übersprungen.",
        });
      } else {
        toast({
          title: "Vertragsbestätigungs-Mail erneut gesendet",
          description: "E-Mail wurde an den Kunden verschickt.",
        });
      }
    } else {
      toast({ variant: "destructive", title: "Fehler", description: res.error });
    }
  };

  const anyPending = pending !== null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {(phase === "eingegangen" || phase === "gezeichnet") && (
          <>
            {phase === "eingegangen" && !mandateSent && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={anyPending}
                onClick={runMandateInitial}
              >
                {pending === "mandate" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Mail className="h-3.5 w-3.5" />
                )}
                SEPA-Mandat-Mail senden
              </Button>
            )}
            {phase === "eingegangen" && mandateSent && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={anyPending}
                onClick={() => setConfirmOpen("resend-mandate")}
              >
                {pending === "resend-mandate" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Mandat-Mail erneut senden
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={anyPending}
              onClick={runCopyLink}
            >
              {pending === "link" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="h-3.5 w-3.5" />
              )}
              Buchungslink kopieren
            </Button>
          </>
        )}

        {phase === "aktiv" && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={anyPending}
            onClick={() => setConfirmOpen("confirm")}
          >
            {pending === "confirm" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Vertragsbestätigungs-Mail erneut senden
          </Button>
        )}

        {/* Pre-System-Vertrag: aktiv ohne Stripe-Customer → Mandat-Mail nachträglich auslösen.
            Erst-Versand (kein mandate_email_sent_at): direkt mit force=false.
            Erneut-Versand (mandate_email_sent_at gesetzt, Stripe-ID aber weiterhin NULL):
            force=true mit Confirm-Dialog (analog zur eingegangen-Phase). */}
        {isPreSystemAktiv && (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={anyPending}
            onClick={() => (mandateSent ? setConfirmOpen("resend-mandate") : runMandateInitial())}
          >
            {pending === "mandate" || pending === "resend-mandate" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : mandateSent ? (
              <RefreshCw className="h-3.5 w-3.5" />
            ) : (
              <Mail className="h-3.5 w-3.5" />
            )}
            {mandateSent ? "SEPA-Mandat-Mail erneut senden" : "SEPA-Mandat-Mail senden"}
          </Button>
        )}
      </div>

      <AlertDialog
        open={confirmOpen !== null}
        onOpenChange={(o) => !o && setConfirmOpen(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmOpen === "resend-mandate"
                ? "Mandat-Mail erneut senden?"
                : "Vertragsbestätigungs-Mail erneut senden?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmOpen === "resend-mandate"
                ? "Der Kunde erhält die SEPA-Mandat-Mail noch einmal. Vorherige Links bleiben gültig."
                : "Der Kunde erhält die Vertragsbestätigung inklusive Anhängen erneut."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const mode = confirmOpen;
                setConfirmOpen(null);
                if (mode === "resend-mandate") runMandateResend();
                if (mode === "confirm") runResendConfirm();
              }}
            >
              Erneut senden
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ────────────────────── NewCaseDialog (3b-ii) ────────────────────── */

function NewCaseDialog({
  open,
  onOpenChange,
  contracts,
  customerId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contracts: ContractRow[];
  customerId: string | null;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const activeFirst = useMemo(() => {
    const active = contracts.filter(
      (c) => !FINAL_STATUSES.includes((c.status ?? "").toLowerCase()),
    );
    const finished = contracts.filter((c) =>
      FINAL_STATUSES.includes((c.status ?? "").toLowerCase()),
    );
    return [...active, ...finished];
  }, [contracts]);

  const defaultContractId = activeFirst[0]?.id ?? "";

  const [caseType, setCaseType] = useState("support");
  const [contractId, setContractId] = useState<string>(defaultContractId);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [creating, setCreating] = useState(false);

  // Reset on open
  const resetForm = () => {
    setCaseType("support");
    setContractId(activeFirst[0]?.id ?? "");
    setTitle("");
    setNotes("");
  };

  const allFinal =
    contracts.length > 0 &&
    contracts.every((c) => FINAL_STATUSES.includes((c.status ?? "").toLowerCase()));

  const handleSubmit = async () => {
    if (!contractId) {
      toast({
        variant: "destructive",
        title: "Vertrag fehlt",
        description: "Bitte wählen Sie einen Vertrag aus.",
      });
      return;
    }
    if (!title.trim()) {
      toast({
        variant: "destructive",
        title: "Titel fehlt",
        description: "Bitte geben Sie einen Titel ein.",
      });
      return;
    }
    setCreating(true);
    const res = await createContractCase({
      customerId,
      contractId,
      caseType,
      title: title.trim(),
      notes: notes.trim() || undefined,
      userId: user?.id ?? null,
      queryClient,
    });
    setCreating(false);
    if (res.success) {
      toast({ title: "Vorgang angelegt", description: title.trim() });
      resetForm();
      onOpenChange(false);
    } else {
      toast({ variant: "destructive", title: "Fehler", description: res.error });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) resetForm();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vorgang anlegen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {allFinal && (
            <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-warning-foreground">
              Hinweis: Alle Verträge sind in einem End-Status.
            </div>
          )}

          <div className="space-y-2">
            <Label>Typ</Label>
            <Select value={caseType} onValueChange={setCaseType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CASE_TYPE_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Vertrag</Label>
            <Select value={contractId} onValueChange={setContractId}>
              <SelectTrigger>
                <SelectValue placeholder="Vertrag wählen…" />
              </SelectTrigger>
              <SelectContent>
                {activeFirst.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {(c.contract_number ?? c.id.slice(0, 8)) +
                      " — " +
                      (c.product_name ?? "—")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Titel</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z. B. Frage zu HFX EBM"
            />
          </div>

          <div className="space-y-2">
            <Label>Notiz</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={creating}>
            {creating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                Anlegen…
              </>
            ) : (
              "Anlegen"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

/* ────────────────────── CasesCounterLink (Etappe 4) ────────────────────── */

function CasesCounterLink({
  cases,
  onSwitchToVerlauf,
}: {
  cases: CaseRow[];
  onSwitchToVerlauf: () => void;
}) {
  const openCount = cases.filter((c) => c.status === "offen").length;
  const closedCount = cases.filter((c) => c.status !== "offen").length;

  return (
    <button
      type="button"
      onClick={onSwitchToVerlauf}
      className="w-full rounded-lg border bg-card p-3 text-left hover:bg-muted/30 transition-colors flex items-center gap-3"
    >
      <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">Vorgänge</div>
        <div className="text-xs text-muted-foreground">
          {openCount} offen
          {closedCount > 0 && ` · ${closedCount} erledigt`}
          {" — im Verlauf-Tab anzeigen"}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

