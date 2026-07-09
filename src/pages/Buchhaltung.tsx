import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import {
  Download,
  TrendingUp,
  Users,
  Receipt,
  Plus,
  Loader2,
  Upload,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileSpreadsheet,
  Building2,
  Euro,
  Settings2,
  RefreshCw,
  Eye,
  FileCheck,
  Link2,
  ShieldCheck,
  AlertTriangle,
  XCircle,
  CreditCard,
  History,
  Pencil,
  Ban,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { useLexwareIntegration } from "@/hooks/useLexwareIntegration";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { de } from "date-fns/locale";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmtEur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const fmtDate = (s: string) =>
  format(new Date(s + (s.length === 10 ? "T00:00:00" : "")), "dd.MM.yyyy", { locale: de });

const fmtDateTime = (s: string) => {
  try { return format(new Date(s), "dd.MM.yyyy HH:mm", { locale: de }); } catch { return s; }
};

import { downloadCsv } from "@/lib/csv";

// Lexware-compatible header sets
const REVENUE_HEADERS = ["Datum", "Belegnummer", "Buchungstext", "Konto", "Gegenkonto", "Nettobetrag", "USt-Satz %", "USt-Betrag", "Bruttobetrag", "Kostenstelle", "Zahlungsart"];
const COST_HEADERS = ["Datum", "Belegnummer", "Buchungstext", "Lieferant", "Kostenkategorie", "Kunde", "HFX-Nr", "Produkt", "Konto", "Gegenkonto", "Nettobetrag", "USt-Satz %", "USt-Betrag", "Bruttobetrag"];

// FiBu booking-format CSV headers (clean, auditable booking records)
const FIBU_CSV_HEADERS = [
  "Buchungsdatum", "Belegdatum", "Belegnummer", "Buchungstext",
  "Kundennummer", "Rechnungsnummer", "Produkt",
  "Konto (Soll)", "Gegenkonto (Haben)",
  "Nettobetrag", "USt-Satz %", "USt-Betrag", "Bruttobetrag", "Währung",
  "Vorgangstyp", "Batch-Referenz", "Event-ID",
];

// SKR03 Kontenrahmen – Mapping event_type → debit_account / credit_account
const SKR03_ACCOUNT_MAP: Record<string, { debit: string; credit: string; label: string }> = {
  invoice_base_fee_created:      { debit: "1200", credit: "8400", label: "Erlös Grundgebühr" },
  invoice_usage_created:         { debit: "1200", credit: "8400", label: "Erlös Verbrauch" },
  invoice_created:               { debit: "1200", credit: "8400", label: "Erlös Rechnung" },
  vendor_cost_created:           { debit: "3300", credit: "1600", label: "Fremdleistung/Kosten" },
  // TODO: unused event_type, siehe Kontierungs-Audit
  commission_created:            { debit: "4780", credit: "1600", label: "Provision Vertrieb" },
  internal_sales_bonus_reference:{ debit: "4780", credit: "1600", label: "Provision Vertrieb" },
  cancellation_created:          { debit: "8400", credit: "1200", label: "Storno/Gutschrift" },
  correction_created:            { debit: "8400", credit: "1200", label: "Korrektur" },
  payment_received:              { debit: "1800", credit: "1200", label: "Zahlungseingang" },
  refund_created:                { debit: "1200", credit: "1800", label: "Erstattung" },
};
const DEFAULT_ACCOUNTS = { debit: "9999", credit: "9999", label: "Sonstiger Vorfall" };

// Nicht-buchungsrelevante Event-Typen — bleiben in DB/Ansicht sichtbar,
// werden aber NIE in einen Export-Batch oder in die CSV aufgenommen.
const NON_BOOKABLE_EVENT_TYPES = new Set<string>([
  "payment_received_reference",
  "payment_failed_reference",
  "auto_invoice_charge_failed",
]);

// Legacy Lexware Kontenrahmen (for legacy direct exports)
const REVENUE_ACCOUNT = "8400";
const REVENUE_CONTRA = "1400";
const COST_ACCOUNT = "3300";
const COST_CONTRA = "1600";

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const d = subMonths(new Date(), i);
  return { label: format(d, "MMMM yyyy", { locale: de }), value: format(d, "yyyy-MM") };
});

const COST_CATEGORIES = ["Lizenzkosten", "Servicegebühr", "Support", "White-Label", "Sonstige"];

interface PreviewRevenue {
  id: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  product_name: string;
  quantity: number;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
}

interface FibuEvent {
  id: string;
  event_type: string;
  source_module: string;
  source_reference_id: string | null;
  customer_id: string | null;
  contract_id: string | null;
  product_name: string | null;
  period_start: string | null;
  period_end: string | null;
  occurred_at: string;
  amount_net: number;
  tax_amount: number;
  amount_gross: number;
  currency: string;
  commission_type: string | null;
  commission_base_amount: number | null;
  commission_rate: number | null;
  commission_amount: number | null;
  commission_rule_version: string | null;
  beneficiary_type: string | null;
  beneficiary_id: string | null;
  cost_type: string | null;
  supplier: string | null;
  status: string;
  export_status: string;
  export_batch_id: string | null;
  exported_at: string | null;
  correction_of_event_id: string | null;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by: string | null;
}

interface FibuExportBatch {
  id: string;
  batch_reference: string;
  export_type: string;
  period_from: string;
  period_to: string;
  exported_by: string | null;
  exported_at: string;
  record_count: number;
  amount_net_total: number | null;
  amount_gross_total: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

// ─── Status badge helpers ────────────────────────────────────────────────────

function FibuStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "approved": return <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">Freigegeben</Badge>;
    case "corrected": return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Korrigiert</Badge>;
    case "cancelled": return <Badge variant="destructive">Storniert</Badge>;
    default: return <Badge variant="outline" className="text-muted-foreground">Entwurf</Badge>;
  }
}

function FibuExportStatusBadge({ exportStatus }: { exportStatus: string }) {
  switch (exportStatus) {
    case "exported": return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Exportiert</Badge>;
    case "blocked": return <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20"><Ban className="h-3 w-3 mr-1" />Gesperrt</Badge>;
    default: return <Badge variant="outline" className="text-muted-foreground">Offen</Badge>;
  }
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  invoice_base_fee_created: "Grundgebühr",
  invoice_usage_created: "Verbrauchsrechnung",
  payment_received_reference: "Zahlungseingang",
  partner_commission_approved: "Partner-Provision",
  tipster_commission_released: "Tippgeber-Provision",
  internal_sales_bonus_reference: "Internes Bonus",
  vendor_cost_created: "Kosten",
  credit_note_created: "Gutschrift",
  correction_created: "Korrektur",
  cancellation_created: "Storno",
};

// ─── main component ──────────────────────────────────────────────────────────

