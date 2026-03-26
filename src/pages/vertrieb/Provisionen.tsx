import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Euro, TrendingUp, Users, Calendar, Settings, Plus, Pencil, Trash2, Loader2,
  Percent, CalendarDays, CheckCircle2, Clock, Banknote, FileDown, ChevronDown, ChevronRight,
  Zap, Award, Gift, Info,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ─── Types ──────────────────────────────────────────────────────────────────

type CommissionType = "prozent" | "festbetrag" | "monatlich";

interface ProductCommission {
  id: string;
  product_name: string;
  commission_type: CommissionType;
  commission_value: number;
  description: string | null;
  is_active: boolean;
  sprint_start: string | null;
  sprint_end: string | null;
  sprint_target_1: number | null;
  sprint_target_2: number | null;
  sprint_bonus_1: number | null;
  sprint_bonus_2: number | null;
}

interface CommissionPayout {
  id: string;
  sales_partner_id: string;
  sales_partner_name: string;
  contract_id: string | null;
  invoice_id: string | null;
  product_name: string;
  commission_type: string;
  commission_rate: number;
  commission_amount: number;
  period_month: string;
  status: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  created_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const typeLabels: Record<CommissionType, string> = {
  prozent: "% vom Umsatz",
  festbetrag: "Festbetrag / Abschluss",
  monatlich: "€ / Monat",
};

const typeIcons: Record<CommissionType, React.ReactNode> = {
  prozent: <Percent className="h-4 w-4" />,
  festbetrag: <Euro className="h-4 w-4" />,
  monatlich: <CalendarDays className="h-4 w-4" />,
};

const formatValue = (type: CommissionType, value: number) =>
  type === "prozent" ? `${value}%` : `${value.toFixed(2)} €`;

const fmtEur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  pending: { label: "Ausstehend", class: "bg-orange-100 text-orange-800" },
  approved: { label: "Freigegeben", class: "bg-blue-100 text-blue-800" },
  paid: { label: "Ausgezahlt", class: "bg-green-100 text-green-800" },
  exported: { label: "Exportiert", class: "bg-muted text-muted-foreground" },
};

const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-");
  const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  return `${months[parseInt(mo, 10) - 1]} ${y}`;
};

// ─── PDF Generation ──────────────────────────────────────────────────────────

