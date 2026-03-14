import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Send,
  Trash2,
  Eye,
  FileText,
  Euro,
  CheckCircle2,
  Clock,
  XCircle,
  Search,
  RefreshCw,
  Download,
  Zap,
  Receipt,
  Link,
} from "lucide-react";
import { generateInvoicePdf } from "@/lib/generateInvoicePdf";
import { openPdfBlob } from "@/lib/openPdfBlob";

interface InvoicePosition {
  description: string;
  quantity: number;
  unit_price: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  contract_id: string | null;
  customer_name: string;
  customer_number: string | null;
  rechnungs_email: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  positions: InvoicePosition[];
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  gross_amount: number;
  invoice_date: string;
  due_date: string | null;
  status: string;
  email_sent_at: string | null;
  exported_to_lexware: boolean;
  notes: string | null;
  created_at: string;
  // joined from contracts - always Stripe
  payment_method?: "stripe" | null;
}

interface Contract {
  id: string;
  customer_name: string;
  hfx_customer_number: string | null;
  rechnungs_email: string | null;
  adresse: string | null;
  plz: string | null;
  ort: string | null;
  monthly_price: number;
  product_name: string;
  status: string;
  start_date: string;
}

interface UsageCharge {
  id: string;
  hfx_customer_number: string;
  contract_id: string | null;
  period_from: string;
  period_to: string;
  quantity: number;
  unit_price: number;
  net_amount: number;
  unit_description: string;
  status: string;
  source: string;
  notes: string | null;
  received_at: string;
  invoice_id: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ComponentType<any> }> = {
  entwurf: { label: "Entwurf", variant: "outline", icon: FileText },
  versendet: { label: "Versendet", variant: "secondary", icon: Send },
  bezahlt: { label: "Bezahlt", variant: "default", icon: CheckCircle2 },
  storniert: { label: "Storniert", variant: "destructive", icon: XCircle },
};

const EMPTY_POSITION: InvoicePosition = { description: "", quantity: 1, unit_price: 0 };

function calcAmounts(positions: InvoicePosition[], taxRate: number) {
  const net = positions.reduce((s, p) => s + p.quantity * p.unit_price, 0);
  const tax = net * (taxRate / 100);
  return { net_amount: net, tax_amount: tax, gross_amount: net + tax };
}

