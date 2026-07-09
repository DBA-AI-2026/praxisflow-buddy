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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Euro, TrendingUp, Users, Calendar, Settings, Plus, Pencil, Trash2, Loader2,
  Percent, CalendarDays, CheckCircle2, Clock, Banknote, FileDown, ChevronDown, ChevronRight,
  Zap, Award, Gift, Info, RotateCcw,
} from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { PDFDocument, PDFFont, rgb, StandardFonts } from "pdf-lib";
import { downloadCsv } from "@/lib/csv";
import { payoutPurposeLabel, payoutPurposeLine } from "@/lib/commissionLabels";
import { isGoaeProduct } from "@/lib/multiLocation";
import {
  COLOR_BRAND_NAVY, COLOR_TEXT, COLOR_MUTED, COLOR_LINE, COLOR_LINE_LIGHT,
  SIZE_LABEL, SIZE_VALUE, SIZE_BODY, SIZE_FOOTER,
  PAGE_W, PAGE_H, MARGIN_LEFT, MARGIN_RIGHT,
  hexToRgb01,
} from "@/lib/pdfDesignTokens";
import foxLogoUrl from "@/assets/logo.png";

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
  payout_trigger: string | null;
  commission_role: string | null;
  commission_rule_version: string | null;
  contracts: {
    customer_name: string | null;
    praxis: string | null;
    hfx_customer_number: string | null;
    product_name: string | null;
  } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const typeLabels: Record<CommissionType, string> = {
  prozent: "% vom Umsatz",
  festbetrag: "Festbetrag Abschluss",
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

async function fetchLogoBytes(): Promise<ArrayBuffer | undefined> {
  try {
    const res = await fetch(foxLogoUrl);
    return await res.arrayBuffer();
  } catch {
    return undefined;
  }
}

async function generateCommissionPdf(
  partnerName: string,
  month: string,
  payouts: CommissionPayout[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Tokens → rgb()
  const rgbTok = (hex: string) => {
    const c = hexToRgb01(hex);
    return rgb(c.r, c.g, c.b);
  };
  const C_NAVY = rgbTok(COLOR_BRAND_NAVY);
  const C_TEXT = rgbTok(COLOR_TEXT);
  const C_MUTED = rgbTok(COLOR_MUTED);
  const C_LINE = rgbTok(COLOR_LINE);
  const C_LINE_LIGHT = rgbTok(COLOR_LINE_LIGHT);
  const C_ACCENT = rgb(0.95, 0.96, 0.98);

  // Layout
  const M = MARGIN_LEFT;
  const CW = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT;

  // Logo (best-effort)
  const logoBytes = await fetchLogoBytes();
  let embeddedLogo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (logoBytes) {
    try { embeddedLogo = await doc.embedPng(logoBytes); }
    catch { try { embeddedLogo = await doc.embedJpg(logoBytes); } catch { /* skip */ } }
  }

  // Column proportions (Produkt 30%, Zweck 20%, Modell 18%, Satz 10%, Betrag 12%, Status 10%)
  const COL_W = {
    produkt: CW * 0.30,
    zweck:   CW * 0.20,
    modell:  CW * 0.18,
    satz:    CW * 0.10,
    betrag:  CW * 0.12,
    status:  CW * 0.10,
  };
  const COL_X = {
    produkt: M,
    zweck:   M + COL_W.produkt,
    modell:  M + COL_W.produkt + COL_W.zweck,
    satz:    M + COL_W.produkt + COL_W.zweck + COL_W.modell,
    betrag:  M + COL_W.produkt + COL_W.zweck + COL_W.modell + COL_W.satz,
    status:  M + COL_W.produkt + COL_W.zweck + COL_W.modell + COL_W.satz + COL_W.betrag,
  };
  const PAD_X = 4;

  // Wrap text into lines. Hard-break single words that exceed maxW so no
  // text runs past the column boundary.
  const wrapText = (t: string, size: number, maxW: number, f: PDFFont): string[] => {
    if (!t) return [""];
    const hardBreak = (word: string): string[] => {
      if (f.widthOfTextAtSize(word, size) <= maxW) return [word];
      const parts: string[] = [];
      let buf = "";
      for (const ch of word) {
        const test = buf + ch;
        if (f.widthOfTextAtSize(test, size) > maxW && buf) {
          parts.push(buf);
          buf = ch;
        } else {
          buf = test;
        }
      }
      if (buf) parts.push(buf);
      return parts.length ? parts : [word];
    };
    const words = t.split(/\s+/).flatMap(hardBreak);
    const lines: string[] = [];
    let current = "";
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxW && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length ? lines : [""];
  };

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const drawText = (
    t: string, x: number, yy: number, size: number,
    f: PDFFont = font, color = C_TEXT, maxW?: number
  ) => {
    if (!t) return;
    page.drawText(t, { x, y: yy, size, font: f, color, maxWidth: maxW });
  };

  // Footer 1:1 aus generateInvoicePdf.ts
  const drawFooter = () => {
    const fY = 42;
    page.drawLine({ start: { x: M, y: fY + 24 }, end: { x: PAGE_W - MARGIN_RIGHT, y: fY + 24 }, thickness: 0.5, color: C_LINE });
    drawText("HFX Honorarfuchs – ein Geschäftsbereich von MCC Medical CareCapital GmbH  ·  Hohenzollernstr. 47, 47799 Krefeld", M, fY + 14, 6, font, C_MUTED);
    drawText("Geschäftsführung: Olaf Hagelkruys, Thilo Wiers-Keiser, Robbin Zielke  ·  Amtsgericht Krefeld, HRB 14709  ·  USt-Id-Nr: DE 227 420 712  ·  www.hfx-honorarfuchs.de", M, fY + 4, 6, font, C_MUTED);
  };

  const drawHeader = () => {
    // Logo top-right
    let logoW = 0;
    if (embeddedLogo) {
      const logoH = 40;
      logoW = (embeddedLogo.width / embeddedLogo.height) * logoH;
      const logoY = PAGE_H - 45 - logoH + 10;
      page.drawImage(embeddedLogo, {
        x: PAGE_W - MARGIN_RIGHT - logoW,
        y: logoY,
        width: logoW,
        height: logoH,
      });
    }
    // Title + subtitle (Text-Inhalt unverändert)
    let ty = PAGE_H - 60;
    const logoLeftEdge = embeddedLogo ? (PAGE_W - MARGIN_RIGHT - logoW) : (PAGE_W - MARGIN_RIGHT);
    const titleMaxW = logoLeftEdge - M - 12;
    drawText("Provisionsabrechnung", M, ty, 20, bold, C_NAVY, titleMaxW);
    ty -= 18;
    drawText("HFX Sales Portal – Honorarfuchs", M, ty, 10, font, C_MUTED);
    ty -= 12;
    // Thin separator
    page.drawLine({ start: { x: M, y: ty }, end: { x: PAGE_W - MARGIN_RIGHT, y: ty }, thickness: 0.5, color: C_LINE });
    return ty - 18;
  };

  const drawTableHeader = (yy: number) => {
    const h = 20;
    page.drawRectangle({ x: M, y: yy - h + 12, width: CW, height: h, color: C_ACCENT });
    page.drawLine({ start: { x: M, y: yy - h + 12 }, end: { x: M + CW, y: yy - h + 12 }, thickness: 0.8, color: C_NAVY });
    drawText("Produkt", COL_X.produkt + PAD_X, yy, SIZE_LABEL, bold, C_NAVY);
    drawText("Zweck",   COL_X.zweck + PAD_X,   yy, SIZE_LABEL, bold, C_NAVY);
    drawText("Modell",  COL_X.modell + PAD_X,  yy, SIZE_LABEL, bold, C_NAVY);
    drawText("Satz",    COL_X.satz + PAD_X,    yy, SIZE_LABEL, bold, C_NAVY);
    drawText("Betrag",  COL_X.betrag + PAD_X,  yy, SIZE_LABEL, bold, C_NAVY);
    drawText("Status",  COL_X.status + PAD_X,  yy, SIZE_LABEL, bold, C_NAVY);
    return yy - h - 4;
  };

  const newPage = () => {
    drawFooter();
    page = doc.addPage([PAGE_W, PAGE_H]);
    let ny = drawHeader();
    ny = drawTableHeader(ny);
    return ny;
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < 80) {
      y = newPage();
    }
  };

  // ── Page 1 ──
  y = drawHeader();

  // Info block
  drawText(`Vertriebler: ${partnerName}`, M, y, 12, bold, C_TEXT);
  y -= 16;
  drawText(`Abrechnungszeitraum: ${fmtMonth(month)}`, M, y, 10, font, C_MUTED);
  y -= 14;
  drawText(`Erstellt am: ${new Date().toLocaleDateString("de-DE")}`, M, y, 9, font, C_MUTED);
  y -= 22;

  y = drawTableHeader(y);

  // Rows
  const rowFontSize = SIZE_VALUE;
  const subFontSize = SIZE_LABEL;
  const lineSpacing = 11;
  const rowPadV = 6;

  let rowBg = false;
  for (const p of payouts) {
    const productLines = wrapText(p.product_name || "", rowFontSize, COL_W.produkt - 2 * PAD_X, font);
    const modelText = typeLabels[p.commission_type as CommissionType] ?? p.commission_type;
    const modelLines = wrapText(modelText, rowFontSize, COL_W.modell - 2 * PAD_X, font);
    const zweckLines = wrapText(payoutPurposeLabel(p.payout_trigger), rowFontSize, COL_W.zweck - 2 * PAD_X, font);
    const subLine = payoutPurposeLine(p.contracts);
    const subLines = subLine ? wrapText(subLine, subFontSize, COL_W.produkt + COL_W.zweck - 2 * PAD_X, font) : [];

    const maxTextLines = Math.max(productLines.length, modelLines.length, zweckLines.length, 1);
    const rowH = Math.max(20, maxTextLines * lineSpacing + subLines.length * (lineSpacing - 2) + 2 * rowPadV);

    ensureSpace(rowH + 4);

    if (rowBg) {
      page.drawRectangle({ x: M, y: y - rowH + lineSpacing, width: CW, height: rowH, color: rgb(0.97, 0.98, 0.99) });
    }

    // Produkt (top-aligned, wrapped)
    let ly = y - rowPadV + 2;
    productLines.forEach((ln, i) => drawText(ln, COL_X.produkt + PAD_X, ly - i * lineSpacing, rowFontSize, font, C_TEXT));
    // Zweck (top-aligned)
    zweckLines.forEach((ln, i) => drawText(ln, COL_X.zweck + PAD_X, ly - i * lineSpacing, rowFontSize, font, C_TEXT));
    // Modell
    modelLines.forEach((ln, i) => drawText(ln, COL_X.modell + PAD_X, ly - i * lineSpacing, rowFontSize, font, C_MUTED));
    // Satz / Betrag / Status – single-line, aligned with first text row
    drawText(formatValue(p.commission_type as CommissionType, p.commission_rate), COL_X.satz + PAD_X, ly, rowFontSize, font, C_TEXT);
    drawText(fmtEur(p.commission_amount), COL_X.betrag + PAD_X, ly, rowFontSize, bold, C_TEXT);
    drawText(STATUS_LABELS[p.status]?.label ?? p.status, COL_X.status + PAD_X, ly, rowFontSize, font, C_MUTED);

    // Sub-line HFX/Kunde
    if (subLines.length) {
      let sy = ly - maxTextLines * lineSpacing - 1;
      subLines.forEach((ln, i) => drawText(ln, COL_X.produkt + PAD_X, sy - i * (lineSpacing - 2), subFontSize, font, C_MUTED));
    }

    // Row separator
    const rowBottom = y - rowH + lineSpacing;
    page.drawLine({ start: { x: M, y: rowBottom }, end: { x: M + CW, y: rowBottom }, thickness: 0.4, color: C_LINE_LIGHT });

    y -= rowH;
    rowBg = !rowBg;
  }

  y -= 10;

  // Totals block (accent + Navy)
  ensureSpace(50);
  const total = payouts.reduce((s, p) => s + Number(p.commission_amount), 0);
  const boxH = 32;
  page.drawRectangle({ x: M, y: y - boxH + 12, width: CW, height: boxH, color: C_ACCENT });
  page.drawLine({ start: { x: M, y: y - boxH + 12 + boxH }, end: { x: M + CW, y: y - boxH + 12 + boxH }, thickness: 1.2, color: C_NAVY });
  page.drawLine({ start: { x: M, y: y - boxH + 12 }, end: { x: M + CW, y: y - boxH + 12 }, thickness: 1.2, color: C_NAVY });
  const totY = y - boxH / 2 + 6;
  drawText("Gesamtbetrag", COL_X.produkt + PAD_X, totY, 11, bold, C_NAVY);
  drawText(fmtEur(total), COL_X.betrag + PAD_X, totY, 12, bold, C_NAVY);
  y -= boxH + 12;

  // Info line
  ensureSpace(20);
  drawText("Diese Abrechnung wurde automatisch vom HFX Sales Portal generiert.", M, y, SIZE_BODY - 1, font, C_MUTED);

  drawFooter();
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
  const [revokingGroup, setRevokingGroup] = useState<string | null>(null);
  const [resettingGroup, setResettingGroup] = useState<string | null>(null);
  const [resetConfirm, setResetConfirm] = useState<{ month: string; partnerId: string; groupKey: string } | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [csvMonth, setCsvMonth] = useState<string>("all");

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
        .select("*, contracts:contract_id(customer_name, praxis, hfx_customer_number, product_name)")
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CommissionPayout[];
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

      // ── FiBu: tipster_commission_released event (additive, non-blocking) ──
      try {
        const periodMonth = new Date().toISOString().slice(0, 7);
        const { error: fibuErr } = await supabase.from("fibu_events" as any).insert({
          event_type: "tipster_commission_released",
          source_module: "commission_payouts",
          source_reference_id: payout.id,
          contract_id: milestone.contract_id ?? null,
          beneficiary_id: milestone.tippgeber_id ?? null,
          beneficiary_type: "tippgeber",
          product_name: milestone.contracts?.product_name || "HFX GOÄ",
          commission_type: "festbetrag",
          commission_amount: 200,
          commission_rate: null,
          commission_base_amount: milestone.cumulative_revenue ?? null,
          commission_rule_version: "TIPPGEBER-MILESTONE-200-v1",
          amount_net: 200,
          tax_amount: 0,
          amount_gross: 200,
          currency: "EUR",
          status: "draft",
          export_status: "open",
          period_start: `${periodMonth}-01`,
          period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10),
          occurred_at: new Date().toISOString(),
          description: `Tippgeber-Einmalprämie (Meilenstein 500 €) – ${milestone.tippgeber_profile?.full_name || "Tippgeber"} – ${milestone.contracts?.product_name || "HFX GOÄ"}${milestone.contracts?.hfx_customer_number ? ` (${milestone.contracts.hfx_customer_number})` : ""}`,
          created_by: user?.id ?? null,
          metadata: {
            payout_id: payout.id,
            tippgeber_id: milestone.tippgeber_id,
            contract_id: milestone.contract_id,
            hfx_customer_number: milestone.contracts?.hfx_customer_number ?? null,
            cumulative_revenue: milestone.cumulative_revenue,
            payout_trigger: "tippgeber_milestone",
          },
        });
        if (fibuErr && (fibuErr as any).code !== "23505") {
          console.error("[Provisionen] fibu_events tipster_commission_released failed:", fibuErr.message);
        }
      } catch (fibuEx) {
        console.error("[Provisionen] fibu_events tipster_commission_released exception:", String(fibuEx));
      }

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

  const resetGroupToPending = async (month: string, partnerId: string, groupKey: string) => {
    if (!isAdmin) return;
    const groupRows = payouts.filter(p => p.period_month === month && p.sales_partner_id === partnerId);
    const ids = groupRows.filter(p => p.status === "approved" || p.status === "paid").map(p => p.id);
    if (ids.length === 0) { toast({ title: "Nichts zurückzusetzen" }); return; }
    setResettingGroup(groupKey);
    try {
      const { error } = await supabase
        .from("commission_payouts")
        .update({ status: "pending", approved_by: null, approved_at: null, paid_at: null })
        .in("id", ids);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["commission-payouts"] });
      toast({ title: "Status zurückgesetzt", description: `${ids.length} Provisionen wieder auf ausstehend.` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setResettingGroup(null);
      setResetConfirm(null);
    }
  };

  const handleResetClick = (month: string, partnerId: string, groupKey: string) => {
    const groupRows = payouts.filter(p => p.period_month === month && p.sales_partner_id === partnerId);
    if (groupRows.some(p => p.status === "paid")) {
      setResetConfirm({ month, partnerId, groupKey });
    } else {
      resetGroupToPending(month, partnerId, groupKey);
    }
  };

  const revokeApprovalGroup = async (month: string, partnerId: string, groupKey: string) => {
    if (!isAdmin) return;
    // Client-Guard: keine paid-Zeile in der Gruppe
    const groupRows = payouts.filter(p => p.period_month === month && p.sales_partner_id === partnerId);
    if (groupRows.some(p => p.status === "paid")) {
      toast({ title: "Nicht möglich", description: "Gruppe enthält bereits ausgezahlte Positionen.", variant: "destructive" });
      return;
    }
    setRevokingGroup(groupKey);
    try {
      const ids = groupRows.filter(p => p.status === "approved").map(p => p.id);
      if (ids.length === 0) { toast({ title: "Keine freigegebenen Einträge" }); return; }
      const { error } = await supabase
        .from("commission_payouts")
        .update({ status: "pending", approved_by: null, approved_at: null })
        .in("id", ids);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["commission-payouts"] });
      toast({ title: "Freigabe zurückgenommen", description: `${ids.length} Provisionen wieder auf ausstehend.` });
    } catch (e: any) {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    } finally {
      setRevokingGroup(null);
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

  // Verfügbare Monate für den CSV-Filter (aus freigegebenen Payouts).
  const csvAvailableMonths = useMemo(() => {
    const set = new Set<string>();
    for (const p of payouts) if (p.status === "approved") set.add(p.period_month);
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [payouts]);

  const exportApprovedCsv = () => {
    if (!canEditCommissions) return;
    const filtered = payouts.filter(
      (p) => p.status === "approved" && (csvMonth === "all" || p.period_month === csvMonth)
    );
    if (filtered.length === 0) {
      toast({
        title: "Keine freigegebenen Provisionen im gewählten Zeitraum",
        variant: "destructive",
      });
      return;
    }
    const headers = [
      "Monat",
      "Vertriebler",
      "HFX-Nr",
      "Kunde",
      "Produkt",
      "Zweck",
      "Rolle",
      "Provisionsmodell",
      "Satz",
      "Betrag",
      "Regelversion",
      "Freigegeben am",
      "Status",
    ];
    const rows: string[][] = [headers];
    for (const p of filtered) {
      const kunde = (p.contracts?.customer_name ?? p.contracts?.praxis ?? "") as string;
      rows.push([
        fmtMonth(p.period_month),
        p.sales_partner_name ?? "",
        p.contracts?.hfx_customer_number ?? "",
        kunde,
        p.product_name ?? "",
        payoutPurposeLabel(p.payout_trigger),
        p.commission_role ?? "",
        typeLabels[p.commission_type as CommissionType] ?? p.commission_type,
        formatValue(p.commission_type as CommissionType, Number(p.commission_rate)),
        Number(p.commission_amount).toFixed(2).replace(".", ","),
        p.commission_rule_version ?? "",
        p.approved_at ? new Date(p.approved_at).toLocaleDateString("de-DE") : "",
        STATUS_LABELS[p.status]?.label ?? p.status,
      ]);
    }
    const label = csvMonth === "all" ? "alle" : csvMonth;
    downloadCsv(rows, `HFX_Provisionen_freigegeben_${label}.csv`);
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
            {isAdmin && <CommissionTestrunPanel />}
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-4">
                <div>
                  <CardTitle>Provisionsauszahlungen</CardTitle>
                  <CardDescription>Automatisch generierte Provisionen aus Vertragsabrechnungen, gruppiert nach Monat und Vertriebler</CardDescription>
                </div>
                {canEditCommissions && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Select value={csvMonth} onValueChange={setCsvMonth}>
                      <SelectTrigger className="h-9 w-[160px] text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Alle Monate</SelectItem>
                        {csvAvailableMonths.map((m) => (
                          <SelectItem key={m} value={m}>{fmtMonth(m)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={exportApprovedCsv}
                      title="CSV-Export aller freigegebenen Provisionen (für interne Abteilung)"
                    >
                      <FileDown className="h-4 w-4 mr-1" />
                      CSV-Export freigegeben
                    </Button>
                  </div>
                )}
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
                          {(anyApproved || group.items.some(p => p.status === "paid")) && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-amber-700 border-amber-300 hover:bg-amber-50 h-7 text-xs"
                              disabled={resettingGroup === key}
                              onClick={() => handleResetClick(group.month, group.partnerId, key)}
                            >
                              {resettingGroup === key ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                              Status zurücksetzen
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
                                    <TableHead>Zweck</TableHead>
                                    <TableHead>Modell</TableHead>
                                    <TableHead>Satz</TableHead>
                                    <TableHead className="text-right">Betrag</TableHead>
                                    <TableHead>Status</TableHead>
                                    {group.items.some(p => p.paid_at) && <TableHead>Ausgezahlt am</TableHead>}
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {group.items.map((p) => {
                                    const purposeSub = payoutPurposeLine(p.contracts);
                                    return (
                                    <TableRow key={p.id}>
                                      <TableCell className="font-medium">{p.product_name}</TableCell>
                                      <TableCell className="text-sm">
                                        <div className="font-medium text-foreground">{payoutPurposeLabel(p.payout_trigger)}</div>
                                        {purposeSub && (
                                          <div className="text-xs text-muted-foreground">{purposeSub}</div>
                                        )}
                                      </TableCell>
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
                                    );
                                  })}
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

      <AlertDialog open={!!resetConfirm} onOpenChange={(o) => !o && setResetConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Status zurücksetzen – Bestätigung erforderlich</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Gruppe enthält bereits als AUSGEZAHLT markierte Provisionen.
              Nur zurücksetzen, wenn dies ein Korrektur-/Fehlklick ist und die
              Beträge NICHT tatsächlich überwiesen wurden. Fortfahren?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (resetConfirm) {
                  resetGroupToPending(resetConfirm.month, resetConfirm.partnerId, resetConfirm.groupKey);
                }
              }}
            >
              Bestätigen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MainLayout>
  );
};

// ─── Admin: Commission Motor Testrun Panel ───────────────────────────────────

const TESTRUN_STORAGE_KEY = "commission-testrun:last";

interface TestrunState {
  contract_id: string;
  hfx_customer_number: string;
  sales_partner_name?: string;
  payouts?: Array<{ commission_amount: number; commission_role: string; payout_trigger: string; commission_rule_version: string }>;
}

function CommissionTestrunPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [last, setLast] = useState<TestrunState | null>(() => {
    try {
      const raw = sessionStorage.getItem(TESTRUN_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  });
  const [seeding, setSeeding] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const saveState = (s: TestrunState | null) => {
    setLast(s);
    if (s) sessionStorage.setItem(TESTRUN_STORAGE_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(TESTRUN_STORAGE_KEY);
  };

  const runSeed = async () => {
    setSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke("commission-testrun", {
        body: { mode: "seed_and_run" },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Unbekannter Fehler");
      const state: TestrunState = {
        contract_id: data.contract_id,
        hfx_customer_number: data.hfx_customer_number,
        sales_partner_name: data.sales_partner_name,
        payouts: data.payouts,
      };
      saveState(state);
      queryClient.invalidateQueries({ queryKey: ["commission-payouts"] });
      const n = (data.payouts ?? []).length;
      toast({
        title: "Testlauf erfolgreich",
        description: `${n} Payout(s) für Fixture ${data.hfx_customer_number} erzeugt.`,
      });
    } catch (e: any) {
      toast({ title: "Testlauf fehlgeschlagen", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSeeding(false);
    }
  };

  const runCleanup = async () => {
    if (!last) return;
    setCleaning(true);
    try {
      const { data, error } = await supabase.functions.invoke("commission-testrun", {
        body: {
          mode: "cleanup",
          hfx_customer_number: last.hfx_customer_number,
          contract_id: last.contract_id,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Unbekannter Fehler");
      saveState(null);
      queryClient.invalidateQueries({ queryKey: ["commission-payouts"] });
      const d = data.deleted ?? {};
      toast({
        title: "Testrun aufgeräumt",
        description: `Gelöscht: ${d.commission_payouts ?? 0} Payouts, ${d.fibu_events ?? 0} FiBu-Events, ${d.invoices ?? 0} Rechnung(en), ${d.contracts ?? 0} Vertrag/Verträge.`,
      });
    } catch (e: any) {
      toast({ title: "Cleanup fehlgeschlagen", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Card className="mb-4 border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4 text-amber-600" />
          Provisionsmotor · Testlauf (Admin)
        </CardTitle>
        <CardDescription>
          Erzeugt eine Wegwerf-Fixture (Vertrag <code>entwurf</code>, HFX GOÄ, {" "}
          <code>Digital-Eigen-Vertrieb</code>) mit Marker <code>TEST-HARNESS-&lt;ts&gt;</code>, ruft den echten Motor und schreibt einen sichtbaren Payout.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={runSeed} disabled={seeding || cleaning} size="sm">
            {seeding && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Testlauf starten
          </Button>
          <Button
            onClick={runCleanup}
            disabled={!last || seeding || cleaning}
            variant="outline"
            size="sm"
          >
            {cleaning && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Testrun aufräumen
          </Button>
          {last && (
            <div className="text-xs text-muted-foreground">
              Aktive Fixture: <code>{last.hfx_customer_number}</code>
              {last.payouts && last.payouts.length > 0 && (
                <> · {last.payouts.length} Payout(s)</>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default Provisionen;