async function generateCommissionPdf(
  partnerName: string,
  month: string,
  payouts: CommissionPayout[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const blue = rgb(0.043, 0.212, 0.498);
  const gray = rgb(0.4, 0.4, 0.4);
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars

  let y = 800;

  // Header bar
  page.drawRectangle({ x: 0, y: y - 10, width: 595, height: 60, color: blue });
  page.drawText("Provisionsabrechnung", { x: 40, y: y + 26, size: 22, font: bold, color: white });
  page.drawText("HFX Sales Portal – Honorarfuchs", { x: 40, y: y + 6, size: 10, font, color: rgb(0.8, 0.85, 1) });
  y -= 80;

  // Info block
  page.drawText(`Vertriebler: ${partnerName}`, { x: 40, y, size: 12, font: bold, color: black });
  y -= 18;
  page.drawText(`Abrechnungszeitraum: ${fmtMonth(month)}`, { x: 40, y, size: 11, font, color: gray });
  y -= 18;
  page.drawText(`Erstellt am: ${new Date().toLocaleDateString("de-DE")}`, { x: 40, y, size: 10, font, color: gray });
  y -= 30;

  // Table header
  page.drawRectangle({ x: 40, y: y - 6, width: 515, height: 22, color: rgb(0.95, 0.96, 1) });
  const cols = [40, 180, 300, 400, 510];
  page.drawText("Produkt", { x: cols[0], y, size: 9, font: bold, color: blue });
  page.drawText("Provisionsmodell", { x: cols[1], y, size: 9, font: bold, color: blue });
  page.drawText("Satz", { x: cols[2], y, size: 9, font: bold, color: blue });
  page.drawText("Betrag", { x: cols[3], y, size: 9, font: bold, color: blue });
  page.drawText("Status", { x: cols[4], y, size: 9, font: bold, color: blue });
  y -= 24;

  // Rows
  for (const p of payouts) {
    if (y < 80) break;
    page.drawText(p.product_name.slice(0, 22), { x: cols[0], y, size: 9, font, color: black });
    page.drawText(typeLabels[p.commission_type as CommissionType] ?? p.commission_type, { x: cols[1], y, size: 9, font, color: gray });
    page.drawText(formatValue(p.commission_type as CommissionType, p.commission_rate), { x: cols[2], y, size: 9, font, color: black });
    page.drawText(fmtEur(p.commission_amount), { x: cols[3], y, size: 9, font: bold, color: black });
    page.drawText(STATUS_LABELS[p.status]?.label ?? p.status, { x: cols[4], y, size: 9, font, color: gray });
    y -= 18;

    // Separator
    page.drawLine({ start: { x: 40, y: y + 4 }, end: { x: 555, y: y + 4 }, thickness: 0.5, color: rgb(0.9, 0.9, 0.9) });
  }

  y -= 16;

  // Total
  const total = payouts.reduce((s, p) => s + p.commission_amount, 0);
  page.drawRectangle({ x: 40, y: y - 6, width: 515, height: 26, color: rgb(0.9, 0.93, 1) });
  page.drawText("Gesamtbetrag", { x: cols[0], y: y + 4, size: 11, font: bold, color: blue });
  page.drawText(fmtEur(total), { x: cols[3], y: y + 4, size: 11, font: bold, color: blue });
  y -= 50;

  // Footer
  page.drawText("Diese Abrechnung wurde automatisch vom HFX Sales Portal generiert.", {
    x: 40, y: 30, size: 8, font, color: gray,
  });

  return doc.save();
}

// ─── Main Component ──────────────────────────────────────────────────────────

const Provisionen = () => {
  const { isAdmin, isSalesPartner, isTippgeber, isSalesLead } = useUserRole();
  // Provisionsbearbeitung: nur admin und sales_lead
  const canEditCommissions = isAdmin || isSalesLead;
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Sales partner and Tippgeber see only own payouts
  const isOwnView = isSalesPartner || isTippgeber;

  // Commission rates dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ProductCommission | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<ProductCommission | null>(null);
  const [form, setForm] = useState({
    product_name: "",
    commission_type: "prozent" as CommissionType,
    commission_value: 0,
    description: "",
    is_active: true,
    sprint_start: "",
    sprint_end: "",
    sprint_target_1: 0,
    sprint_target_2: 0,
    sprint_bonus_1: 0,
    sprint_bonus_2: 0,
  });

  // Payout state
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [approvingGroup, setApprovingGroup] = useState<string | null>(null);
  const [payingGroup, setPayingGroup] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);

  // ── Queries ──

  const { data: commissions = [], isLoading: commissionsLoading } = useQuery({
    queryKey: ["product-commissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("product_commissions").select("*").order("product_name");
      if (error) throw error;
      return data as ProductCommission[];
    },
  });

  const { data: payouts = [], isLoading: payoutsLoading } = useQuery({
    queryKey: ["commission-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commission_payouts")
        .select("*")
        .order("period_month", { ascending: false });
      if (error) throw error;
      return data as CommissionPayout[];
    },
  });

  // Tippgeber milestone tracking
  const { data: milestones = [], refetch: refetchMilestones } = useQuery({
    queryKey: ["tippgeber-milestones", user?.id, isAdmin, isTippgeber],
    queryFn: async () => {
      let query = supabase
        .from("tippgeber_milestone_tracking" as any)
        .select(`
          *,
          contracts:contract_id(customer_name, product_name, hfx_customer_number),
          tippgeber_profile:tippgeber_id(full_name)
        `)
        .order("created_at", { ascending: false });
      if (isTippgeber && !isAdmin) {
        query = query.eq("tippgeber_id", user?.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!(isAdmin || isTippgeber),
  });

  const [triggeringMilestone, setTriggeringMilestone] = useState<string | null>(null);

  const triggerMilestonePayout = async (milestone: any) => {
    if (!isAdmin) return;
    setTriggeringMilestone(milestone.id);
    try {
      // Create commission payout for tippgeber
      const { data: payout, error: payoutError } = await supabase
        .from("commission_payouts")
        .insert({
          sales_partner_id: milestone.tippgeber_id,
          sales_partner_name: milestone.tippgeber_profile?.full_name || "Tippgeber",
          contract_id: milestone.contract_id,
          product_name: milestone.contracts?.product_name || "HFX GOÄ",
          commission_type: "festbetrag",
          commission_rate: 200,
          commission_amount: 200,
          period_month: new Date().toISOString().slice(0, 7),
          status: "approved",
          commission_role: "tippgeber",
          payout_trigger: "tippgeber_milestone",
        })
        .select("id")
        .single();

      if (payoutError) throw payoutError;

      // Mark milestone as payout triggered
      await supabase
        .from("tippgeber_milestone_tracking" as any)
        .update({
          payout_triggered: true,
          payout_triggered_at: new Date().toISOString(),
          payout_triggered_by: user?.id,
          payout_id: payout.id,
        })
        .eq("id", milestone.id);

      queryClient.invalidateQueries({ queryKey: ["commission-payouts"] });
      refetchMilestones();
      toast({ title: "Einmalprämie ausgelöst", description: "200 € Tippgeber-Provision wurde erstellt und freigegeben." });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setTriggeringMilestone(null);
    }
  };

  // ── Stats ──

  const stats = useMemo(() => {
    const total = payouts.reduce((s, p) => s + Number(p.commission_amount), 0);
    const pending = payouts.filter(p => p.status === "pending").reduce((s, p) => s + Number(p.commission_amount), 0);
    const approved = payouts.filter(p => p.status === "approved").reduce((s, p) => s + Number(p.commission_amount), 0);
    const paid = payouts.filter(p => p.status === "paid").reduce((s, p) => s + Number(p.commission_amount), 0);
    const partners = new Set(payouts.map(p => p.sales_partner_id)).size;
    return { total, pending, approved, paid, partners };
  }, [payouts]);

  // Group payouts by month + partner
  const grouped = useMemo(() => {
    const map = new Map<string, { month: string; partner: string; partnerId: string; items: CommissionPayout[] }>();
    for (const p of payouts) {
      const key = `${p.period_month}__${p.sales_partner_id}`;
      if (!map.has(key)) {
        map.set(key, { month: p.period_month, partner: p.sales_partner_name, partnerId: p.sales_partner_id, items: [] });
      }
      map.get(key)!.items.push(p);
    }
    return Array.from(map.values()).sort((a, b) => b.month.localeCompare(a.month));
  }, [payouts]);

  // ── Mutations ──

  const saveMutation = useMutation({
    mutationFn: async (data: typeof form & { id?: string }) => {
      const sprintFields = data.commission_type === "festbetrag" ? {
        sprint_start: data.sprint_start || null,
        sprint_end: data.sprint_end || null,
        sprint_target_1: data.sprint_target_1 || null,
        sprint_target_2: data.sprint_target_2 || null,
        sprint_bonus_1: data.sprint_bonus_1 || 0,
        sprint_bonus_2: data.sprint_bonus_2 || 0,
      } : {
        sprint_start: null,
        sprint_end: null,
        sprint_target_1: null,
        sprint_target_2: null,
        sprint_bonus_1: 0,
        sprint_bonus_2: 0,
      };
      const payload = {
        product_name: data.product_name,
        commission_type: data.commission_type,
        commission_value: data.commission_value,
        description: data.description || null,
        is_active: data.is_active,
        ...sprintFields,
      };
      if (data.id) {
        const { error } = await supabase.from("product_commissions").update(payload as any).eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("product_commissions").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-commissions"] });
      setDialogOpen(false);
      toast({ title: "Gespeichert", description: "Provisionssatz wurde gespeichert." });
    },
    onError: (error: Error) => toast({ title: "Fehler", description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["product-commissions"] });
      setDeleteDialogOpen(false);
      toast({ title: "Gelöscht", description: "Provisionssatz wurde entfernt." });
    },
    onError: (error: Error) => toast({ title: "Fehler", description: error.message, variant: "destructive" }),
  });

  // ── Payout Actions ──

  const approveGroup = async (month: string, partnerId: string, groupKey: string) => {
    if (!canEditCommissions) return;
    setApprovingGroup(groupKey);
    try {
      const ids = payouts
        .filter(p => p.period_month === month && p.sales_partner_id === partnerId && p.status === "pending")
        .map(p => p.id);
      if (ids.length === 0) { toast({ title: "Keine ausstehenden Einträge" }); return; }

      const { error } = await supabase
        .from("commission_payouts")
        .update({ status: "approved", approved_by: user?.id, approved_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["commission-payouts"] });
      toast({ title: "Freigegeben", description: `${ids.length} Provisionen für ${fmtMonth(month)} freigegeben.` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setApprovingGroup(null);
    }
  };

  const markPaid = async (month: string, partnerId: string, groupKey: string) => {
    if (!canEditCommissions) return;
    setPayingGroup(groupKey);
    try {
      const ids = payouts
        .filter(p => p.period_month === month && p.sales_partner_id === partnerId && p.status === "approved")
        .map(p => p.id);
      if (ids.length === 0) { toast({ title: "Keine freigegebenen Einträge" }); return; }

      const { error } = await supabase
        .from("commission_payouts")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .in("id", ids);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["commission-payouts"] });
      toast({ title: "Als ausgezahlt markiert", description: `${ids.length} Provisionen ausgezahlt.` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setPayingGroup(null);
    }
  };

  const downloadPdf = async (group: { month: string; partner: string; partnerId: string; items: CommissionPayout[] }) => {
    const key = `${group.month}__${group.partnerId}`;
    setGeneratingPdf(key);
    try {
      const bytes = await generateCommissionPdf(group.partner, group.month, group.items);
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Provisionsabrechnung_${group.partner.replace(/\s+/g, "_")}_${group.month}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "PDF-Fehler", description: e.message, variant: "destructive" });
    } finally {
      setGeneratingPdf(null);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const openCreateDialog = () => {
    setEditingItem(null);
    setForm({ product_name: "", commission_type: "prozent", commission_value: 0, description: "", is_active: true, sprint_start: "", sprint_end: "", sprint_target_1: 0, sprint_target_2: 0, sprint_bonus_1: 0, sprint_bonus_2: 0 });
    setDialogOpen(true);
  };

  const openEditDialog = (item: ProductCommission) => {
    setEditingItem(item);
    setForm({
      product_name: item.product_name,
      commission_type: item.commission_type as CommissionType,
      commission_value: item.commission_value,
      description: item.description || "",
      is_active: item.is_active,
      sprint_start: item.sprint_start || "",
      sprint_end: item.sprint_end || "",
      sprint_target_1: item.sprint_target_1 || 0,
      sprint_target_2: item.sprint_target_2 || 0,
      sprint_bonus_1: item.sprint_bonus_1 || 0,
      sprint_bonus_2: item.sprint_bonus_2 || 0,
    });
    setDialogOpen(true);
  };

  return (
    <MainLayout
      title="Provisionen"
      subtitle={isOwnView ? "Ihre persönliche Provisionsübersicht" : "Übersicht aller Vertriebsprovisionen"}
    >
      <div className="space-y-6">

        {/* Stats */}
        <div className={`grid gap-4 ${isOwnView ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 lg:grid-cols-5"}`}>
          {[
            { label: "Gesamt", value: fmtEur(stats.total), sub: "Alle Provisionen", icon: <Euro className="h-4 w-4 text-muted-foreground" /> },
            { label: "Ausstehend", value: fmtEur(stats.pending), sub: "Noch nicht freigegeben", icon: <Clock className="h-4 w-4 text-muted-foreground" />, highlight: "orange" },
            { label: "Freigegeben", value: fmtEur(stats.approved), sub: "Bereit zur Auszahlung", icon: <CheckCircle2 className="h-4 w-4 text-muted-foreground" />, highlight: "blue" },
            { label: "Ausgezahlt", value: fmtEur(stats.paid), sub: "Bereits überwiesen", icon: <TrendingUp className="h-4 w-4 text-muted-foreground" />, highlight: "green" },
            ...(!isOwnView ? [{ label: "Aktive Partner", value: stats.partners.toString(), sub: "Mit Provisionen", icon: <Users className="h-4 w-4 text-muted-foreground" /> }] : []),
          ].map((card) => (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                {card.icon}
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${card.highlight === "orange" ? "text-amber-600" : card.highlight === "blue" ? "text-blue-600" : card.highlight === "green" ? "text-green-600" : ""}`}>
                  {card.value}
                </div>
                <p className="text-xs text-muted-foreground">{card.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>


        <Tabs defaultValue="payouts">
          <TabsList>
            <TabsTrigger value="payouts">Provisionsauszahlungen ({payouts.length})</TabsTrigger>
            {!isOwnView && <TabsTrigger value="rates">Provisionssätze ({commissions.length})</TabsTrigger>}
            {(isAdmin || isTippgeber) && <TabsTrigger value="goae">HFX GOÄ Regelwerk</TabsTrigger>}
            {(isAdmin || isTippgeber) && <TabsTrigger value="milestones">Tippgeber-Meilensteine ({milestones.filter((m: any) => m.milestone_reached && !m.payout_triggered).length})</TabsTrigger>}
          </TabsList>

          {/* ── Payouts Tab ── */}
          <TabsContent value="payouts" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Provisionsauszahlungen</CardTitle>
                <CardDescription>Automatisch generierte Provisionen aus Vertragsabrechnungen, gruppiert nach Monat und Vertriebler</CardDescription>
              </CardHeader>
              <CardContent>
                {payoutsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : grouped.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Banknote className="h-12 w-12 mx-auto mb-3 opacity-40" />
                    <p className="font-medium">Keine Provisionen vorhanden</p>
                    <p className="text-sm mt-1">Provisionen werden automatisch bei der monatlichen Abrechnung generiert.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {grouped.map((group) => {
                      const key = `${group.month}__${group.partnerId}`;
                      const isExpanded = expandedGroups.has(key);
                      const groupTotal = group.items.reduce((s, p) => s + Number(p.commission_amount), 0);
                      const allPending = group.items.every(p => p.status === "pending");
                      const allApproved = group.items.every(p => p.status === "approved");
                      const anyPending = group.items.some(p => p.status === "pending");
                      const anyApproved = group.items.some(p => p.status === "approved");

                      // Determine overall group status
                      let groupStatus = "mixed";
                      if (group.items.every(p => p.status === "paid")) groupStatus = "paid";
                      else if (group.items.every(p => p.status === "approved" || p.status === "paid")) groupStatus = "approved";
                      else if (allPending) groupStatus = "pending";

                      return (
                        <div key={key} className="border rounded-lg overflow-hidden">
                          {/* Group Header */}
                          <div
                            className="flex items-center justify-between p-4 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => toggleGroup(key)}
                          >
                            <div className="flex items-center gap-3">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                              <div>
                                <p className="font-semibold text-foreground">{group.partner}</p>
                                <p className="text-sm text-muted-foreground">{fmtMonth(group.month)} · {group.items.length} Position(en)</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-foreground">{fmtEur(groupTotal)}</span>
                              <Badge
                                className={`${STATUS_LABELS[groupStatus]?.class ?? ""} border-0`}
                                variant="secondary"
                              >
                                {STATUS_LABELS[groupStatus]?.label ?? groupStatus}
                              </Badge>
                     {isAdmin && (
                       <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                         {anyPending && (
                           <Button
                             size="sm"
                             variant="outline"
                             className="text-blue-700 border-blue-300 hover:bg-blue-50 h-7 text-xs"
                             disabled={approvingGroup === key}
                             onClick={() => approveGroup(group.month, group.partnerId, key)}
                           >
                             {approvingGroup === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
                             Freigeben
                           </Button>
                         )}
                         {anyApproved && !anyPending && (
                           <Button
                             size="sm"
                             variant="outline"
                             className="text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs"
                             disabled={payingGroup === key}
                             onClick={() => markPaid(group.month, group.partnerId, key)}
                           >
                             {payingGroup === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <Banknote className="h-3 w-3 mr-1" />}
                             Ausgezahlt
                           </Button>
                         )}
                         <Button
                           size="sm"
                           variant="outline"
                           className="h-7 text-xs"
                           disabled={generatingPdf === key}
                           onClick={() => downloadPdf(group)}
                         >
                           {generatingPdf === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileDown className="h-3 w-3 mr-1" />}
                           PDF
                         </Button>
                       </div>
                     )}
                            </div>
                          </div>

                          {/* Expanded rows */}
                          {isExpanded && (
                            <div className="border-t">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Produkt</TableHead>
                                    <TableHead>Modell</TableHead>
                                    <TableHead>Satz</TableHead>
                                    <TableHead className="text-right">Betrag</TableHead>
                                    <TableHead>Status</TableHead>
                                    {group.items.some(p => p.paid_at) && <TableHead>Ausgezahlt am</TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.items.map((p) => (
                                    <TableRow key={p.id}>
                                      <TableCell className="font-medium">{p.product_name}</TableCell>
                                      <TableCell className="text-muted-foreground text-sm">
                                        {typeLabels[p.commission_type as CommissionType] ?? p.commission_type}
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline">{formatValue(p.commission_type as CommissionType, p.commission_rate)}</Badge>
                                      </TableCell>
                                      <TableCell className="text-right font-semibold">{fmtEur(Number(p.commission_amount))}</TableCell>
                                      <TableCell>
                                        <Badge className={`${STATUS_LABELS[p.status]?.class ?? ""} border-0`} variant="secondary">
                                          {STATUS_LABELS[p.status]?.label ?? p.status}
                                        </Badge>
                                      </TableCell>
                                      {group.items.some(pp => pp.paid_at) && (
                                        <TableCell className="text-muted-foreground text-sm">
                                          {p.paid_at ? new Date(p.paid_at).toLocaleDateString("de-DE") : "—"}
                                        </TableCell>
                                      )}
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Commission Rates Tab ── */}
          <TabsContent value="rates" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="h-5 w-5" />
                    Provisionssätze pro Produkt
                  </CardTitle>
                  <CardDescription>
                    {canEditCommissions ? "Legen Sie die Provisionssätze für jedes Produkt fest" : "Übersicht der aktuellen Provisionssätze"}
                    <span className="block text-xs text-muted-foreground mt-1">Alle Provisionssätze abzüglich Tippgeber-Provisionen</span>
                  </CardDescription>
                </div>
                {canEditCommissions && (
                  <Button onClick={openCreateDialog}>
                    <Plus className="mr-2 h-4 w-4" />Neues Produkt
                  </Button>
                )}
              </CardHeader>
              <CardContent>
                {commissionsLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : commissions.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">Keine Provisionssätze konfiguriert.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Produkt</TableHead>
                        <TableHead>Modell</TableHead>
                        <TableHead>Satz</TableHead>
                        <TableHead>Beschreibung</TableHead>
                        <TableHead>Status</TableHead>
                        {canEditCommissions && <TableHead className="text-right">Aktionen</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissions.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.product_name}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {typeIcons[c.commission_type as CommissionType]}
                              <span className="text-sm">{typeLabels[c.commission_type as CommissionType]}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-semibold">{formatValue(c.commission_type as CommissionType, c.commission_value)}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{c.description || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={c.is_active ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-muted text-muted-foreground"}>
                              {c.is_active ? "Aktiv" : "Inaktiv"}
                            </Badge>
                          </TableCell>
                          {canEditCommissions && (
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(c)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setDeletingItem(c); setDeleteDialogOpen(true); }}>
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── HFX GOÄ Regelwerk Tab ── */}
          {(isAdmin || isTippgeber) && (
            <TabsContent value="goae" className="mt-4 space-y-4">
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 flex items-start gap-3">
                <Info className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">HFX GOÄ – Sonderregelwerk (nur für Verträge mit GOÄ im Produktnamen)</p>
                  <p className="text-sm text-muted-foreground mt-1">Alle anderen Produkte laufen weiterhin über die konfigurierbaren Provisionssätze.</p>
                </div>
              </div>

                <div className="grid gap-4 md:grid-cols-3">
                 {/* AD Karte */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Zap className="h-4 w-4 text-primary" />
                      AD / Gebietsleiter / Sales Lead
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="font-semibold">1. Festbetrag bei Vertragsabschluss</p>
                      <p className="text-2xl font-bold text-primary mt-1">100 €</p>
                      <p className="text-muted-foreground mt-1">Einmalig bei erster Rechnung</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="font-semibold">2. Verbrauchsprovision</p>
                      <p className="text-2xl font-bold text-primary mt-1">10 %</p>
                      <p className="text-muted-foreground mt-1">Auf Qodia-Verbrauchskosten (nicht Grundgebühr), für 24 Monate ab Vertragsbeginn</p>
                    </div>
                    <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-3">
                      <p className="font-semibold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                        <Award className="h-3.5 w-3.5" /> SPRINT-Bonus bis 31.12.2026
                      </p>
                      <p className="text-amber-700 dark:text-amber-500 mt-1">
                        Ab ≥ 25 GOÄ-Abschlüssen: Festbetrag steigt auf <strong>250 €</strong> pro Vertrag (+ 150 € Bonus)
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* Vertriebspartner Karte */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Vertriebspartner
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="font-semibold">Provision auf alle Erlöse</p>
                      <p className="text-2xl font-bold text-primary mt-1">10 %</p>
                      <p className="text-muted-foreground mt-1">Grundgebühr + Verbrauchskosten, zeitlich unbegrenzt solange Vertrag aktiv</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="font-semibold">Keine Vertretungsmacht</p>
                      <p className="text-muted-foreground mt-1">Nur Steuerung der Praxis durch digitale Vertragsstrecke</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="font-medium">⚠️ Erlischt bei Kündigung</p>
                      <p className="text-muted-foreground mt-1">Provision endet zum Kündigungstermin des Vertrags</p>
                    </div>
                  </CardContent>
                </Card>

                {/* Tippgeber Karte */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Gift className="h-4 w-4 text-primary" />
                      Tippgeber
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="font-semibold">Einmalprämie</p>
                      <p className="text-2xl font-bold text-primary mt-1">200 €</p>
                      <p className="text-muted-foreground mt-1">Sobald kumulierter Gesamterlös (Monatspauschale + Verbrauch) ≥ 500 € erreicht</p>
                    </div>
                    <div className="rounded-md bg-muted/50 p-3">
                      <p className="font-semibold">Manuell durch Admin</p>
                      <p className="text-muted-foreground mt-1">Auszahlung wird manuell im Tab „Tippgeber-Meilensteine" ausgelöst</p>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="font-medium">Unabhängig von AD-Provision</p>
                      <p className="text-muted-foreground mt-1">Tippgeber-Prämie wird nicht vom AD-Provisionssatz abgezogen</p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}

          {/* ── Tippgeber Milestones Tab ── */}
          {(isAdmin || isTippgeber) && (
            <TabsContent value="milestones" className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gift className="h-5 w-5" />
                    Tippgeber-Meilensteine (500 € Schwelle)
                  </CardTitle>
                  <CardDescription>
                    {isAdmin
                      ? "Sobald ein Tippgeber die 500 € Erlöse-Schwelle erreicht hat, kann die Einmalprämie von 200 € manuell ausgelöst werden."
                      : "Ihr Fortschritt zur Einmalprämie von 200 € pro eingereichtem Lead."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {milestones.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <Gift className="h-12 w-12 mx-auto mb-3 opacity-40" />
                      <p className="font-medium">Keine Meilensteine vorhanden</p>
                      <p className="text-sm mt-1">Sobald ein GOÄ-Vertrag mit Tippgeber-Zuordnung Rechnungen generiert, erscheinen hier die Fortschritte.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {milestones.map((m: any) => {
                        const progress = Math.min(100, Math.round((Number(m.cumulative_revenue) / 500) * 100));
                        return (
                          <div key={m.id} className="rounded-lg border p-4 space-y-3">
                            <div className="flex items-start justify-between gap-3 flex-wrap">
                              <div>
                                <p className="font-semibold text-foreground">
                                  {m.contracts?.customer_name || "—"}
                                  {m.contracts?.hfx_customer_number && (
                                    <span className="ml-2 text-xs font-mono text-muted-foreground">{m.contracts.hfx_customer_number}</span>
                                  )}
                                </p>
                                {isAdmin && (
                                  <p className="text-sm text-muted-foreground">
                                    Tippgeber: {m.tippgeber_profile?.full_name || m.tippgeber_id}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-0.5">{m.contracts?.product_name}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                 {m.payout_triggered ? (
                                  <Badge variant="secondary" className="bg-green-100 text-green-800 border-0">
                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Ausgezahlt
                                  </Badge>
                                ) : m.milestone_reached ? (
                                  isAdmin ? (
                                    <Button
                                      size="sm"
                                      className="h-8 text-xs"
                                      disabled={triggeringMilestone === m.id}
                                      onClick={() => triggerMilestonePayout(m)}
                                    >
                                      {triggeringMilestone === m.id ? (
                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                      ) : (
                                        <Gift className="h-3 w-3 mr-1" />
                                      )}
                                      200 € Prämie auslösen
                                    </Button>
                                  ) : (
                                    <Badge variant="secondary" className="border-0">
                                      🎉 Bereit – Admin ausstehend
                                    </Badge>
                                  )
                                ) : (
                                  <Badge variant="secondary" className="text-muted-foreground">In Bearbeitung</Badge>
                                )}
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>Kumulierter Erlös</span>
                                <span className="font-medium text-foreground">
                                  {fmtEur(Number(m.cumulative_revenue))} / 500 €
                                </span>
                              </div>
                              <Progress value={progress} className="h-2" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>

      {/* Create/Edit Commission Rate Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Provisionssatz bearbeiten" : "Neuer Provisionssatz"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Passen Sie den Provisionssatz für dieses Produkt an." : "Erstellen Sie einen neuen Provisionssatz für ein Produkt."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="product_name">Produktname</Label>
              <Input id="product_name" value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} placeholder="z.B. HFX GOÄ" />
            </div>
            <div className="grid gap-2">
              <Label>Provisionsmodell</Label>
              <Select value={form.commission_type} onValueChange={(v) => setForm({ ...form, commission_type: v as CommissionType })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="prozent">% vom Umsatz</SelectItem>
                  <SelectItem value="festbetrag">Festbetrag pro Abschluss</SelectItem>
                  <SelectItem value="monatlich">Euro / Monat</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="commission_value">{form.commission_type === "prozent" ? "Prozentsatz (%)" : "Betrag (€)"}</Label>
              <Input id="commission_value" type="number" min={0} step={form.commission_type === "prozent" ? 0.5 : 1} value={form.commission_value} onChange={(e) => setForm({ ...form, commission_value: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Beschreibung (optional)</Label>
              <Input id="description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Kurze Beschreibung" />
            </div>

            {/* Sprint Section – only for Festbetrag */}
            {form.commission_type === "festbetrag" && (
              <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold tracking-wide text-foreground">SPRINT</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Anfangsdatum</Label>
                    <Input type="date" value={form.sprint_start} onChange={(e) => setForm({ ...form, sprint_start: e.target.value })} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Enddatum</Label>
                    <Input type="date" value={form.sprint_end} onChange={(e) => setForm({ ...form, sprint_end: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Ziel 1: ≥ Menge</Label>
                    <Input type="number" min={0} value={form.sprint_target_1} onChange={(e) => setForm({ ...form, sprint_target_1: parseInt(e.target.value) || 0 })} placeholder="z.B. 10" />
                  </div>
                  <span className="pb-2 text-sm font-medium text-muted-foreground">+</span>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Ziel 2: ≥ Menge</Label>
                    <Input type="number" min={0} value={form.sprint_target_2} onChange={(e) => setForm({ ...form, sprint_target_2: parseInt(e.target.value) || 0 })} placeholder="z.B. 20" />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Die Sprint-Boni sind additiv: bei Erreichen von Ziel 2 werden beide Boni ausgezahlt.</p>
                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Sprint-Bonus 1 (€)</Label>
                    <Input type="number" min={0} step={1} value={form.sprint_bonus_1} onChange={(e) => setForm({ ...form, sprint_bonus_1: parseFloat(e.target.value) || 0 })} placeholder="z.B. 500" />
                  </div>
                  <span className="pb-2 text-sm font-medium text-muted-foreground">+</span>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">Sprint-Bonus 2 (€)</Label>
                    <Input type="number" min={0} step={1} value={form.sprint_bonus_2} onChange={(e) => setForm({ ...form, sprint_bonus_2: parseFloat(e.target.value) || 0 })} placeholder="z.B. 1000" />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(checked) => setForm({ ...form, is_active: checked })} />
              <Label>Aktiv</Label>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Abbrechen</Button>
            <Button onClick={() => saveMutation.mutate({ ...form, id: editingItem?.id })} disabled={saveMutation.isPending || !form.product_name}>
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Provisionssatz löschen?</DialogTitle>
            <DialogDescription>
              Möchten Sie den Provisionssatz für <strong>{deletingItem?.product_name}</strong> wirklich löschen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Abbrechen</Button>
            <Button variant="destructive" onClick={() => deletingItem && deleteMutation.mutate(deletingItem.id)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Löschen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
};

export default Provisionen;