export default function Buchhaltung() {
  const [tab, setTab] = useState("erlöse");
  const [periodMode, setPeriodMode] = useState<"month" | "custom">("month");
  const [selectedMonth, setSelectedMonth] = useState(MONTH_OPTIONS[0].value);
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [includeInternal, setIncludeInternal] = useState(false);
  const { user } = useAuth();
  const { isAdmin } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // FiBu event state
  const [fibuEventTypeFilter, setFibuEventTypeFilter] = useState("all");
  const [fibuStatusFilter, setFibuStatusFilter] = useState("all");
  const [fibuExportStatusFilter, setFibuExportStatusFilter] = useState("open");
  const [correctionDialogOpen, setCorrectionDialogOpen] = useState(false);
  const [correctionEventId, setCorrectionEventId] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [exportConfirmOpen, setExportConfirmOpen] = useState(false);

  // Manual billing trigger state
  const [billingDialogOpen, setBillingDialogOpen] = useState(false);
  const [billingContractId, setBillingContractId] = useState("");
  const [billingLoading, setBillingLoading] = useState(false);
  const [activeContracts, setActiveContracts] = useState<any[]>([]);
  const [contractsLoaded, setContractsLoaded] = useState(false);

  // Load active contracts for billing dropdown
  const loadActiveContracts = useCallback(async () => {
    if (contractsLoaded) return;
    const { data } = await supabase
      .from("contracts")
      .select("id, customer_name, hfx_customer_number, product_name, monthly_price")
      .eq("status", "aktiv")
      .order("customer_name");
    setActiveContracts(data || []);
    setContractsLoaded(true);
  }, [contractsLoaded]);

  const handleManualBilling = async () => {
    if (!billingContractId) return;
    setBillingLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-invoice", {
        body: { contract_id: billingContractId },
      });
      if (error) throw error;
      if (data?.success === false) {
        toast({ title: "Abrechnung nicht möglich", description: data.error || "Unbekannter Fehler", variant: "destructive" });
      } else {
        toast({
          title: "Abrechnung erstellt",
          description: `${data?.processed ?? 0} Rechnung(en) erzeugt, ${data?.skipped ?? 0} übersprungen.`,
        });
        queryClient.invalidateQueries({ queryKey: ["accounting"] });
        queryClient.invalidateQueries({ queryKey: ["fibu-events"] });
      }
      setBillingDialogOpen(false);
      setBillingContractId("");
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setBillingLoading(false);
    }
  };

  // ── Test-Verbrauch (Admin-only, nur Test-Verträge) ──
  const [seedDialogOpen, setSeedDialogOpen] = useState(false);
  const [seedContractId, setSeedContractId] = useState("");
  const [seedQuantity, setSeedQuantity] = useState(20);
  const [seedLoading, setSeedLoading] = useState(false);
  const testContracts = activeContracts.filter((c) => /test/i.test(c.customer_name || ""));

  const handleSeedTestUsage = async () => {
    if (!seedContractId || seedQuantity <= 0) return;
    setSeedLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("seed-test-usage", {
        body: { contract_id: seedContractId, quantity: seedQuantity },
      });
      if (error) throw error;
      if (data?.success === false || data?.error) {
        toast({ title: "Test-Verbrauch fehlgeschlagen", description: data?.error || "Unbekannter Fehler", variant: "destructive" });
      } else {
        const c = activeContracts.find((x) => x.id === seedContractId);
        toast({
          title: "Test-Verbrauch erzeugt",
          description: `${data.quantity} Positionen für ${c?.customer_name ?? "Vertrag"} (${Number(data.net_amount).toFixed(2)} € netto).`,
        });
        queryClient.invalidateQueries({ queryKey: ["usage-charges"] });
        setSeedDialogOpen(false);
      }
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSeedLoading(false);
    }
  };

  // ── Zwischenabrechnung (Admin-only) ──
  const [interimDialogOpen, setInterimDialogOpen] = useState(false);
  const [interimContractId, setInterimContractId] = useState("");
  const [interimLoading, setInterimLoading] = useState(false);
  const [interimPreview, setInterimPreview] = useState<{
    count: number; net: number; from: string | null; to: string | null;
  } | null>(null);
  const [interimPreviewLoading, setInterimPreviewLoading] = useState(false);

  // Preview must use the SAME filter as the function: status='pending' AND net_amount > 0.
  useEffect(() => {
    if (!interimContractId) { setInterimPreview(null); return; }
    let cancelled = false;
    (async () => {
      setInterimPreviewLoading(true);
      const { data } = await supabase
        .from("usage_charges")
        .select("net_amount, period_from, period_to")
        .eq("contract_id", interimContractId)
        .eq("status", "pending")
        .gt("net_amount", 0);
      if (cancelled) return;
      if (!data || data.length === 0) {
        setInterimPreview({ count: 0, net: 0, from: null, to: null });
      } else {
        const net = data.reduce((s: number, r: any) => s + Number(r.net_amount), 0);
        const from = data.reduce((m: string, r: any) => !m || r.period_from < m ? r.period_from : m, "");
        const to = data.reduce((m: string, r: any) => !m || r.period_to > m ? r.period_to : m, "");
        setInterimPreview({ count: data.length, net, from, to });
      }
      setInterimPreviewLoading(false);
    })();
    return () => { cancelled = true; };
  }, [interimContractId]);

  const handleInterimInvoice = async () => {
    if (!interimContractId) return;
    setInterimLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("manual-interim-invoice", {
        body: { contract_id: interimContractId },
      });
      if (error) throw error;
      if (data?.success === false || data?.error) {
        toast({ title: "Zwischenabrechnung nicht möglich", description: data?.error || "Unbekannter Fehler", variant: "destructive" });
      } else {
        const stripeStatus = data.stripe_failed ? "Stripe fehlgeschlagen" : (data.stripe_invoice_id ? "bezahlt/eingezogen" : "kein Stripe");
        toast({
          title: "Zwischenabrechnung erstellt",
          description: `${data.invoice_number} (${Number(data.gross_amount).toFixed(2)} € brutto). Stripe: ${stripeStatus}.`,
        });
        queryClient.invalidateQueries({ queryKey: ["accounting"] });
        queryClient.invalidateQueries({ queryKey: ["accounting-revenues"] });
        queryClient.invalidateQueries({ queryKey: ["fibu-events"] });
        queryClient.invalidateQueries({ queryKey: ["invoices"] });
        queryClient.invalidateQueries({ queryKey: ["usage-charges"] });
        setInterimDialogOpen(false);
        setInterimContractId("");
      }
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setInterimLoading(false);
    }
  };

  const effectiveFrom = periodMode === "month" ? `${selectedMonth}-01` : dateFrom;
  const effectiveTo = periodMode === "month"
    ? format(endOfMonth(new Date(selectedMonth + "-01")), "yyyy-MM-dd")
    : dateTo;

  // ── Lexware Integration ──
  const {
    settings,
    syncLogs,
    isLoading: lexLoading,
    isConnecting,
    isExporting,
    connect,
    disconnect,
    exportData,
    updateSettings,
    refresh: refreshLex,
  } = useLexwareIntegration();

  const [lexwareApiKey, setLexwareApiKey] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncInterval, setSyncInterval] = useState("daily");
  const [syncTime, setSyncTime] = useState("14:00");
  const [exportType, setExportType] = useState<"umsaetze" | "rechnungen" | "provisionen">("umsaetze");
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewRevenue[]>([]);

  useEffect(() => {
    if (settings) {
      setAutoSyncEnabled(settings.auto_sync_enabled);
      setSyncInterval(settings.sync_interval);
      setSyncTime(settings.sync_time);
    }
  }, [settings]);

  const isConnected = settings?.is_connected ?? false;

  const handleConnect = async () => {
    const success = await connect(lexwareApiKey);
    if (success) setLexwareApiKey("");
  };

  const handleShowPreview = async () => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    try {
      let query = supabase
        .from("v_customer_revenues_compat" as any)
        .select("id, customer_name, invoice_number, invoice_date, product_name, quantity, net_amount, tax_amount, gross_amount")
        .eq("exported_to_lexware", false)
        .order("invoice_date", { ascending: true });
      if (exportDateFrom) query = query.gte("invoice_date", exportDateFrom);
      if (exportDateTo) query = query.lte("invoice_date", exportDateTo);
      const { data, error } = await query;
      if (error) throw error;
      setPreviewData((data as unknown as PreviewRevenue[]) || []);
    } catch (error) {
      console.error(error);
      setPreviewData([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExport = async () => {
    setPreviewOpen(false);
    await exportData(exportType, exportDateFrom, exportDateTo);
  };

  const previewTotals = {
    count: previewData.length,
    netTotal: previewData.reduce((sum, r) => sum + Number(r.net_amount), 0),
    taxTotal: previewData.reduce((sum, r) => sum + Number(r.tax_amount), 0),
    grossTotal: previewData.reduce((sum, r) => sum + Number(r.gross_amount), 0),
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error": return <AlertCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success": return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Erfolgreich</Badge>;
      case "error": return <Badge variant="destructive">Fehler</Badge>;
      case "pending": return <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20">Ausstehend</Badge>;
      default: return <Badge variant="outline">Unbekannt</Badge>;
    }
  };

  // ── queries ──
  const { data: revenues = [], isLoading: revLoading } = useQuery({
    queryKey: ["accounting-revenues", effectiveFrom, effectiveTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .gte("invoice_date", effectiveFrom)
        .lte("invoice_date", effectiveTo)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Commission payouts from persisted commission_payouts table (replaces live calculation)
  const { data: commissions = [], isLoading: commLoading } = useQuery({
    queryKey: ["accounting-commissions", effectiveFrom, effectiveTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_payouts")
        .select("*")
        .in("status", ["approved", "paid"])
        .gte("created_at", effectiveFrom)
        .lte("created_at", effectiveTo)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: costs = [], isLoading: costLoading } = useQuery({
    queryKey: ["accounting-costs", effectiveFrom, effectiveTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounting_costs")
        .select("*")
        .gte("cost_date", effectiveFrom)
        .lte("cost_date", effectiveTo)
        .order("cost_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // FiBu Events query
  const { data: fibuEvents = [], isLoading: fibuLoading, refetch: refetchFibu } = useQuery({
    queryKey: ["fibu-events", effectiveFrom, effectiveTo, fibuEventTypeFilter, fibuStatusFilter, fibuExportStatusFilter],
    queryFn: async () => {
      let q = (supabase as any)
        .from("fibu_events")
        .select("*")
        .gte("occurred_at", effectiveFrom)
        .lte("occurred_at", effectiveTo + "T23:59:59")
        .order("occurred_at", { ascending: false });
      if (fibuEventTypeFilter !== "all") q = q.eq("event_type", fibuEventTypeFilter);
      if (fibuStatusFilter !== "all") q = q.eq("status", fibuStatusFilter);
      if (fibuExportStatusFilter !== "all") q = q.eq("export_status", fibuExportStatusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: tab === "vorfaelle" || tab === "zahlungen",
  });

  // FiBu export batches
  const { data: exportBatches = [], isLoading: batchLoading, refetch: refetchBatches } = useQuery({
    queryKey: ["fibu-export-batches"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fibu_export_batches")
        .select("*")
        .order("exported_at", { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: tab === "export-protokoll",
  });

  const totalRevenue = revenues.reduce((s: number, r: any) => s + (r.gross_amount ?? 0), 0);
  const externalCommissions = commissions.filter((c: any) => c.commission_role !== "ad");
  const internalCommissions = commissions.filter((c: any) => c.commission_role === "ad");
  const totalCommission = externalCommissions.reduce((s: number, c: any) => s + Number(c.commission_amount), 0);
  const totalCosts = costs.reduce((s: number, c: any) => s + (c.gross_amount ?? 0), 0);

  // Exportable fibu events (status=approved AND export_status=open)
  const exportableFibuEvents = fibuEvents.filter((e: any) => e.status === "approved" && e.export_status === "open");

  // ── Legacy CSV exports (Direktexport) ──
  const exportRevenues = () => {
    const rows = [REVENUE_HEADERS, ...revenues.map((r: any) => [
      fmtDate(r.invoice_date), r.invoice_number, `Rechnung ${r.customer_name}`,
      REVENUE_ACCOUNT, REVENUE_CONTRA,
      r.net_amount?.toFixed(2), r.tax_rate?.toFixed(0), r.tax_amount?.toFixed(2), r.gross_amount?.toFixed(2), "", "SEPA"
    ])];
    const label = periodMode === "month" ? selectedMonth : `${effectiveFrom}_${effectiveTo}`;
    downloadCsv(rows, `HFX_Erlöse_${label}.csv`);
    toast({ title: "Direktexport erfolgreich", description: `${revenues.length} Erlösbuchungen exportiert (Legacy).` });
  };

  const exportCommissionsLegacy = () => {
    const toExport = includeInternal ? commissions : externalCommissions;
    const rows = [
      ["Datum", "Monat", "Vertriebler", "Rolle", "Produkt", "Basis", "Satz", "Betrag", "Regelversion", "Status"],
      ...toExport.map((c: any) => [
        fmtDate(c.created_at), c.period_month, c.sales_partner_name,
        c.commission_role || "–", c.product_name,
        c.commission_base_amount != null ? Number(c.commission_base_amount).toFixed(2) : "–",
        c.commission_type === "prozent" ? `${c.commission_rate}%` : fmtEur(Number(c.commission_rate)),
        Number(c.commission_amount).toFixed(2),
        c.commission_rule_version || "–",
        c.status,
      ]),
    ];
    const label = periodMode === "month" ? selectedMonth : `${effectiveFrom}_${effectiveTo}`;
    downloadCsv(rows, `HFX_Provisionen_${label}.csv`);
    toast({ title: "Direktexport erfolgreich", description: `${toExport.length} Provisionsbuchungen exportiert (Legacy).` });
  };

  const exportCosts = () => {
    const rows = [COST_HEADERS, ...costs.map((c: any) => [
      fmtDate(c.cost_date), c.invoice_reference ?? `KOST-${c.id.slice(0, 8).toUpperCase()}`,
      `${c.category} ${c.supplier}`, c.supplier, c.category, c.customer_name,
      c.hfx_customer_number ?? "", c.product_name ?? "",
      COST_ACCOUNT, COST_CONTRA,
      c.net_amount?.toFixed(2), c.tax_rate?.toFixed(0), c.tax_amount?.toFixed(2), c.gross_amount?.toFixed(2)
    ])];
    const label = periodMode === "month" ? selectedMonth : `${effectiveFrom}_${effectiveTo}`;
    downloadCsv(rows, `HFX_Kosten_${label}.csv`);
    toast({ title: "Direktexport erfolgreich", description: `${costs.length} Kostenbuchungen exportiert (Legacy).` });
  };

  // ── FiBu event mutations ──
  const approveEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("fibu_events" as any)
        .update({ status: "approved" })
        .eq("id", eventId);
      if (error) throw error;
      // Audit log
      await supabase.from("fibu_audit_log" as any).insert({
        entity_type: "fibu_event",
        entity_id: eventId,
        action_type: "status_changed",
        new_value_json: { status: "approved" },
        changed_by: user?.id,
        reason: "Manual approval",
      });
    },
    onSuccess: () => { toast({ title: "Vorfall freigegeben" }); refetchFibu(); },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const blockEventMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase
        .from("fibu_events" as any)
        .update({ export_status: "blocked" })
        .eq("id", eventId);
      if (error) throw error;
      await supabase.from("fibu_audit_log" as any).insert({
        entity_type: "fibu_event",
        entity_id: eventId,
        action_type: "blocked",
        new_value_json: { export_status: "blocked" },
        changed_by: user?.id,
      });
    },
    onSuccess: () => { toast({ title: "Vorfall gesperrt" }); refetchFibu(); },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const createCorrectionMutation = useMutation({
    mutationFn: async ({ originalId, reason }: { originalId: string; reason: string }) => {
      // Mark original as corrected
      await supabase.from("fibu_events" as any).update({ status: "corrected" }).eq("id", originalId);
      // Load original for copying
      const { data: origRaw } = await (supabase as any).from("fibu_events").select("*").eq("id", originalId).maybeSingle();
      const orig = origRaw as FibuEvent | null;
      if (!orig) throw new Error("Original event not found");
      // Create correction entry
      const { error } = await supabase.from("fibu_events" as any).insert({
        event_type: "correction_created",
        source_module: orig.source_module,
        source_reference_id: null,
        customer_id: orig.customer_id,
        contract_id: orig.contract_id,
        product_name: orig.product_name,
        amount_net: -Number(orig.amount_net),
        tax_amount: -Number(orig.tax_amount),
        amount_gross: -Number(orig.amount_gross),
        currency: orig.currency,
        status: "draft",
        export_status: "open",
        correction_of_event_id: originalId,
        description: `Korrektur zu: ${orig.description ?? orig.event_type}`,
        created_by: user?.id,
        metadata: { reason, original_id: originalId },
      });
      if (error) throw error;
      await supabase.from("fibu_audit_log" as any).insert({
        entity_type: "fibu_event",
        entity_id: originalId,
        action_type: "corrected",
        new_value_json: { status: "corrected", reason },
        changed_by: user?.id,
        reason,
      });
    },
    onSuccess: () => {
      toast({ title: "Korrektur erstellt" });
      setCorrectionDialogOpen(false);
      setCorrectionEventId(null);
      setCorrectionReason("");
      refetchFibu();
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  // ── FiBu batch export ──
  const handleFibuExport = async () => {
    setExportConfirmOpen(false);
    if (exportableFibuEvents.length === 0) {
      toast({ title: "Keine exportierbaren Vorfälle", description: "Nur Vorfälle mit Status 'Freigegeben' und Exportstatus 'Offen' können exportiert werden." });
      return;
    }
    try {
      const year = new Date().getFullYear();

      // Point 2: Use DB sequence for collision-free batch reference
      // nextval() is called via a raw query through the Supabase REST API
      const { data: seqData, error: seqErr } = await (supabase as any)
        .from("fibu_export_batch_seq_view")
        .select("nextval")
        .limit(1)
        .maybeSingle()
        .catch(() => ({ data: null, error: new Error("seq_fallback") }));
      // Fallback: if the view isn't available, use a monotonic timestamp suffix
      const seqNum = seqData?.nextval
        ? String(seqData.nextval).padStart(4, "0")
        : String(Date.now()).slice(-6);
      const batchRef = `HFX-EXP-${year}-${seqNum}`;

      const grossTotal = exportableFibuEvents.reduce((s: number, e: any) => s + Number(e.amount_gross), 0);
      const netTotal = exportableFibuEvents.reduce((s: number, e: any) => s + Number(e.amount_net), 0);
      const eventIds = exportableFibuEvents.map((e: any) => e.id);

      // Point 1: Transactional safety — INSERT batch FIRST, then mark events.
      // If the batch insert fails we throw immediately and events are never touched.
      // If the event-update fails after a successful batch insert, the batch stays
      // in status 'pending' and events remain 'open', making the inconsistency
      // visible and recoverable without data loss.
      const { data: batchRaw, error: batchErr } = await (supabase as any)
        .from("fibu_export_batches")
        .insert({
          batch_reference: batchRef,
          export_type: fibuEventTypeFilter === "all" ? "all" : fibuEventTypeFilter,
          period_from: effectiveFrom,
          period_to: effectiveTo,
          exported_by: user?.id,
          record_count: exportableFibuEvents.length,
          amount_net_total: netTotal,
          amount_gross_total: grossTotal,
          status: "pending",   // ← starts as pending; updated to 'completed' only after events are marked
        })
        .select("id")
        .single();

      if (batchErr) throw batchErr;   // hard stop — events untouched
      const batch = batchRaw as { id: string };

      // Mark events as exported — only reached when batch record is safely committed
      const { error: updateErr } = await supabase
        .from("fibu_events" as any)
        .update({ export_status: "exported", export_batch_id: batch.id, exported_at: new Date().toISOString() })
        .in("id", eventIds);

      if (updateErr) {
        // Batch exists but events not updated → leave batch as 'pending' for manual reconciliation
        console.error("[fibu-export] event update failed after batch insert", updateErr.message);
        toast({ title: "Exportfehler", description: "Batch wurde angelegt, Events konnten nicht markiert werden. Bitte Support kontaktieren.", variant: "destructive" });
        refetchBatches();
        return;
      }

      // Finalize batch status to 'completed' now that events are safely marked
      await (supabase as any)
        .from("fibu_export_batches")
        .update({ status: "completed" })
        .eq("id", batch.id);

      // Audit log
      await supabase.from("fibu_audit_log" as any).insert({
        entity_type: "export_batch",
        entity_id: batch.id,
        action_type: "exported",
        new_value_json: { batch_reference: batchRef, record_count: eventIds.length, gross_total: grossTotal },
        changed_by: user?.id,
      });

      // Fetch invoice metadata for enrichment
      // source_reference_id can be "uuid" or "uuid:suffix" — extract base UUID
      const invoiceIds = [...new Set(
        exportableFibuEvents
          .map((e: any) => e.source_reference_id?.split(":")[0])
          .filter((id: string | undefined) => id && id.length >= 32)
      )];
      const invoiceLookup: Record<string, any> = {};
      if (invoiceIds.length > 0) {
        const { data: invData } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, customer_number, customer_name")
          .in("id", invoiceIds);
        (invData || []).forEach((inv: any) => { invoiceLookup[inv.id] = inv; });
      }

      // Generate and download CSV
      downloadFibuCsv(exportableFibuEvents, batchRef, batch.id, invoiceLookup);

      toast({ title: "FiBu-Export erfolgreich", description: `${eventIds.length} Vorfälle exportiert – Batch: ${batchRef}` });
      refetchFibu();
      refetchBatches();
    } catch (e: any) {
      toast({ title: "Export fehlgeschlagen", description: e.message, variant: "destructive" });
    }
  };

  const downloadFibuCsv = (events: any[], batchRef: string, _batchId: string, invoiceLookup: Record<string, any> = {}) => {
    const rows = [
      FIBU_CSV_HEADERS,
      ...events.map((e) => {
        const accounts = SKR03_ACCOUNT_MAP[e.event_type] || DEFAULT_ACCOUNTS;

        // Resolve invoice metadata: source_reference_id may be "uuid" or "uuid:suffix"
        // Extract base UUID for lookup
        const baseRefId = e.source_reference_id?.split(":")[0] ?? null;
        const inv = baseRefId ? invoiceLookup[baseRefId] : null;

        const taxRate = Number(e.tax_amount) > 0 && Number(e.amount_net) > 0
          ? Math.round((Number(e.tax_amount) / Number(e.amount_net)) * 100)
          : 0;

        // Soll/Haben: The SKR03_ACCOUNT_MAP already defines correct accounts per event_type.
        // cancellation_created / correction_created already have inverted accounts (8400/1200).
        // Do NOT additionally flip based on negative amounts — that would cause double inversion.
        // Only flip for event types that are normally positive but appear with negative amounts
        // (e.g. a refund on an invoice_created event — unlikely but defensive).
        const isNormallyPositiveType = ["invoice_base_fee_created", "invoice_usage_created", "invoice_created", "vendor_cost_created", "commission_created", "payment_received"].includes(e.event_type);
        const shouldFlip = isNormallyPositiveType && Number(e.amount_gross) < 0;

        return [
          e.occurred_at ? fmtDate(e.occurred_at.slice(0, 10)) : "",                  // Buchungsdatum
          inv?.invoice_date ? fmtDate(inv.invoice_date) : "",                         // Belegdatum
          inv?.invoice_number ?? e.source_reference_id ?? e.id.slice(0, 8).toUpperCase(), // Belegnummer
          e.description || accounts.label,                                            // Buchungstext
          inv?.customer_number ?? "",                                                  // Kundennummer
          inv?.invoice_number ?? "",                                                   // Rechnungsnummer
          e.product_name ?? "",                                                        // Produkt
          shouldFlip ? accounts.credit : accounts.debit,                              // Konto (Soll)
          shouldFlip ? accounts.debit : accounts.credit,                              // Gegenkonto (Haben)
          Number(e.amount_net).toFixed(2),                                             // Nettobetrag
          taxRate > 0 ? String(taxRate) : "",                                          // USt-Satz %
          Number(e.tax_amount).toFixed(2),                                             // USt-Betrag
          Number(e.amount_gross).toFixed(2),                                           // Bruttobetrag
          e.currency ?? "EUR",                                                         // Währung
          e.event_type,                                                                // Vorgangstyp
          batchRef,                                                                    // Batch-Referenz
          e.id,                                                                        // Event-ID
        ];
      }),
    ];
    const label = periodMode === "month" ? selectedMonth : `${effectiveFrom}_${effectiveTo}`;
    downloadCsv(rows, `${batchRef}_FiBu_${label}.csv`);
  };

  const handleBatchRedownload = async (batch: any) => {
    const { data: batchEvents } = await supabase
      .from("fibu_events" as any)
      .select("*")
      .eq("export_batch_id", batch.id)
      .order("occurred_at");
    if (batchEvents && batchEvents.length > 0) {
      // Enrich with invoice metadata (handle uuid:suffix pattern)
      const invoiceIds = [...new Set(
        batchEvents.map((e: any) => e.source_reference_id?.split(":")[0])
          .filter((id: string | undefined) => id && id.length >= 32)
      )];
      const invoiceLookup: Record<string, any> = {};
      if (invoiceIds.length > 0) {
        const { data: invData } = await supabase
          .from("invoices")
          .select("id, invoice_number, invoice_date, customer_number, customer_name")
          .in("id", invoiceIds);
        (invData || []).forEach((inv: any) => { invoiceLookup[inv.id] = inv; });
      }
      downloadFibuCsv(batchEvents, batch.batch_reference, batch.id, invoiceLookup);
      toast({ title: "Download gestartet", description: `${batchEvents.length} Vorfälle aus Batch ${batch.batch_reference}` });
    }
  };

  return (
    <MainLayout title="Buchhaltung" subtitle="FiBu-Vorbereitung, Buchungssätze und kontrollierte Übergabe an die Finanzbuchhaltung">
      {/* Export Preview Dialog (Lexware) */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Eye className="h-5 w-5" />Export-Vorschau</DialogTitle>
            <DialogDescription>Diese Umsätze werden nach Lexware übertragen.</DialogDescription>
          </DialogHeader>
          {previewLoading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : previewData.length === 0 ? (
            <div className="text-center py-12">
              <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-foreground">Keine Daten zum Exportieren</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {[
                  { label: "Anzahl", value: `${previewTotals.count} Positionen` },
                  { label: "Netto", value: fmtEur(previewTotals.netTotal) },
                  { label: "MwSt.", value: fmtEur(previewTotals.taxTotal) },
                  { label: "Brutto", value: fmtEur(previewTotals.grossTotal), highlight: true },
                ].map((item) => (
                  <div key={item.label} className={`p-3 rounded-lg ${item.highlight ? "bg-primary/10" : "bg-muted/50"}`}>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className={`text-lg font-semibold ${item.highlight ? "text-primary" : ""}`}>{item.value}</p>
                  </div>
                ))}
              </div>
              <ScrollArea className="h-[400px] rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Rechnungsnr.</TableHead><TableHead>Kunde</TableHead>
                      <TableHead>Produkt</TableHead><TableHead>Datum</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((revenue) => (
                      <TableRow key={revenue.id}>
                        <TableCell className="font-medium">{revenue.invoice_number}</TableCell>
                        <TableCell>{revenue.customer_name}</TableCell>
                        <TableCell>{revenue.product_name}</TableCell>
                        <TableCell>{fmtDate(revenue.invoice_date)}</TableCell>
                        <TableCell className="text-right">{fmtEur(Number(revenue.net_amount))}</TableCell>
                        <TableCell className="text-right font-medium">{fmtEur(Number(revenue.gross_amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>Abbrechen</Button>
            <Button onClick={handleExport} disabled={previewData.length === 0 || isExporting}>
              {isExporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Exportiere...</> : <><Upload className="h-4 w-4 mr-2" />{previewTotals.count} Positionen exportieren</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FiBu Export Confirm Dialog */}
      <Dialog open={exportConfirmOpen} onOpenChange={setExportConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />FiBu-Export bestätigen</DialogTitle>
            <DialogDescription>
              {exportableFibuEvents.length} Vorfälle mit Status &quot;Freigegeben&quot; und Exportstatus &quot;Offen&quot; werden exportiert und danach gesperrt (kein Doppelexport möglich).
            </DialogDescription>
          </DialogHeader>
          <div className="p-4 rounded-lg bg-muted/50 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Anzahl Vorfälle:</span>
              <span className="font-semibold">{exportableFibuEvents.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Brutto-Summe:</span>
              <span className="font-semibold">{fmtEur(exportableFibuEvents.reduce((s: number, e: any) => s + Number(e.amount_gross), 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Zeitraum:</span>
              <span className="font-mono text-xs">{effectiveFrom} – {effectiveTo}</span>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setExportConfirmOpen(false)}>Abbrechen</Button>
            <Button onClick={handleFibuExport}>
              <Download className="h-4 w-4 mr-2" />Export & CSV herunterladen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Correction Dialog */}
      <Dialog open={correctionDialogOpen} onOpenChange={setCorrectionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Korrekturvorfall erstellen</DialogTitle>
            <DialogDescription>Der ursprüngliche Vorfall wird als &quot;Korrigiert&quot; markiert. Ein neuer Korrektureintrag mit Gegenposition wird erstellt.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Begründung</Label>
            <Textarea
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="Beschreiben Sie den Korrekturgrund..."
              rows={3}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCorrectionDialogOpen(false)}>Abbrechen</Button>
            <Button
              onClick={() => correctionEventId && createCorrectionMutation.mutate({ originalId: correctionEventId, reason: correctionReason })}
              disabled={!correctionReason.trim() || createCorrectionMutation.isPending}
            >
              {createCorrectionMutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Erstelle...</> : "Korrektur erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Manual Billing Dialog */}
      <Dialog open={billingDialogOpen} onOpenChange={(open) => {
        setBillingDialogOpen(open);
        if (open) loadActiveContracts();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Monatsabrechnung auslösen</DialogTitle>
            <DialogDescription>Erzeugt die Monatsabrechnung (Grundgebühr + offene Verbrauchsdaten) für den ausgewählten Vertrag im aktuellen Monat. Bereits existierende Rechnungen werden übersprungen.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Vertrag auswählen</Label>
            <Select value={billingContractId} onValueChange={setBillingContractId}>
              <SelectTrigger><SelectValue placeholder="Vertrag wählen..." /></SelectTrigger>
              <SelectContent>
                {activeContracts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.customer_name} ({c.hfx_customer_number}) – {c.product_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBillingDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleManualBilling} disabled={!billingContractId || billingLoading}>
              {billingLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird erstellt...</> : <><Receipt className="h-4 w-4 mr-2" />Abrechnung erstellen</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Period selector */}
      {tab !== "integrationen" && (
        <div className="card-elevated p-4 mb-6 flex flex-wrap gap-4 items-end">
          <div className="flex gap-2">
            <Button variant={periodMode === "month" ? "default" : "outline"} size="sm" onClick={() => setPeriodMode("month")}>
              <CalendarDays className="h-4 w-4 mr-2" />Monat
            </Button>
            <Button variant={periodMode === "custom" ? "default" : "outline"} size="sm" onClick={() => setPeriodMode("custom")}>
              Freie Auswahl
            </Button>
          </div>
          {periodMode === "month" ? (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Monat</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTH_OPTIONS.map((m) => (<SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex gap-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Von</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Bis</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Summary cards */}
      {tab !== "integrationen" && tab !== "export-protokoll" && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-3 bg-green-500/10"><TrendingUp className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Erlöse (Brutto)</p>
                <p className="text-xl font-semibold text-foreground">{fmtEur(totalRevenue)}</p>
                <p className="text-xs text-muted-foreground">{revenues.length} Rechnungen</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-3 bg-primary/10"><Users className="h-5 w-5 text-primary" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Provisionen (extern)</p>
                <p className="text-xl font-semibold text-foreground">{fmtEur(totalCommission)}</p>
                <p className="text-xs text-muted-foreground">{externalCommissions.length} Auszahlungen</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-3 bg-amber-500/10"><Receipt className="h-5 w-5 text-amber-600" /></div>
              <div>
                <p className="text-sm text-muted-foreground">Kosten (Brutto)</p>
                <p className="text-xl font-semibold text-foreground">{fmtEur(totalCosts)}</p>
                <p className="text-xs text-muted-foreground">{costs.length} Belege</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action bar */}
      <div className="flex justify-end gap-2 mb-4 flex-wrap">
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="border-amber-500/40 text-amber-700 hover:bg-amber-500/10"
            onClick={() => {
              loadActiveContracts();
              setSeedDialogOpen(true);
            }}
          >
            <AlertTriangle className="h-4 w-4 mr-2" />Test-Verbrauch erzeugen
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadActiveContracts();
              setInterimDialogOpen(true);
            }}
          >
            <Receipt className="h-4 w-4 mr-2" />Zwischenabrechnung jetzt
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => setBillingDialogOpen(true)}>
          <Receipt className="h-4 w-4 mr-2" />Abrechnung auslösen
        </Button>
      </div>

      {/* Test-Verbrauch Dialog (Admin, nur Test-Verträge) */}
      <Dialog open={seedDialogOpen} onOpenChange={(open) => {
        setSeedDialogOpen(open);
        if (open) loadActiveContracts();
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" />Test-Verbrauch erzeugen</DialogTitle>
            <DialogDescription>
              Legt eine simulierte <strong>usage_charges</strong>-Position (Status <code>pending</code>) für einen Test-Vertrag an.
              Nur Verträge mit „Test" im Kundennamen sind wählbar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Test-Vertrag</Label>
              <Select value={seedContractId} onValueChange={setSeedContractId}>
                <SelectTrigger><SelectValue placeholder="Test-Vertrag wählen..." /></SelectTrigger>
                <SelectContent>
                  {testContracts.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Keine Test-Verträge gefunden.</div>
                  ) : testContracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.customer_name} ({c.hfx_customer_number}) – {c.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Anzahl simulierter GOÄ-Rechnungen</Label>
              <Input
                type="number" min={1} max={10000}
                value={seedQuantity}
                onChange={(e) => setSeedQuantity(Math.max(1, Number(e.target.value) || 0))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSeedDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={handleSeedTestUsage} disabled={!seedContractId || seedLoading}>
              {seedLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird erzeugt...</> : <>Erzeugen</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zwischenabrechnung Dialog (Admin) */}
      <Dialog open={interimDialogOpen} onOpenChange={(open) => {
        setInterimDialogOpen(open);
        if (open) loadActiveContracts();
        if (!open) { setInterimContractId(""); setInterimPreview(null); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5" />Zwischenabrechnung jetzt</DialogTitle>
            <DialogDescription>
              Rechnet <strong>alle offenen Verbrauchspositionen</strong> (Status <code>pending</code>, Netto &gt; 0) eines Vertrages ab –
              unabhängig vom Kalendermonat. SEPA-Mandat erforderlich. Keine Grundgebühr.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Vertrag auswählen</Label>
              <Select value={interimContractId} onValueChange={setInterimContractId}>
                <SelectTrigger><SelectValue placeholder="Vertrag wählen..." /></SelectTrigger>
                <SelectContent>
                  {activeContracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.customer_name} ({c.hfx_customer_number}) – {c.product_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {interimContractId && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                {interimPreviewLoading ? (
                  <span className="text-muted-foreground flex items-center gap-2"><Loader2 className="h-3 w-3 animate-spin" />Vorschau wird geladen...</span>
                ) : interimPreview && interimPreview.count > 0 ? (
                  <div className="space-y-1">
                    <div><strong>{interimPreview.count}</strong> offene Position(en) · <strong>{fmtEur(interimPreview.net)}</strong> netto</div>
                    <div className="text-muted-foreground text-xs">Verbrauchsspanne: {interimPreview.from} – {interimPreview.to}</div>
                  </div>
                ) : (
                  <span className="text-muted-foreground">Kein offener Verbrauch für diesen Vertrag.</span>
                )}
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInterimDialogOpen(false)}>Abbrechen</Button>
            <Button
              onClick={handleInterimInvoice}
              disabled={!interimContractId || interimLoading || (interimPreview?.count ?? 0) === 0}
            >
              {interimLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Wird abgerechnet...</> : <>Zwischenabrechnung erstellen</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="erlöse">Erlöse ({revenues.length})</TabsTrigger>
          <TabsTrigger value="provisionen">Provisionen ({commissions.length})</TabsTrigger>
          <TabsTrigger value="kosten">Kosten ({costs.length})</TabsTrigger>
          <TabsTrigger value="vorfaelle" className="flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />Geschäftsvorfälle
          </TabsTrigger>
          <TabsTrigger value="zahlungen" className="flex items-center gap-1.5">
            <CreditCard className="h-3.5 w-3.5" />Zahlungseingänge
          </TabsTrigger>
          <TabsTrigger value="export-protokoll" className="flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />Export-Protokoll
          </TabsTrigger>
          <TabsTrigger value="integrationen" className="flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5" />Integrationen
          </TabsTrigger>
        </TabsList>

        {/* ── Erlöse ── */}
        <TabsContent value="erlöse" className="mt-4">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">Buchungssatz 1: Erlöse</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Für kontrollierte FiBu-Übergaben bitte den Tab <strong>Geschäftsvorfälle</strong> nutzen.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={exportRevenues}>
                <Download className="h-4 w-4 mr-2" />CSV Direktexport (Legacy)
              </Button>
            </div>
            <div className="overflow-x-auto">
              {revLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : revenues.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Keine Rechnungen im gewählten Zeitraum.</div>
              ) : (
                <table className="data-table">
                  <thead className="bg-muted/50">
                    <tr><th>Datum</th><th>Belegnummer</th><th>Kunde</th><th>Konto</th><th>Netto</th><th>USt %</th><th>USt</th><th>Brutto</th></tr>
                  </thead>
                  <tbody>
                    {revenues.map((r: any) => (
                      <tr key={r.id}>
                        <td className="text-muted-foreground">{fmtDate(r.invoice_date)}</td>
                        <td className="font-mono text-xs">{r.invoice_number}</td>
                        <td className="font-medium text-foreground">{r.customer_name}</td>
                        <td className="font-mono text-xs text-muted-foreground">{REVENUE_ACCOUNT}/{REVENUE_CONTRA}</td>
                        <td className="text-right">{fmtEur(r.net_amount)}</td>
                        <td className="text-right text-muted-foreground">{r.tax_rate}%</td>
                        <td className="text-right text-muted-foreground">{fmtEur(r.tax_amount)}</td>
                        <td className="text-right font-semibold text-foreground">{fmtEur(r.gross_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Provisionen ── */}
        <TabsContent value="provisionen" className="mt-4">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">Buchungssatz 2: Provisionen</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Freigegeben &amp; ausgezahlte Provisionen aus der Vertriebsabrechnung. Für kontrollierte FiBu-Übergaben bitte den Tab <strong>Geschäftsvorfälle</strong> nutzen.
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeInternal}
                    onChange={(e) => setIncludeInternal(e.target.checked)}
                    className="rounded"
                  />
                  Interner Vertrieb (AD) einschließen
                </label>
                <Button variant="outline" size="sm" onClick={exportCommissionsLegacy}>
                  <Download className="h-4 w-4 mr-2" />CSV Direktexport (Legacy)
                </Button>
              </div>
            </div>

            {/* External commissions */}
            <div className="p-4 border-b border-border bg-muted/20">
              <h4 className="text-sm font-medium text-foreground mb-1">Externe Provisionen (Vertriebspartner &amp; Tippgeber)</h4>
            </div>
            <div className="overflow-x-auto">
              {commLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : externalCommissions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Keine externen Provisionen im gewählten Zeitraum.</div>
              ) : (
                <table className="data-table">
                  <thead className="bg-muted/50">
                    <tr><th>Monat</th><th>Vertriebler</th><th>Rolle</th><th>Produkt</th><th>Basis</th><th>Regelversion</th><th>Satz</th><th>Betrag</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {externalCommissions.map((c: any) => (
                      <tr key={c.id}>
                        <td className="text-muted-foreground font-mono text-xs">{c.period_month}</td>
                        <td className="font-medium text-foreground">{c.sales_partner_name}</td>
                        <td><Badge variant="outline" className="text-xs">{c.commission_role || "partner"}</Badge></td>
                        <td className="text-muted-foreground">{c.product_name}</td>
                        <td className="text-right text-muted-foreground">{c.commission_base_amount != null ? fmtEur(Number(c.commission_base_amount)) : "–"}</td>
                        <td className="font-mono text-xs text-muted-foreground">{c.commission_rule_version || "–"}</td>
                        <td><Badge variant="outline">{c.commission_type === "prozent" ? `${c.commission_rate}%` : fmtEur(Number(c.commission_rate))}</Badge></td>
                        <td className="text-right font-semibold text-foreground">{fmtEur(Number(c.commission_amount))}</td>
                        <td><Badge variant="secondary" className={c.status === "paid" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>{c.status === "paid" ? "Ausgezahlt" : "Freigegeben"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Internal commissions (AD) – collapsible group */}
            {includeInternal && (
              <>
                <div className="p-4 border-t border-b border-border bg-amber-500/5">
                  <h4 className="text-sm font-medium text-foreground mb-0.5">Interner Vertrieb (AD-Provisionen)</h4>
                  <p className="text-xs text-muted-foreground">Separat ausgewiesen – nicht mit externen Auszahlungen vermischen.</p>
                </div>
                <div className="overflow-x-auto">
                  {internalCommissions.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Keine internen Provisionen im gewählten Zeitraum.</div>
                  ) : (
                    <table className="data-table">
                      <thead className="bg-muted/50">
                        <tr><th>Monat</th><th>AD-Name</th><th>Auslöser</th><th>Produkt</th><th>Basis</th><th>Regelversion</th><th>Satz</th><th>Betrag</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {internalCommissions.map((c: any) => (
                          <tr key={c.id}>
                            <td className="text-muted-foreground font-mono text-xs">{c.period_month}</td>
                            <td className="font-medium text-foreground">{c.sales_partner_name}</td>
                            <td><Badge variant="outline" className="text-xs">{c.payout_trigger || "–"}</Badge></td>
                            <td className="text-muted-foreground">{c.product_name}</td>
                            <td className="text-right text-muted-foreground">{c.commission_base_amount != null ? fmtEur(Number(c.commission_base_amount)) : "–"}</td>
                            <td className="font-mono text-xs text-muted-foreground">{c.commission_rule_version || "–"}</td>
                            <td><Badge variant="outline">{c.commission_type === "prozent" ? `${c.commission_rate}%` : fmtEur(Number(c.commission_rate))}</Badge></td>
                            <td className="text-right font-semibold text-foreground">{fmtEur(Number(c.commission_amount))}</td>
                            <td><Badge variant="secondary" className={c.status === "paid" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>{c.status === "paid" ? "Ausgezahlt" : "Freigegeben"}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* ── Kosten ── */}
        <TabsContent value="kosten" className="mt-4">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">Buchungssatz 3: Kosten (Drittanbieter/White-Label)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Für kontrollierte FiBu-Übergaben bitte den Tab <strong>Geschäftsvorfälle</strong> nutzen.
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setCsvImportOpen(true)}>
                  <Upload className="h-4 w-4 mr-2" />CSV-Import
                </Button>
                <Button variant="outline" size="sm" onClick={exportCosts}>
                  <Download className="h-4 w-4 mr-2" />CSV Direktexport (Legacy)
                </Button>
                <Button size="sm" onClick={() => setCostDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />Kostenposten
                </Button>
              </div>
            </div>
            <div className="overflow-x-auto">
              {costLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : costs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">Keine Kostenbelege im gewählten Zeitraum.</div>
              ) : (
                <table className="data-table">
                  <thead className="bg-muted/50">
                    <tr><th>Datum</th><th>Lieferant</th><th>Kategorie</th><th>Kunde</th><th>Produkt</th><th>Konto</th><th>Netto</th><th>USt %</th><th>Brutto</th></tr>
                  </thead>
                  <tbody>
                    {costs.map((c: any) => (
                      <tr key={c.id}>
                        <td className="text-muted-foreground">{fmtDate(c.cost_date)}</td>
                        <td className="font-medium text-foreground">{c.supplier}</td>
                        <td><Badge variant="outline" className="text-xs">{c.category}</Badge></td>
                        <td className="text-muted-foreground">{c.customer_name}</td>
                        <td className="text-muted-foreground">{c.product_name ?? "–"}</td>
                        <td className="font-mono text-xs text-muted-foreground">{COST_ACCOUNT}/{COST_CONTRA}</td>
                        <td className="text-right">{fmtEur(c.net_amount)}</td>
                        <td className="text-right text-muted-foreground">{c.tax_rate}%</td>
                        <td className="text-right font-semibold text-foreground">{fmtEur(c.gross_amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Geschäftsvorfälle (FiBu events) ── */}
        <TabsContent value="vorfaelle" className="mt-4 space-y-4">
          <div className="card-elevated overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 p-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">Geschäftsvorfälle</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Kontrollierter FiBu-Übergabepfad. Nur freigegebene, offene Vorfälle können exportiert werden.</p>
              </div>
              <div className="ml-auto flex flex-wrap gap-2 items-center">
                <Select value={fibuEventTypeFilter} onValueChange={setFibuEventTypeFilter}>
                  <SelectTrigger className="w-44 h-8 text-xs"><SelectValue placeholder="Typ" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Typen</SelectItem>
                    {Object.entries(EVENT_TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={fibuStatusFilter} onValueChange={setFibuStatusFilter}>
                  <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle Status</SelectItem>
                    <SelectItem value="draft">Entwurf</SelectItem>
                    <SelectItem value="approved">Freigegeben</SelectItem>
                    <SelectItem value="corrected">Korrigiert</SelectItem>
                    <SelectItem value="cancelled">Storniert</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={fibuExportStatusFilter} onValueChange={setFibuExportStatusFilter}>
                  <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Alle</SelectItem>
                    <SelectItem value="open">Offen</SelectItem>
                    <SelectItem value="exported">Exportiert</SelectItem>
                    <SelectItem value="blocked">Gesperrt</SelectItem>
                  </SelectContent>
                </Select>
                {exportableFibuEvents.length > 0 && (
                  <Button size="sm" onClick={() => setExportConfirmOpen(true)}>
                    <Download className="h-4 w-4 mr-2" />
                    {exportableFibuEvents.length} exportieren
                  </Button>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              {fibuLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : fibuEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Keine Geschäftsvorfälle im gewählten Zeitraum und Filterkriterien.</p>
                  <p className="text-xs mt-1">Vorfälle werden automatisch durch Zahlungseingänge, Rechnungserstellung und Provisionsfreigaben erzeugt.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Exportstatus</TableHead>
                      <TableHead>Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fibuEvents.map((e: any) => (
                      <TableRow key={e.id} className={e.correction_of_event_id ? "opacity-70 bg-amber-500/5" : ""}>
                        <TableCell className="text-muted-foreground text-sm">{fmtDateTime(e.occurred_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {EVENT_TYPE_LABELS[e.event_type] ?? e.event_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-48 truncate text-sm">{e.description ?? "–"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{e.product_name ?? "–"}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtEur(Number(e.amount_gross))}</TableCell>
                        <TableCell><FibuStatusBadge status={e.status} /></TableCell>
                        <TableCell><FibuExportStatusBadge exportStatus={e.export_status} /></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {e.status === "draft" && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-primary"
                                onClick={() => approveEventMutation.mutate(e.id)}
                                disabled={approveEventMutation.isPending}
                                title="Freigeben"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {e.status === "approved" && e.export_status === "open" && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-amber-600"
                                onClick={() => blockEventMutation.mutate(e.id)}
                                disabled={blockEventMutation.isPending}
                                title="Sperren"
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {e.status !== "corrected" && e.status !== "cancelled" && e.export_status !== "exported" && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 px-2 text-xs text-muted-foreground"
                                onClick={() => { setCorrectionEventId(e.id); setCorrectionDialogOpen(true); }}
                                title="Korrektur erstellen"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Zahlungseingänge ── */}
        <TabsContent value="zahlungen" className="mt-4">
          <div className="card-elevated overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-foreground">Zahlungseingänge (Stripe)</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Bestätigte Zahlungen via Stripe – automatisch als &quot;Freigegeben&quot; klassifiziert.</p>
            </div>
            <div className="overflow-x-auto">
              {fibuLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : fibuEvents.filter((e: any) => e.event_type === "payment_received_reference").length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Keine Zahlungseingänge im gewählten Zeitraum.</p>
                  <p className="text-xs mt-1">Zahlungseingänge werden automatisch erfasst, wenn Stripe invoice.paid Ereignisse empfangen werden.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Datum</TableHead>
                      <TableHead>Stripe-Invoice-ID</TableHead>
                      <TableHead>HFX-Rechnungsnr.</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead>Exportstatus</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fibuEvents
                      .filter((e: any) => e.event_type === "payment_received_reference")
                      .map((e: any) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-muted-foreground text-sm">{fmtDateTime(e.occurred_at)}</TableCell>
                          <TableCell className="font-mono text-xs">{e.metadata?.stripe_invoice_id ?? e.source_reference_id ?? "–"}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{e.metadata?.hfx_invoice_number ?? "–"}</TableCell>
                          <TableCell className="text-muted-foreground">{e.product_name ?? "–"}</TableCell>
                          <TableCell className="text-right">{fmtEur(Number(e.amount_net))}</TableCell>
                          <TableCell className="text-right font-semibold">{fmtEur(Number(e.amount_gross))}</TableCell>
                          <TableCell><FibuExportStatusBadge exportStatus={e.export_status} /></TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Export-Protokoll ── */}
        <TabsContent value="export-protokoll" className="mt-4">
          <div className="card-elevated overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <h3 className="font-semibold text-foreground">Export-Protokoll</h3>
                <p className="text-xs text-muted-foreground mt-0.5">Vollständige Historie aller FiBu-Exportbatches.</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => refetchBatches()}><RefreshCw className="h-4 w-4 mr-2" />Aktualisieren</Button>
            </div>
            <div className="overflow-x-auto">
              {batchLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : exportBatches.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Noch keine FiBu-Exporte durchgeführt.</p>
                  <p className="text-xs mt-1">Exporte werden über den Tab &quot;Geschäftsvorfälle&quot; gestartet.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Batch-Referenz</TableHead>
                      <TableHead>Typ</TableHead>
                      <TableHead>Zeitraum</TableHead>
                      <TableHead className="text-right">Anzahl</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead>Exportiert am</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {exportBatches.map((b: any) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-mono text-sm font-semibold">{b.batch_reference}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{b.export_type}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-sm font-mono text-xs">{b.period_from} – {b.period_to}</TableCell>
                        <TableCell className="text-right">{b.record_count}</TableCell>
                        <TableCell className="text-right font-semibold">{fmtEur(Number(b.amount_gross_total))}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{fmtDateTime(b.exported_at)}</TableCell>
                        <TableCell><Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">{b.status}</Badge></TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleBatchRedownload(b)} title="CSV erneut herunterladen">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ── Integrationen (Lexware / DATEV) ── */}
        <TabsContent value="integrationen" className="mt-4 space-y-6">
          {lexLoading ? (
            <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : (
            <Tabs defaultValue="lexware" className="space-y-6">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="lexware" className="flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />Lexware
                </TabsTrigger>
                <TabsTrigger value="datev" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4" />DATEV
                </TabsTrigger>
              </TabsList>

              {/* Lexware */}
              <TabsContent value="lexware" className="space-y-6">
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="lg:col-span-1 space-y-6">
                    <div className="card-elevated p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground">Verbindung</h2>
                        {isConnected ? (
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Verbunden</Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground">Nicht verbunden</Badge>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="lexware-api-key">API-Key</Label>
                          <Input id="lexware-api-key" type="password" placeholder={isConnected ? "****" : "Ihr Lexware API-Key"} value={lexwareApiKey} onChange={(e) => setLexwareApiKey(e.target.value)} disabled={isConnected || isConnecting} className="mt-1" />
                          <p className="text-xs text-muted-foreground mt-1">Generieren Sie Ihren API-Key unter app.lexware.de/addons/public-api</p>
                        </div>
                        {isConnected ? (
                          <Button variant="outline" onClick={disconnect} className="w-full">Verbindung trennen</Button>
                        ) : (
                          <Button onClick={handleConnect} className="w-full" disabled={isConnecting || !lexwareApiKey}>
                            {isConnecting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Verbinde...</> : "Verbinden"}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="card-elevated p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Settings2 className="h-5 w-5 text-muted-foreground" />
                        <h2 className="text-lg font-semibold text-foreground">Auto-Sync</h2>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Automatische Synchronisierung</Label>
                            <p className="text-xs text-muted-foreground">Umsätze automatisch übertragen</p>
                          </div>
                          <Switch checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} disabled={!isConnected} />
                        </div>
                        {autoSyncEnabled && (
                          <>
                            <div>
                              <Label>Intervall</Label>
                              <Select value={syncInterval} onValueChange={setSyncInterval}>
                                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="daily">Täglich</SelectItem>
                                  <SelectItem value="weekly">Wöchentlich</SelectItem>
                                  <SelectItem value="monthly">Monatlich</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label>Uhrzeit</Label>
                              <Input type="time" value={syncTime} onChange={(e) => setSyncTime(e.target.value)} className="mt-1" />
                            </div>
                          </>
                        )}
                        <Button variant="outline" onClick={() => updateSettings(autoSyncEnabled, syncInterval, syncTime)} disabled={!isConnected} className="w-full">
                          Einstellungen speichern
                        </Button>
                        {settings?.last_sync_at && (
                          <p className="text-xs text-muted-foreground text-center">Letzter Sync: {fmtDateTime(settings.last_sync_at)}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="lg:col-span-2 space-y-6">
                    <div className="card-elevated p-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <h2 className="text-lg font-semibold text-foreground">Manueller Export nach Lexware</h2>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div>
                          <Label>Datentyp</Label>
                          <Select value={exportType} onValueChange={(v) => setExportType(v as typeof exportType)}>
                            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="umsaetze"><div className="flex items-center gap-2"><Euro className="h-4 w-4" />Umsätze pro Kunde</div></SelectItem>
                              <SelectItem value="rechnungen"><div className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4" />Rechnungen</div></SelectItem>
                              <SelectItem value="provisionen"><div className="flex items-center gap-2"><Euro className="h-4 w-4" />Provisionen</div></SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Von</Label>
                          <Input type="date" value={exportDateFrom} onChange={(e) => setExportDateFrom(e.target.value)} className="mt-1" />
                        </div>
                        <div>
                          <Label>Bis</Label>
                          <Input type="date" value={exportDateTo} onChange={(e) => setExportDateTo(e.target.value)} className="mt-1" />
                        </div>
                        <div className="flex items-end">
                          <Button variant="outline" onClick={handleShowPreview} disabled={!isConnected} className="w-full">
                            <Eye className="h-4 w-4 mr-2" />Vorschau
                          </Button>
                        </div>
                      </div>
                      <div className="mt-4">
                        <Button onClick={handleShowPreview} disabled={!isConnected || isExporting} className="w-full">
                          {isExporting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Übertrage...</> : <><Upload className="h-4 w-4 mr-2" />Vorschau & Export nach Lexware</>}
                        </Button>
                      </div>
                    </div>

                    <div className="card-elevated p-6">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-foreground">Übertragungshistorie</h2>
                        <Button variant="ghost" size="sm" onClick={refreshLex}><RefreshCw className="h-4 w-4 mr-2" />Aktualisieren</Button>
                      </div>
                      <div className="space-y-3">
                        {syncLogs.map((log) => (
                          <div key={log.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                            {getStatusIcon(log.status)}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{log.message}</p>
                              <p className="text-xs text-muted-foreground">{fmtDateTime(log.created_at)}</p>
                            </div>
                            {getStatusBadge(log.status)}
                          </div>
                        ))}
                        {syncLogs.length === 0 && (
                          <div className="text-center py-8 text-muted-foreground">
                            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>Noch keine Übertragungen durchgeführt</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* DATEV */}
              <TabsContent value="datev" className="space-y-6">
                <div className="card-elevated p-8 text-center">
                  <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h2 className="text-xl font-semibold text-foreground mb-2">DATEV-Integration</h2>
                  <p className="text-muted-foreground max-w-md mx-auto mb-4">
                    Die DATEV-Schnittstelle befindet sich in Entwicklung. DATEV verwendet ein komplexeres Authentifizierungsverfahren (OAuth 2.0 mit SmartCard) und Batch-basierte Datenübertragung im DATEV-ASCII-Format.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/20"><Clock className="h-3 w-3 mr-1" />In Entwicklung</Badge>
                    <Badge variant="outline">Geplant: Q2 2024</Badge>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </TabsContent>
      </Tabs>

      <CostDialog open={costDialogOpen} onOpenChange={setCostDialogOpen} userId={user?.id} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["accounting-costs"] })} />
      <CsvCostImportDialog open={csvImportOpen} onOpenChange={setCsvImportOpen} userId={user?.id} onSuccess={() => queryClient.invalidateQueries({ queryKey: ["accounting-costs"] })} />
    </MainLayout>
  );
}

// ─── Cost entry dialog ────────────────────────────────────────────────────────

function CostDialog({ open, onOpenChange, userId, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; userId?: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ cost_date: format(new Date(), "yyyy-MM-dd"), supplier: "", customer_name: "", hfx_customer_number: "", product_name: "", category: "Lizenzkosten", description: "", net_amount: "", tax_rate: "19", invoice_reference: "" });

  const net = parseFloat(form.net_amount) || 0;
  const rate = parseFloat(form.tax_rate) || 0;
  const tax = net * (rate / 100);
  const gross = net + tax;

  const mutation = useMutation({
    mutationFn: async () => {
      const { data: newCost, error } = await supabase.from("accounting_costs").insert({
        cost_date: form.cost_date, supplier: form.supplier, customer_name: form.customer_name,
        hfx_customer_number: form.hfx_customer_number || null, product_name: form.product_name || null,
        category: form.category, description: form.description || null, net_amount: net, tax_rate: rate,
        tax_amount: parseFloat(tax.toFixed(2)), gross_amount: parseFloat(gross.toFixed(2)),
        invoice_reference: form.invoice_reference || null, created_by: userId,
      } as any).select("id").single();
      if (error) throw error;

      // ── FiBu: vendor_cost_created event (additive, non-blocking) ──
      try {
        // RP-2: occurred_at auf fachliches cost_date setzen, nicht DB-Default now()
        const costDateIso = form.cost_date
          ? new Date(form.cost_date + "T00:00:00").toISOString()
          : new Date().toISOString();
        const { error: fibuCostErr } = await supabase.from("fibu_events" as any).insert({
          event_type: "vendor_cost_created",
          source_module: "accounting_costs",
          source_reference_id: newCost?.id ?? null,
          product_name: form.product_name || null,
          amount_net: net,
          tax_amount: parseFloat(tax.toFixed(2)),
          amount_gross: parseFloat(gross.toFixed(2)),
          currency: "EUR",
          cost_type: form.category,
          supplier: form.supplier,
          status: "draft",
          export_status: "open",
          occurred_at: costDateIso,
          description: `${form.category} – ${form.supplier}${form.invoice_reference ? ` / ${form.invoice_reference}` : ""}${form.customer_name ? ` – ${form.customer_name}` : ""}`,
          created_by: userId,
          metadata: {
            accounting_cost_id: newCost?.id ?? null,
            invoice_reference: form.invoice_reference || null,
            hfx_customer_number: form.hfx_customer_number || null,
            customer_name: form.customer_name,
            cost_date: form.cost_date,
          },
        });
        if (fibuCostErr && (fibuCostErr as any).code !== "23505") {
          console.error("[Buchhaltung] fibu_events vendor_cost_created failed:", fibuCostErr.message);
        }
      } catch (fibuEx) {
        console.error("[Buchhaltung] fibu_events vendor_cost_created exception:", String(fibuEx));
      }
    },
    onSuccess: () => {
      toast({ title: "Kostenposten gespeichert" });
      onSuccess();
      onOpenChange(false);
      setForm({ cost_date: format(new Date(), "yyyy-MM-dd"), supplier: "", customer_name: "", hfx_customer_number: "", product_name: "", category: "Lizenzkosten", description: "", net_amount: "", tax_rate: "19", invoice_reference: "" });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
  });

  const f = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>Kostenposten erfassen</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Datum *</Label><Input type="date" value={form.cost_date} onChange={(e) => f("cost_date", e.target.value)} /></div>
            <div className="space-y-2"><Label>Kategorie *</Label>
              <Select value={form.category} onValueChange={(v) => f("category", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{COST_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2"><Label>Lieferant/Anbieter *</Label><Input value={form.supplier} onChange={(e) => f("supplier", e.target.value)} placeholder="Drittanbieter GmbH" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Kunde *</Label><Input value={form.customer_name} onChange={(e) => f("customer_name", e.target.value)} placeholder="Praxis Dr. Müller" /></div>
            <div className="space-y-2"><Label>HFX-Nr.</Label><Input value={form.hfx_customer_number} onChange={(e) => f("hfx_customer_number", e.target.value)} placeholder="HFX-00001" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>Produkt</Label><Input value={form.product_name} onChange={(e) => f("product_name", e.target.value)} placeholder="HFX GOÄ" /></div>
            <div className="space-y-2"><Label>Belegreferenz</Label><Input value={form.invoice_reference} onChange={(e) => f("invoice_reference", e.target.value)} placeholder="EK-2024-001" /></div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2 col-span-2"><Label>Nettobetrag (€) *</Label><Input type="number" step="0.01" value={form.net_amount} onChange={(e) => f("net_amount", e.target.value)} placeholder="0.00" /></div>
            <div className="space-y-2"><Label>USt %</Label>
              <Select value={form.tax_rate} onValueChange={(v) => f("tax_rate", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="7">7%</SelectItem>
                  <SelectItem value="19">19%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {net > 0 && (
            <div className="bg-muted rounded-md p-3 text-sm flex gap-6">
              <span>Netto: <strong>{fmtEur(net)}</strong></span>
              <span>USt: <strong>{fmtEur(tax)}</strong></span>
              <span>Brutto: <strong>{fmtEur(gross)}</strong></span>
            </div>
          )}
        </div>
        <DialogFooter className="pt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={() => mutation.mutate()} disabled={!form.supplier || !form.customer_name || !form.net_amount || mutation.isPending}>
            {mutation.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Speichern...</> : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── CSV import dialog ────────────────────────────────────────────────────────

function CsvCostImportDialog({ open, onOpenChange, userId, onSuccess }: { open: boolean; onOpenChange: (v: boolean) => void; userId?: string; onSuccess: () => void }) {
  const { toast } = useToast();
  const [preview, setPreview] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split(/\r?\n/).filter(Boolean);
      const header = lines[0].split(/[;,]/).map((h) => h.replace(/^"|"$/g, "").trim().toLowerCase());
      const rows = lines.slice(1).map((line) => {
        const cols = line.split(/[;,]/).map((c) => c.replace(/^"|"$/g, "").trim());
        const obj: any = {};
        header.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
        return obj;
      }).filter((r) => r["lieferant"] || r["supplier"]);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(file, "UTF-8");
  }, []);

  const handleImport = async () => {
    if (!preview.length) return;
    setImporting(true);
    try {
      const rows = preview.map((r) => {
        const net = parseFloat(r["nettobetrag"] || r["net_amount"] || "0") || 0;
        const rate = parseFloat(r["ust"] || r["tax_rate"] || "19") || 19;
        const tax = net * (rate / 100);
        return {
          cost_date: r["datum"] || r["cost_date"] || format(new Date(), "yyyy-MM-dd"),
          supplier: r["lieferant"] || r["supplier"] || "Unbekannt",
          customer_name: r["kunde"] || r["customer_name"] || "Unbekannt",
          hfx_customer_number: r["hfx-nr"] || r["hfx_customer_number"] || null,
          product_name: r["produkt"] || r["product_name"] || null,
          category: r["kategorie"] || r["category"] || "Sonstige",
          description: r["beschreibung"] || r["description"] || null,
          net_amount: net, tax_rate: rate,
          tax_amount: parseFloat(tax.toFixed(2)),
          gross_amount: parseFloat((net + tax).toFixed(2)),
          invoice_reference: r["beleg"] || r["invoice_reference"] || null,
          created_by: userId,
        };
      });
      const { error } = await supabase.from("accounting_costs").insert(rows as any);
      if (error) throw error;
      toast({ title: "Import erfolgreich", description: `${rows.length} Kostenposten importiert.` });
      onSuccess();
      onOpenChange(false);
      setPreview([]);
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>Kostenposten CSV importieren</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Erwartete Spalten (Semikolon- oder Komma-getrennt):<br />
            <code className="text-xs bg-muted px-1 rounded">Datum; Lieferant; Kunde; HFX-Nr; Produkt; Kategorie; Nettobetrag; USt; Beleg</code>
          </p>
          <Input type="file" accept=".csv" onChange={handleFile} />
          {preview.length > 0 && (
            <div className="overflow-x-auto max-h-48 border rounded-md">
              <table className="data-table text-xs">
                <thead className="bg-muted/50"><tr>
                  {["Datum","Lieferant","Kunde","Produkt","Netto","Kategorie"].map((h) => <th key={h}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i}>
                      <td>{r["datum"] || r["cost_date"]}</td>
                      <td>{r["lieferant"] || r["supplier"]}</td>
                      <td>{r["kunde"] || r["customer_name"]}</td>
                      <td>{r["produkt"] || r["product_name"]}</td>
                      <td>{r["nettobetrag"] || r["net_amount"]}</td>
                      <td>{r["kategorie"] || r["category"]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground p-2">Vorschau: erste {preview.length} Zeilen</p>
            </div>
          )}
        </div>
        <DialogFooter className="pt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
          <Button onClick={handleImport} disabled={!preview.length || importing}>
            {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importiere...</> : `${preview.length} Zeilen importieren`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