export default function Rechnungen() {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [usageCharges, setUsageCharges] = useState<UsageCharge[]>([]);
  const [usageLoading, setUsageLoading] = useState(true);
  const [invoicingChargeId, setInvoicingChargeId] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [usageSearch, setUsageSearch] = useState("");

  // Dialog states
  const [showCreate, setShowCreate] = useState(false);
  const [showDetail, setShowDetail] = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [detailEmail, setDetailEmail] = useState<string>("");

  // Create form
  const [form, setForm] = useState({
    contract_id: "",
    customer_name: "",
    customer_number: "",
    rechnungs_email: "",
    adresse: "",
    plz: "",
    ort: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: "",
    tax_rate: 19,
    notes: "",
  });
  const [positions, setPositions] = useState<InvoicePosition[]>([{ ...EMPTY_POSITION }]);
  const [submitting, setSubmitting] = useState(false);

  const fetchInvoices = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("invoices")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) {
      setInvoices(data.map((r) => ({
        ...r,
        positions: (r.positions as unknown as InvoicePosition[]) || [],
        payment_method: r.contract_id ? "stripe" : null,
      } as Invoice)));
    }
    setLoading(false);
  };

  const fetchContracts = async () => {
    const { data } = await supabase
      .from("contracts")
      .select("id, customer_name, hfx_customer_number, rechnungs_email, adresse, plz, ort, monthly_price, product_name, status, start_date")
      .eq("status", "aktiv")
      .order("customer_name");
    if (data) setContracts(data as Contract[]);
  };

  const fetchUsageCharges = async () => {
    setUsageLoading(true);
    const { data, error } = await supabase
      .from("usage_charges")
      .select("*")
      .order("received_at", { ascending: false });
    if (!error && data) setUsageCharges(data as UsageCharge[]);
    setUsageLoading(false);
  };

  useEffect(() => {
    fetchInvoices();
    fetchContracts();
    fetchUsageCharges();
  }, []);

  const handleContractSelect = (contractId: string) => {
    const c = contracts.find((x) => x.id === contractId);
    if (!c) return;
    setForm((f) => ({
      ...f,
      contract_id: contractId,
      customer_name: c.customer_name,
      customer_number: c.hfx_customer_number || "",
      rechnungs_email: c.rechnungs_email || "",
      adresse: c.adresse || "",
      plz: c.plz || "",
      ort: c.ort || "",
    }));

    // Grundgebühr-Waiver: Gilt nur für HFX GOÄ Verträge, die VOR dem 30.06.2026 abgeschlossen wurden, bis 31.12.2026
    const now = new Date();
    const waiverCutoff = new Date("2026-06-30T23:59:59");
    const waiverEndDate = new Date("2027-01-01");
    const contractStartDate = c.start_date ? new Date(c.start_date) : null;
    const isGoaeProduct = c.product_name?.toLowerCase().includes("goä") || c.product_name?.toLowerCase().includes("goa");
    const isEligibleContract = contractStartDate !== null && contractStartDate <= waiverCutoff;
    const isInWaiverPeriod = isGoaeProduct && isEligibleContract && now < waiverEndDate;
    const effectivePrice = isInWaiverPeriod ? 0 : c.monthly_price;
    const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    const billingPeriod = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    const description = isInWaiverPeriod
      ? `${c.product_name} – ${billingPeriod} (Einführungsangebot: Grundgebühr entfällt bis 31.12.2026)`
      : `${c.product_name} – ${billingPeriod}`;

    setPositions([{
      description,
      quantity: 1,
      unit_price: effectivePrice,
    }]);
  };

  const updatePosition = (i: number, field: keyof InvoicePosition, value: string | number) => {
    setPositions((prev) => prev.map((p, idx) => idx === i ? { ...p, [field]: value } : p));
  };

  const addPosition = () => setPositions((p) => [...p, { ...EMPTY_POSITION }]);
  const removePosition = (i: number) => setPositions((p) => p.filter((_, idx) => idx !== i));

  const { net_amount, tax_amount, gross_amount } = calcAmounts(positions, form.tax_rate);

  const handleCreate = async () => {
    if (!form.customer_name.trim()) {
      toast({ title: "Fehlende Pflichtfelder", description: "Bitte Kundennamen eingeben.", variant: "destructive" });
      return;
    }
    if (positions.some((p) => !p.description.trim())) {
      toast({ title: "Fehlende Positionen", description: "Bitte alle Beschreibungen ausfüllen.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("invoices").insert({
        contract_id: form.contract_id || null,
        customer_name: form.customer_name,
        customer_number: form.customer_number || null,
        rechnungs_email: form.rechnungs_email || null,
        adresse: form.adresse || null,
        plz: form.plz || null,
        ort: form.ort || null,
        positions: positions,
        net_amount,
        tax_rate: form.tax_rate,
        tax_amount,
        gross_amount,
        invoice_date: form.invoice_date,
        due_date: form.due_date || null,
        notes: form.notes || null,
        created_by: user?.id,
      });
      if (error) throw error;
      toast({ title: "Rechnung erstellt", description: "Die Rechnung wurde erfolgreich gespeichert." });
      setShowCreate(false);
      resetForm();
      fetchInvoices();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({
      contract_id: "", customer_name: "", customer_number: "", rechnungs_email: "",
      adresse: "", plz: "", ort: "",
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: "", tax_rate: 19, notes: "",
    });
    setPositions([{ ...EMPTY_POSITION }]);
  };

  const handleSendEmail = async (invoice: Invoice, overrideEmail?: string) => {
    const emailToUse = overrideEmail || invoice.rechnungs_email;
    if (!emailToUse) {
      toast({ title: "Keine E-Mail-Adresse", description: "Bitte eine Rechnungs-E-Mail eingeben.", variant: "destructive" });
      return;
    }
    // If email changed, save it first
    if (overrideEmail && overrideEmail !== invoice.rechnungs_email) {
      await supabase.from("invoices").update({ rechnungs_email: overrideEmail }).eq("id", invoice.id);
      invoice = { ...invoice, rechnungs_email: overrideEmail };
    }
    setSendingId(invoice.id);
    try {
      // Generate PDF and convert to base64 for attachment
      let pdfBase64: string | undefined;
      try {
        let logoBytes: ArrayBuffer | undefined;
        try {
          const logoResp = await fetch(foxLogoUrl);
          if (logoResp.ok) logoBytes = await logoResp.arrayBuffer();
        } catch { /* no logo */ }
        const pdfBytes = await generateInvoicePdf(invoice, logoBytes);
        // Convert Uint8Array → base64
        const binary = Array.from(pdfBytes).map((b) => String.fromCharCode(b)).join("");
        pdfBase64 = btoa(binary);
      } catch (pdfErr) {
        console.warn("PDF generation failed, sending without attachment:", pdfErr);
      }

      const { error } = await supabase.functions.invoke("send-invoice-email", {
        body: { invoiceId: invoice.id, pdfBase64 },
      });
      if (error) throw error;
      toast({ title: "Rechnung versendet", description: `E-Mail an ${invoice.rechnungs_email} gesendet.` });
      fetchInvoices();
      if (showDetail?.id === invoice.id) setShowDetail(null);
    } catch (e: any) {
      toast({ title: "Versand fehlgeschlagen", description: e.message, variant: "destructive" });
    } finally {
      setSendingId(null);
    }
  };

  const handleDownloadPdf = async (invoice: Invoice) => {
    try {
      let logoBytes: ArrayBuffer | undefined;
      try {
        const logoResp = await fetch(foxLogoUrl);
        if (logoResp.ok) logoBytes = await logoResp.arrayBuffer();
      } catch { /* no logo */ }
      const pdfBytes = await generateInvoicePdf(invoice, logoBytes);
      openPdfBlob(pdfBytes, `Rechnung-${invoice.invoice_number}.pdf`);
    } catch (e: any) {
      toast({ title: "PDF-Fehler", description: e.message, variant: "destructive" });
    }
  };

  const handleStatusChange = async (invoice: Invoice, newStatus: string) => {
    setSavingId(invoice.id);
    const { error } = await supabase.from("invoices").update({ status: newStatus }).eq("id", invoice.id);
    if (!error) {
      toast({ title: "Status geändert" });
      fetchInvoices();
      if (showDetail) setShowDetail({ ...showDetail, status: newStatus });
    }
    setSavingId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("invoices").delete().eq("id", deleteTarget.id);
    if (!error) {
      toast({ title: "Rechnung gelöscht" });
      fetchInvoices();
    }
    setDeleteTarget(null);
  };

  const filtered = invoices.filter((inv) =>
    !search ||
    inv.invoice_number.toLowerCase().includes(search.toLowerCase()) ||
    inv.customer_name.toLowerCase().includes(search.toLowerCase())
  );

  const filteredUsage = usageCharges.filter((uc) =>
    !usageSearch ||
    uc.hfx_customer_number.toLowerCase().includes(usageSearch.toLowerCase()) ||
    uc.unit_description.toLowerCase().includes(usageSearch.toLowerCase())
  );

  const stats = {
    total: invoices.length,
    offen: invoices.filter((i) => i.status === "entwurf").length,
    versendet: invoices.filter((i) => i.status === "versendet").length,
    bezahlt: invoices.filter((i) => i.status === "bezahlt").length,
    volumen: invoices.filter((i) => i.status !== "storniert").reduce((s, i) => s + Number(i.gross_amount), 0),
  };

  const usageStats = {
    pending: usageCharges.filter((u) => u.status === "pending").length,
    invoiced: usageCharges.filter((u) => u.status === "invoiced").length,
    pendingAmount: usageCharges.filter((u) => u.status === "pending").reduce((s, u) => s + Number(u.net_amount), 0),
  };

  const handleManualInvoice = async (charge: UsageCharge) => {
    setInvoicingChargeId(charge.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Find the linked contract for address data
      let contractData: Contract | undefined;
      if (charge.contract_id) {
        contractData = contracts.find((c) => c.id === charge.contract_id);
        if (!contractData) {
          const { data } = await supabase
            .from("contracts")
            .select("id, customer_name, hfx_customer_number, rechnungs_email, adresse, plz, ort, monthly_price, product_name, status")
            .eq("id", charge.contract_id)
            .maybeSingle();
          contractData = data as Contract | undefined;
        }
      }

      const net = Number(charge.net_amount);
      const taxRate = 19;
      const taxAmount = Math.round(net * (taxRate / 100) * 100) / 100;
      const grossAmount = net + taxAmount;

      const periodFrom = new Date(charge.period_from).toLocaleDateString("de-DE");
      const periodTo = new Date(charge.period_to).toLocaleDateString("de-DE");

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any).from("invoices").insert({
        contract_id: charge.contract_id,
        customer_name: contractData?.customer_name || `HFX ${charge.hfx_customer_number}`,
        customer_number: charge.hfx_customer_number,
        rechnungs_email: contractData?.rechnungs_email || null,
        adresse: contractData?.adresse || null,
        plz: contractData?.plz || null,
        ort: contractData?.ort || null,
        positions: [{
          description: `${charge.unit_description} (${periodFrom} – ${periodTo})`,
          quantity: charge.quantity,
          unit_price: Number(charge.unit_price),
        }],
        net_amount: net,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        gross_amount: grossAmount,
        invoice_date: new Date().toISOString().split("T")[0],
        notes: `Manuell abgerechnete Nutzungsgebühr für HFX-Nr. ${charge.hfx_customer_number}`,
        created_by: user?.id,
      });

      if (error) throw error;

      // Mark usage charge as invoiced
      await supabase.from("usage_charges").update({ status: "invoiced" }).eq("id", charge.id);

      toast({ title: "Rechnung erstellt", description: `Nutzungsgebühr für ${charge.hfx_customer_number} wurde abgerechnet.` });
      fetchInvoices();
      fetchUsageCharges();
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setInvoicingChargeId(null);
    }
  };

  return (
    <MainLayout title="Rechnungen" subtitle="Rechnungen erstellen, versenden und verwalten">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Rechnungen</h1>
            <p className="text-muted-foreground text-sm mt-1">Rechnungen erstellen, versenden und verwalten</p>
          </div>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Neue Rechnung
          </Button>
        </div>

        <Tabs defaultValue="rechnungen">
          <TabsList>
            <TabsTrigger value="rechnungen" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Rechnungen
              {stats.offen > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{stats.offen}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="nutzungsgebuehren" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Nutzungsgebühren
              {usageStats.pending > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 px-1.5 text-xs">{usageStats.pending}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Rechnungen Tab ── */}
          <TabsContent value="rechnungen" className="space-y-4 mt-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{stats.total}</div>
                  <div className="text-xs text-muted-foreground mt-1">Gesamt</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-warning">{stats.offen}</div>
                  <div className="text-xs text-muted-foreground mt-1">Entwürfe</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-primary">{stats.versendet}</div>
                  <div className="text-xs text-muted-foreground mt-1">Versendet</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-primary">{stats.volumen.toFixed(2)} €</div>
                  <div className="text-xs text-muted-foreground mt-1">Gesamtvolumen (brutto)</div>
                </CardContent>
              </Card>
            </div>

            {/* Table */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Suchen..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button variant="outline" size="icon" onClick={fetchInvoices}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rechnungsnr.</TableHead>
                      <TableHead>Kunde</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                      <TableHead>Zahlung</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktionen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Laden...</TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {search ? "Keine Rechnungen gefunden." : "Noch keine Rechnungen vorhanden."}
                        </TableCell>
                      </TableRow>
                    ) : filtered.map((inv) => {
                      const s = STATUS_CONFIG[inv.status] || STATUS_CONFIG.entwurf;
                      const StatusIcon = s.icon;
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                          <TableCell>
                            <div>{inv.customer_name}</div>
                            {inv.customer_number && <div className="text-xs text-muted-foreground">{inv.customer_number}</div>}
                          </TableCell>
                          <TableCell>{new Date(inv.invoice_date).toLocaleDateString("de-DE")}</TableCell>
                          <TableCell className="text-right font-medium">{Number(inv.gross_amount).toFixed(2)} €</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="gap-1 text-xs">
                              💳 Stripe
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={s.variant} className="gap-1">
                              <StatusIcon className="h-3 w-3" />
                              {s.label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon" onClick={() => setShowDetail(inv)} title="Details">
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" onClick={() => handleDownloadPdf(inv)} title="PDF herunterladen">
                                <Download className="h-4 w-4" />
                              </Button>
                              {inv.status === "entwurf" && inv.rechnungs_email && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleSendEmail(inv)}
                                  disabled={sendingId === inv.id}
                                  title="Per E-Mail versenden"
                                >
                                  <Send className="h-4 w-4" />
                                </Button>
                              )}
                              {inv.status === "entwurf" && (
                                <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(inv)} title="Löschen">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Nutzungsgebühren Tab ── */}
          <TabsContent value="nutzungsgebuehren" className="space-y-4 mt-4">
            {/* Usage stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-destructive">{usageStats.pending}</div>
                  <div className="text-xs text-muted-foreground mt-1">Offen (ausstehend)</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold text-primary">{usageStats.invoiced}</div>
                  <div className="text-xs text-muted-foreground mt-1">Abgerechnet</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{usageStats.pendingAmount.toFixed(2)} €</div>
                  <div className="text-xs text-muted-foreground mt-1">Offener Betrag (netto)</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="HFX-Nr. oder Beschreibung..."
                      value={usageSearch}
                      onChange={(e) => setUsageSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Button variant="outline" size="icon" onClick={fetchUsageCharges}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HFX-Nr.</TableHead>
                      <TableHead>Beschreibung</TableHead>
                      <TableHead>Periode</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aktion</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usageLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Laden...</TableCell>
                      </TableRow>
                    ) : filteredUsage.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {usageSearch ? "Keine Einträge gefunden." : "Noch keine Nutzungsgebühren vorhanden."}
                        </TableCell>
                      </TableRow>
                    ) : filteredUsage.map((uc) => (
                      <TableRow key={uc.id}>
                        <TableCell className="font-mono font-medium">{uc.hfx_customer_number}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={uc.unit_description}>
                          {uc.unit_description}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{new Date(uc.period_from).toLocaleDateString("de-DE")}</div>
                          <div className="text-muted-foreground">– {new Date(uc.period_to).toLocaleDateString("de-DE")}</div>
                        </TableCell>
                        <TableCell className="text-right">{uc.quantity}</TableCell>
                        <TableCell className="text-right font-medium">{Number(uc.net_amount).toFixed(2)} €</TableCell>
                        <TableCell>
                          {uc.status === "pending" ? (
                            <Badge variant="destructive" className="gap-1">
                              <Clock className="h-3 w-3" />
                              Ausstehend
                            </Badge>
                          ) : uc.status === "invoiced" ? (
                            <Badge variant="default" className="gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Abgerechnet
                            </Badge>
                          ) : (
                            <Badge variant="secondary">{uc.status}</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {uc.status === "pending" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleManualInvoice(uc)}
                              disabled={invoicingChargeId === uc.id}
                              className="gap-1"
                            >
                              <FileText className="h-3.5 w-3.5" />
                              {invoicingChargeId === uc.id ? "Wird erstellt..." : "Manuell abrechnen"}
                            </Button>
                          ) : uc.invoice_id ? (
                            <Badge variant="outline" className="gap-1 text-xs cursor-default">
                              <Link className="h-3 w-3" />
                              Rechnung verknüpft
                            </Badge>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={(o) => { setShowCreate(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Neue Rechnung erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {/* Contract selection */}
            <div className="space-y-2">
              <Label>Aus Vertrag übernehmen (optional)</Label>
              <Select value={form.contract_id} onValueChange={handleContractSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Vertrag auswählen..." />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.customer_name}{c.hfx_customer_number ? ` – ${c.hfx_customer_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2 md:col-span-1">
                <Label>Kundenname *</Label>
                <Input value={form.customer_name} onChange={(e) => setForm((f) => ({ ...f, customer_name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Kundennummer</Label>
                <Input value={form.customer_number} onChange={(e) => setForm((f) => ({ ...f, customer_number: e.target.value }))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Rechnungs-E-Mail</Label>
                <Input type="email" value={form.rechnungs_email} onChange={(e) => setForm((f) => ({ ...f, rechnungs_email: e.target.value }))} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Adresse</Label>
                <Input value={form.adresse} onChange={(e) => setForm((f) => ({ ...f, adresse: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>PLZ</Label>
                <Input value={form.plz} onChange={(e) => setForm((f) => ({ ...f, plz: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Ort</Label>
                <Input value={form.ort} onChange={(e) => setForm((f) => ({ ...f, ort: e.target.value }))} />
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rechnungsdatum *</Label>
                <Input type="date" value={form.invoice_date} onChange={(e) => setForm((f) => ({ ...f, invoice_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Fälligkeitsdatum</Label>
                <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
              </div>
            </div>

            {/* Positions */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Positionen</Label>
                <Button variant="outline" size="sm" onClick={addPosition}>
                  <Plus className="h-3 w-3 mr-1" /> Position
                </Button>
              </div>
              {positions.map((pos, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-6 space-y-1">
                    {i === 0 && <Label className="text-xs">Beschreibung</Label>}
                    <Input
                      placeholder="Beschreibung"
                      value={pos.description}
                      onChange={(e) => updatePosition(i, "description", e.target.value)}
                    />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Menge</Label>}
                    <Input
                      type="number"
                      min={1}
                      value={pos.quantity}
                      onChange={(e) => updatePosition(i, "quantity", Number(e.target.value))}
                    />
                  </div>
                  <div className="col-span-3 space-y-1">
                    {i === 0 && <Label className="text-xs">Einzelpreis (€)</Label>}
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={pos.unit_price}
                      onChange={(e) => updatePosition(i, "unit_price", Number(e.target.value))}
                    />
                  </div>
                  <div className="col-span-1">
                    {positions.length > 1 && (
                      <Button variant="ghost" size="icon" onClick={() => removePosition(i)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Tax + Totals */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>MwSt. (%)</Label>
                <Select value={String(form.tax_rate)} onValueChange={(v) => setForm((f) => ({ ...f, tax_rate: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="19">19 %</SelectItem>
                    <SelectItem value="7">7 %</SelectItem>
                    <SelectItem value="0">0 % (steuerfrei)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 text-sm bg-muted rounded-md p-3">
                <div className="flex justify-between"><span>Netto:</span><span>{net_amount.toFixed(2)} €</span></div>
                <div className="flex justify-between text-muted-foreground"><span>MwSt. ({form.tax_rate}%):</span><span>{tax_amount.toFixed(2)} €</span></div>
                <div className="flex justify-between font-bold border-t pt-1 mt-1"><span>Brutto:</span><span>{gross_amount.toFixed(2)} €</span></div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notizen / Zahlungshinweise</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreate(false); resetForm(); }}>Abbrechen</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Speichern..." : "Rechnung erstellen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      {showDetail && (
        <Dialog open={!!showDetail} onOpenChange={(o) => { setShowDetail(o ? showDetail : null); if (!o) setDetailEmail(""); }}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Rechnung {showDetail.invoice_number}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {/* Customer info */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-muted-foreground">Kunde:</span> <span className="font-medium">{showDetail.customer_name}</span></div>
                {showDetail.customer_number && <div><span className="text-muted-foreground">Nr.:</span> {showDetail.customer_number}</div>}
                <div className="col-span-2 space-y-2">
                  <span className="text-muted-foreground">Rechnungs-E-Mail:</span>
                  {showDetail.rechnungs_email && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setDetailEmail(showDetail.rechnungs_email!)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                          (detailEmail === "" || detailEmail === showDetail.rechnungs_email)
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted text-muted-foreground border-border hover:bg-accent"
                        }`}
                      >
                        {showDetail.rechnungs_email}
                      </button>
                      <span className="text-xs text-muted-foreground">oder alternative Adresse:</span>
                    </div>
                  )}
                  <Input
                    type="email"
                    placeholder={showDetail.rechnungs_email ? "Alternative E-Mail eingeben..." : "E-Mail für Rechnungsversand..."}
                    value={detailEmail === showDetail.rechnungs_email ? "" : detailEmail}
                    onChange={(e) => setDetailEmail(e.target.value)}
                    className="h-8 text-sm"
                  />
                  {(detailEmail && detailEmail !== showDetail.rechnungs_email) && (
                    <p className="text-xs text-destructive">↑ Alternative Adresse wird verwendet</p>
                  )}
                </div>
                <div><span className="text-muted-foreground">Datum:</span> {new Date(showDetail.invoice_date).toLocaleDateString("de-DE")}</div>
                {showDetail.due_date && <div><span className="text-muted-foreground">Fällig:</span> {new Date(showDetail.due_date).toLocaleDateString("de-DE")}</div>}
              </div>

              {/* Positions table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead className="text-right">Menge</TableHead>
                    <TableHead className="text-right">Einzelpreis</TableHead>
                    <TableHead className="text-right">Gesamt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {showDetail.positions.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>{p.description}</TableCell>
                      <TableCell className="text-right">{p.quantity}</TableCell>
                      <TableCell className="text-right">{Number(p.unit_price).toFixed(2)} €</TableCell>
                      <TableCell className="text-right">{(p.quantity * p.unit_price).toFixed(2)} €</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Totals */}
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Netto:</span><span>{Number(showDetail.net_amount).toFixed(2)} €</span></div>
                <div className="flex justify-between text-muted-foreground"><span>MwSt. ({showDetail.tax_rate}%):</span><span>{Number(showDetail.tax_amount).toFixed(2)} €</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-1 mt-1"><span>Brutto:</span><span>{Number(showDetail.gross_amount).toFixed(2)} €</span></div>
              </div>

              {/* Status change */}
              <div className="flex items-center gap-3">
                <Label className="whitespace-nowrap">Status ändern:</Label>
                <Select
                  value={showDetail.status}
                  onValueChange={(v) => handleStatusChange(showDetail, v)}
                  disabled={savingId === showDetail.id}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entwurf">Entwurf</SelectItem>
                    <SelectItem value="versendet">Versendet</SelectItem>
                    <SelectItem value="bezahlt">Bezahlt</SelectItem>
                    <SelectItem value="storniert">Storniert</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {showDetail.notes && (
                <div className="text-sm text-muted-foreground border-t pt-3">{showDetail.notes}</div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowDetail(null); setDetailEmail(""); }}>Schließen</Button>
              <Button variant="outline" onClick={() => handleDownloadPdf(showDetail)}>
                <Download className="h-4 w-4 mr-2" />
                PDF herunterladen
              </Button>
              {showDetail.status !== "storniert" && (
                <Button
                  onClick={() => handleSendEmail(showDetail, (detailEmail && detailEmail !== showDetail.rechnungs_email ? detailEmail : undefined) || showDetail.rechnungs_email || undefined)}
                  disabled={sendingId === showDetail.id || !(detailEmail || showDetail.rechnungs_email)}
                >
                  <Send className="h-4 w-4 mr-2" />
                  {sendingId === showDetail.id ? "Wird versendet..." : showDetail.email_sent_at ? "Erneut versenden" : "Per E-Mail versenden"}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rechnung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Rechnung <strong>{deleteTarget?.invoice_number}</strong> wird unwiderruflich gelöscht.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
}
