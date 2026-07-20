import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb } from "npm:pdf-lib@1.17.1";
import { isContractPromoActive } from "../_shared/promoStatus.ts";
import { embedExo2 } from "../_shared/pdfFontLoader.ts";
import {
  COLOR_BRAND_NAVY,
  COLOR_TEXT,
  COLOR_MUTED,
  COLOR_LINE,
  COLOR_LINE_LIGHT,
  COLOR_SECTION_TITLE,
  COLOR_ACCENT_PROMO,
  SIZE_HEADING,
  SIZE_SECTION_TITLE,
  SIZE_LABEL,
  SIZE_VALUE,
  SIZE_BODY,
  SIZE_FOOTER,
  SECTION_GAP_BEFORE,
  SECTION_GAP_AFTER,
  SECTION_LINE_THICKNESS,
  ROW_HEIGHT,
  ROW_LINE_THICKNESS,
  LABEL_COL_WIDTH_RATIO,
  hexToRgb01,
} from "../_shared/pdfDesignTokens.ts";
import { resolveAgbForCandidates } from "../_shared/agbResolver.ts";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const APP_URL = "https://praxisflow-buddy.lovable.app";

// ---------- PDF generation (mirrors client generateContractPdf, invoice-style) ----------

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "–";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value?: number | null): string {
  if (value == null) return "0,00 €";
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

type ProductWithAgb = {
  name: string;
  agb_pdf_path: string | null;
};

const normalizeProductKey = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

function findBestProductMatch(products: ProductWithAgb[], candidates: Array<string | null | undefined>) {
  const preparedCandidates = candidates
    .flatMap((candidate) => String(candidate || "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  if (preparedCandidates.length === 0) return null;

  const exactMatch = products.find((product) =>
    preparedCandidates.some((candidate) => candidate.toLowerCase() === product.name.toLowerCase())
  );
  if (exactMatch) return exactMatch;

  return products.find((product) => {
    const normalizedProduct = normalizeProductKey(product.name);
    return preparedCandidates.some((candidate) => {
      const normalizedCandidate = normalizeProductKey(candidate);
      return (
        normalizedCandidate === normalizedProduct ||
        normalizedCandidate.includes(normalizedProduct) ||
        normalizedProduct.includes(normalizedCandidate)
      );
    });
  }) ?? null;
}

type AddonModuleLike = { name: string; monthly_price: number | null };
type PromoProductFull = {
  name: string;
  promo_price: number | null;
  promo_end_date: string | null;
  promo_price_label: string | null;
  promo_base_fee_end_date: string | null;
  monthly_price: number | null;
  price_per_unit: number | null;
  price_per_unit_label: string | null;
};

type BuildExtras = {
  addonModules?: AddonModuleLike[];
  promoProduct?: PromoProductFull | null;
};

/**
 * IBAN-Maskierung mit drei Modi:
 *  - "compact" (default): ••••XXXX (Kunden-Mail, eng dargestellt)
 *  - "partial":           DE21 •••• •••• •••• XXXX (UI-Vorschau, mehr Info für Vertriebler)
 *  - "full":              DE21 1234 5678 9012 3456 (nur explizit anfordern; niemand setzt das per Default)
 *
 * ⚠ SYNCHRONIZE: Diese Funktion existiert wortgleich in:
 *   - src/lib/generateContractPdf.ts (UI)
 *   - supabase/functions/send-contract-confirmation/index.ts (Edge)
 * Änderungen IMMER in beiden anpassen.
 */
function maskIban(
  iban: string | null | undefined,
  mode: "compact" | "partial" | "full" = "compact",
): string {
  if (!iban) return "–";
  const clean = String(iban).replace(/\s+/g, "").toUpperCase();
  if (clean.length < 8) return "–";
  if (mode === "full") return clean.match(/.{1,4}/g)?.join(" ") ?? clean;
  if (mode === "partial") {
    const head = clean.slice(0, 4);
    const tail = clean.slice(-4);
    const middleQuartetCount = Math.max(0, Math.ceil((clean.length - 8) / 4));
    const middle = Array(middleQuartetCount).fill("••••").join(" ");
    return `${head} ${middle} ${tail}`.replace(/\s+/g, " ").trim();
  }
  return `••••${clean.slice(-4)}`;
}

/**
 * ⚠ SYNCHRONIZE MIT src/lib/generateContractPdf.ts
 *
 * Diese Funktion rendert die Vertragsbestätigungs-PDF, die nach Stripe-Zahlung
 * per Mail an Kunden gesendet wird. Die UI-Vorschau (gleiche Optik, andere
 * IBAN-Maskierung, zusätzlich UNTERSCHRIFT) lebt in der oben genannten Datei.
 *
 * Änderungen an Helfer-Funktionen (text, rightText, fieldRow, sectionHeader,
 * drawPriceRow, ensureSpace, drawFooter, maskIban) IMMER in beiden Dateien
 * anpassen. Drift wird durch das Skript scripts/diff-contract-pdf.ts erkannt.
 */
async function buildContractPdf(
  contract: Record<string, unknown>,
  logoBytes?: ArrayBuffer,
  extras: BuildExtras = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();

  const fonts = await embedExo2(doc, APP_URL);
  const font = fonts.regular;
  const fontMedium = fonts.medium;
  const fontBold = fonts.bold;

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const ML = 56;
  const MR = 56;
  const CW = PAGE_W - ML - MR;
  const mmToPt = 2.8346;

  const rgbHex = (hex: string) => {
    const c = hexToRgb01(hex);
    return rgb(c.r, c.g, c.b);
  };
  const C_NAVY = rgbHex(COLOR_BRAND_NAVY);
  const C_TEXT = rgbHex(COLOR_TEXT);
  const C_MUTED = rgbHex(COLOR_MUTED);
  const C_LINE = rgbHex(COLOR_LINE);
  const C_LINE_LIGHT = rgbHex(COLOR_LINE_LIGHT);
  const C_SECTION_TITLE = rgbHex(COLOR_SECTION_TITLE);
  const C_ACCENT_PROMO = rgbHex(COLOR_ACCENT_PROMO);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const text = (t: string, x: number, yy: number, size: number, f = font, color = C_TEXT, maxW?: number) => {
    if (!t) return;
    page.drawText(t, { x, y: yy, size, font: f, color, maxWidth: maxW });
  };

  const rightText = (t: string, rightEdge: number, yy: number, size: number, f = font, color = C_TEXT) => {
    const w = f.widthOfTextAtSize(t, size);
    text(t, rightEdge - w, yy, size, f, color);
  };

  const ensureSpace = (needed = 80) => {
    if (y < 60 + needed) {
      drawFooter();
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 50;
    }
  };

  const drawFooter = () => {
    const fY = 36;
    page.drawLine({ start: { x: ML, y: fY + 20 }, end: { x: PAGE_W - MR, y: fY + 20 }, thickness: 0.5, color: C_LINE_LIGHT });
    const footerLines = [
      "MCC Medical CareCapital GmbH · Hohenzollernstr. 47 · 47799 Krefeld",
      "Geschäftsführung: Olaf Hagelkruys, Thilo Wiers-Keiser, Robbin Zielke · Amtsgericht Krefeld, HRB 14709",
      "USt-IdNr. DE 227 420 712 · www.hfx-honorarfuchs.de",
    ];
    footerLines.forEach((line, i) => {
      const w = font.widthOfTextAtSize(line, 6);
      text(line, (PAGE_W - w) / 2, fY + 10 - i * 9, 6, font, C_MUTED);
    });
  };

  // Logo
  const headerTop = PAGE_H - 36;
  if (logoBytes) {
    try {
      let img;
      try { img = await doc.embedPng(logoBytes); } catch { img = await doc.embedJpg(logoBytes); }
      const logoH = 40;
      const logoW = (img.width / img.height) * logoH;
      page.drawImage(img, { x: PAGE_W - MR - logoW, y: headerTop - logoH + 10, width: logoW, height: logoH });
    } catch { /* skip */ }
  }

  // Sender line
  y = PAGE_H - 48 * mmToPt;
  text("HFX Honorarfuchs · Hohenzollernstr. 47 · 47799 Krefeld", ML, y, 7, font, C_MUTED);
  y -= 4;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + 220, y }, thickness: 0.3, color: C_LINE_LIGHT });
  y -= 14;

  // Two-column header
  const rightColX = ML + CW * 0.50;
  const rightColW = CW * 0.50;
  const boxTop = y;

  // Recipient
  const recipientLines: string[] = [];
  if (contract.praxis) recipientLines.push(String(contract.praxis));
  const fullName = [contract.vorname, contract.nachname].filter(Boolean).join(" ");
  if (fullName) recipientLines.push(fullName);
  if (contract.adresse) recipientLines.push(String(contract.adresse));
  const recipPlzOrt = `${contract.plz ?? ""} ${contract.ort ?? ""}`.trim();
  if (recipPlzOrt) recipientLines.push(recipPlzOrt);
  if (contract.email) recipientLines.push(String(contract.email));

  let ry = boxTop - 4;
  recipientLines.forEach((line, i) => {
    text(line, ML, ry, i === 0 ? 10 : 8.5, i === 0 ? fontBold : font, C_TEXT);
    ry -= 13;
  });

  // Metadata
  const durationMonths = Number(contract.duration_months ?? 0);
  const endDate = String(contract.end_date || "");
  const statusLabels: Record<string, string> = { entwurf: "ENTWURF", aktiv: "AKTIV", eingegangen: "EINGEGANGEN", gekuendigt: "GEKÜNDIGT", beendet: "BEENDET" };
  const intervalLabels: Record<string, string> = { monatlich: "Monatlich", quartalsweise: "Quartalsweise", jaehrlich: "Jährlich" };
  const st = String(contract.status || "entwurf");

  const metaRows: [string, string][] = [
    ["Kundennummer", String(contract.hfx_customer_number || "–")],
    ["Vertragsbeginn", formatDate(contract.start_date as string)],
    ["Vertragsende", endDate === "2099-12-31" ? "Unbefristet" : formatDate(endDate)],
    ["Laufzeit", durationMonths === 0 ? "Unbefristet" : `${durationMonths} Monate`],
    ["Zahlungsintervall", intervalLabels[String(contract.payment_interval || "monatlich")] || "Monatlich"],
    ["Status", statusLabels[st] || st.toUpperCase()],
  ];

  const recipBoxH = Math.max(recipientLines.length * 13 + 10, metaRows.length * 16 + 10);
  const metaRowH = recipBoxH / metaRows.length;

  metaRows.forEach((row, i) => {
    const rowY = boxTop - i * metaRowH;
    if (i > 0) page.drawLine({ start: { x: rightColX, y: rowY }, end: { x: rightColX + rightColW, y: rowY }, thickness: 0.4, color: C_LINE_LIGHT });
    const textY = rowY - metaRowH / 2 - 3;
    text(row[0], rightColX + 6, textY, 7.5, fontBold, C_TEXT);
    text(row[1], rightColX + rightColW * 0.48 + 6, textY, 8, font, C_TEXT);
  });

  y = boxTop - recipBoxH - 24 - 20 * mmToPt;

  // Title
  text("VERTRAGSÜBERSICHT", ML, y, SIZE_HEADING, fontBold, C_TEXT);
  y -= 28;

  // Section header helper (C.3b SaaS-Stil: dünne Linie, kein Band)
  const sectionHeader = (title: string, titleColor = C_SECTION_TITLE) => {
    ensureSpace(40);
    y -= SECTION_GAP_BEFORE + SIZE_SECTION_TITLE;
    text(title, ML, y, SIZE_SECTION_TITLE, fontMedium, titleColor);
    y -= 4;
    page.drawLine({
      start: { x: ML, y },
      end: { x: PAGE_W - MR, y },
      thickness: SECTION_LINE_THICKNESS,
      color: C_LINE,
    });
    y -= SECTION_GAP_AFTER;
  };

  const fieldRow = (label: string, value: string, label2?: string, value2?: string) => {
    ensureSpace(ROW_HEIGHT + 4);
    y -= ROW_HEIGHT;
    const baselineY = y + 7;
    const labelColW = CW * LABEL_COL_WIDTH_RATIO;
    if (label2 !== undefined) {
      const halfW = CW / 2;
      const labelColWHalf = halfW * LABEL_COL_WIDTH_RATIO;
      text(label, ML, baselineY, SIZE_LABEL, fontMedium, C_MUTED);
      text(value || "–", ML + labelColWHalf + 8, baselineY, SIZE_VALUE, font, C_TEXT, halfW - labelColWHalf - 8);
      text(label2, ML + halfW, baselineY, SIZE_LABEL, fontMedium, C_MUTED);
      text(value2 || "–", ML + halfW + labelColWHalf + 8, baselineY, SIZE_VALUE, font, C_TEXT, halfW - labelColWHalf - 8);
    } else {
      text(label, ML, baselineY, SIZE_LABEL, fontMedium, C_MUTED);
      text(value || "–", ML + labelColW + 12, baselineY, SIZE_VALUE, font, C_TEXT, CW - labelColW - 12);
    }
    page.drawLine({
      start: { x: ML, y },
      end: { x: PAGE_W - MR, y },
      thickness: ROW_LINE_THICKNESS,
      color: C_LINE_LIGHT,
    });
  };

  // Vertragsparteien
  sectionHeader("VERTRAGSPARTEIEN");
  fieldRow("Praxis", String(contract.praxis || "–"));
  fieldRow("Fachrichtung", String(contract.fachrichtung || "–"));
  fieldRow("Vorname", String(contract.vorname || "–"));
  fieldRow("Nachname", String(contract.nachname || "–"));
  const plzOrt = `${contract.plz ?? ""} ${contract.ort ?? ""}`.trim();
  fieldRow("Adresse", String(contract.adresse || "–"));
  fieldRow("PLZ / Ort", plzOrt || "–");
  fieldRow("Telefon", String(contract.telefon || "–"));
  fieldRow("E-Mail", String(contract.email || "–"));
  fieldRow("MP-Nummer", String(contract.mp_nr || "–"));
  fieldRow("Vertriebspartner", String(contract.sales_partner_name || "–"));

  // Produkte
  sectionHeader("PRODUKTE & LIZENZEN");
  fieldRow("Produkt", String(contract.product_name || "–"));
  fieldRow("Anzahl Lizenzen", String(contract.license_count ?? 1));

  // Zusatzmodule
  sectionHeader("ZUSATZMODULE");
  const addons = extras.addonModules ?? [];
  if (addons.length === 0) {
    ensureSpace(20);
    text("Keine Zusatzmodule gebucht", ML + 8, y, 9, font, C_MUTED);
    y -= 16;
  } else {
    let addonsTotal = 0;
    for (const m of addons) {
      ensureSpace(18);
      const price = Number(m.monthly_price) || 0;
      addonsTotal += price;
      text(`• ${m.name}`, ML + 8, y, 9, font, C_TEXT, CW - 120);
      rightText(`${formatCurrency(price)}/Mon.`, PAGE_W - MR - 8, y, 9, font, C_TEXT);
      y -= 14;
      page.drawLine({ start: { x: ML, y: y + 9 }, end: { x: PAGE_W - MR, y: y + 9 }, thickness: 0.3, color: C_LINE_LIGHT });
    }
    ensureSpace(20);
    y -= 4;
    text("Zusatzmodule gesamt", ML + 8, y, 9, fontBold, C_NAVY);
    rightText(`${formatCurrency(addonsTotal)}/Mon.`, PAGE_W - MR - 8, y, 9, fontBold, C_NAVY);
    y -= 14;
  }
  y -= 6;


  // Laufzeit
  sectionHeader("LAUFZEIT");
  const endDateLabel = endDate === "2099-12-31" ? "Unbefristet" : formatDate(endDate);
  const laufzeitLabel = durationMonths === 0 ? "Unbefristet" : `${durationMonths} Monate`;
  fieldRow("Vertragsbeginn", formatDate(contract.start_date as string));
  fieldRow("Vertragsende", endDateLabel);
  fieldRow("Laufzeit", laufzeitLabel);

  // Preisübersicht
  sectionHeader("PREISÜBERSICHT");

  const TABLE_RIGHT = PAGE_W - MR;
  const priceRowH = 24;

  const drawPriceRow = (label: string, value: string, isBold = false, topBorder = false) => {
    ensureSpace(priceRowH + 4);
    const rowTop = y + 10;
    const rowBottom = rowTop - priceRowH;
    if (topBorder) page.drawLine({ start: { x: ML, y: rowTop }, end: { x: TABLE_RIGHT, y: rowTop }, thickness: 0.8, color: C_LINE });
    page.drawLine({ start: { x: ML, y: rowBottom }, end: { x: TABLE_RIGHT, y: rowBottom }, thickness: 0.4, color: C_LINE_LIGHT });
    page.drawLine({ start: { x: ML, y: rowTop }, end: { x: ML, y: rowBottom }, thickness: 0.4, color: C_LINE_LIGHT });
    page.drawLine({ start: { x: TABLE_RIGHT, y: rowTop }, end: { x: TABLE_RIGHT, y: rowBottom }, thickness: 0.4, color: C_LINE_LIGHT });
    const textY = rowTop - priceRowH / 2 - 3;
    text(label, ML + 8, textY, 8.5, isBold ? fontBold : font, isBold ? C_NAVY : C_TEXT);
    rightText(value, TABLE_RIGHT - 8, textY, isBold ? 10 : 8.5, isBold ? fontBold : font, isBold ? C_NAVY : C_TEXT);
    y -= priceRowH;
  };

  drawPriceRow("Monatspreis (netto)", formatCurrency(Number(contract.monthly_price) || 0), false, true);
  drawPriceRow("Einmalgebühr", formatCurrency(Number(contract.one_time_fee) || 0));
  if (Number(contract.discount_percent) > 0) {
    drawPriceRow("Rabatt", `${contract.discount_percent}%`);
  }

  // Gesamtbetrag — kein Hintergrund, kräftigere Top-Linie als Akzent
  ensureSpace(30);
  const grossRowTop = y + 10;
  const grossRowH = 28;
  const grossRowBottom = grossRowTop - grossRowH;
  page.drawLine({ start: { x: ML, y: grossRowTop }, end: { x: TABLE_RIGHT, y: grossRowTop }, thickness: 1.2, color: C_NAVY });
  page.drawLine({ start: { x: ML, y: grossRowBottom }, end: { x: TABLE_RIGHT, y: grossRowBottom }, thickness: 0.4, color: C_LINE_LIGHT });
  const grossTextY = grossRowTop - grossRowH / 2 - 2;
  text("Monatlicher Gesamtbetrag", ML, grossTextY, 11, fontBold, C_NAVY);
  rightText(formatCurrency(Number(contract.monthly_price) || 0), TABLE_RIGHT, grossTextY, 12, fontBold, C_NAVY);
  y -= grossRowH + 4;

  // Promo-Block (nur bei aktiver Produkt-Promo, SSOT: _shared/promoStatus.ts)
  const promoProduct = extras.promoProduct ?? null;
  const promoActive = isContractPromoActive(
    { qodia_unit_price: Number(contract.qodia_unit_price ?? 0) },
    promoProduct,
  );
  if (promoActive && promoProduct) {
    sectionHeader("AKTIONSPREIS", C_ACCENT_PROMO);
    ensureSpace(20);
    text(promoProduct.name, ML, y, SIZE_BODY + 1, fontBold, C_ACCENT_PROMO);
    y -= 16;
    const unitLabel = promoProduct.price_per_unit_label || "Einheit";
    const promoPriceStr = `${formatCurrency(Number(promoProduct.promo_price) || 0)}/${unitLabel} dauerhaft`;
    fieldRow("Aktionspreis", promoPriceStr);
    if (promoProduct.promo_base_fee_end_date) {
      fieldRow("Keine Grundgebühr bis", formatDate(promoProduct.promo_base_fee_end_date));
    }
    const regBase = `${formatCurrency(Number(promoProduct.monthly_price) || 0)}/Mon. Grundgebühr`;
    const regUnit = promoProduct.price_per_unit != null
      ? `${formatCurrency(Number(promoProduct.price_per_unit) || 0)}/${unitLabel}`
      : "–";
    fieldRow("Regulär nach Aktionsende", regBase);
    fieldRow("Stückpreis regulär", regUnit);
    if (promoProduct.promo_end_date) {
      fieldRow("Aktion gültig bis (Abschlussdatum)", formatDate(promoProduct.promo_end_date));
    }
  }

  // SEPA — Vorrang-Regel (Variante β, D-vor):
  //   1) iban_masked (Stripe-Webhook-Maske) → 1:1 ausgeben, NICHT erneut maskieren
  //   2) iban (manuell, volle IBAN)         → durch maskIban() (Edge-Default "compact")
  //   3) stripe_customer_id ohne Mandat-Daten → Hinweis "liegt beim PSP"
  //   4) gar nichts                         → "ausstehend" oder "nicht hinterlegt"
  sectionHeader("SEPA-LASTSCHRIFTEINZUG");
  const ibanMasked = String(contract.iban_masked || "").trim();
  const ibanRaw = String(contract.iban || "").trim();
  const stripeCustomerId = String(contract.stripe_customer_id || "").trim();
  const contractStatus = String(contract.status || "").toLowerCase();
  if (ibanMasked.length > 0) {
    fieldRow("Kontoinhaber", String(contract.kontoinhaber || "–"));
    fieldRow("IBAN (maskiert)", ibanMasked);
  } else if (ibanRaw.length > 0) {
    fieldRow("Kontoinhaber", String(contract.kontoinhaber || "–"));
    fieldRow("IBAN (maskiert)", maskIban(ibanRaw));
  } else if (stripeCustomerId.length > 0) {
    ensureSpace(20);
    text("SEPA-Mandat aktiv hinterlegt — Details liegen beim Zahlungsdienstleister", ML, y, SIZE_BODY, font, C_MUTED);
    y -= 16;
  } else {
    ensureSpace(20);
    const pendingStatus = contractStatus === "entwurf" || contractStatus === "eingegangen";
    const hint = pendingStatus
      ? "SEPA-Mandat noch ausstehend"
      : "SEPA-Mandat liegt nicht im System hinterlegt";
    text(hint, ML, y, SIZE_BODY, font, C_MUTED);
    y -= 16;
  }

  // Closing
  ensureSpace(60);
  y -= 28;
  text("Mit freundlichen Grüßen", ML, y, SIZE_BODY, font, C_TEXT);
  y -= 18;
  text("HFX Honorarfuchs", ML, y, SIZE_BODY + 1, fontBold, C_NAVY);


  drawFooter();

  return doc.save();
}

// ---------- Helpers ----------

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ---------- Main handler ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Allow service-role calls (e.g. from stripe-webhook) to bypass user auth
  const bearer = authHeader.slice("Bearer ".length).trim();
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const isServiceRole = bearer === serviceRoleKey;

  if (!isServiceRole) {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: userData, error: authError } = await supabase.auth.getUser();
    if (authError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const adminClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { contract_id, force } = await req.json();
    if (!contract_id) {
      return new Response(JSON.stringify({ error: "contract_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: contractError } = await adminClient
      .from("contracts")
      .select("*")
      .eq("id", contract_id)
      .single();

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: "Contract not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!contract.email) {
      return new Response(JSON.stringify({ error: "Contract has no email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency: skip if confirmation already sent (webhook retries / double-trigger guard)
    // Override with force=true for explicit manual resends from the UI.
    if ((contract as any).confirmation_email_sent_at && !force) {
      console.log(`[send-contract-confirmation] Skip — confirmation_email_sent_at already set for ${contract_id} (force=false)`);
      return new Response(
        JSON.stringify({
          success: true,
          skipped: true,
          reason: "already_sent",
          confirmation_email_sent_at: (contract as any).confirmation_email_sent_at,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- Generate contract summary PDF ---
    let logoBytes: ArrayBuffer | undefined;
    try {
      const logoRes = await fetch(`${APP_URL}/logo.png`);
      if (logoRes.ok) logoBytes = await logoRes.arrayBuffer();
    } catch { /* skip logo */ }

    // Addon-Modul-Preise (text[] → product_modules.monthly_price)
    let addonModules: AddonModuleLike[] = [];
    const addonNames = Array.isArray((contract as any).selected_addon_modules)
      ? ((contract as any).selected_addon_modules as string[]).filter(Boolean)
      : [];
    if (addonNames.length > 0) {
      const { data: modRows } = await adminClient
        .from("product_modules")
        .select("name, monthly_price")
        .in("name", addonNames);
      const byName = new Map((modRows ?? []).map((m: any) => [m.name, Number(m.monthly_price) || 0]));
      addonModules = addonNames.map((n) => ({ name: n, monthly_price: byName.get(n) ?? 0 }));
    }

    // Promo-Produkt: alle Promo-fähigen Produkte laden, dann via findBestProductMatch
    // gegen die Vertragsprodukte mappen. Helper liefert kein Match → kein Promo-Block.
    let promoProduct: PromoProductFull | null = null;
    try {
      const { data: promoCandidates } = await adminClient
        .from("products")
        .select("name, promo_price, promo_end_date, promo_price_label, promo_base_fee_end_date, monthly_price, price_per_unit, price_per_unit_label")
        .not("promo_price", "is", null)
        .not("promo_end_date", "is", null);
      const candidateNames = [
        (contract as any).product_name,
        ...(Array.isArray((contract as any).modules) ? (contract as any).modules : []),
      ];
      const matched = findBestProductMatch(
        (promoCandidates ?? []).map((p: any) => ({ name: p.name, agb_pdf_path: null })),
        candidateNames,
      );
      if (matched) {
        promoProduct = (promoCandidates ?? []).find((p: any) => p.name === matched.name) as PromoProductFull | null;
      }
    } catch (e) {
      console.log("[send-contract-confirmation] Promo lookup skipped:", String(e));
    }

    const pdfBytes = await buildContractPdf(contract as Record<string, unknown>, logoBytes, {
      addonModules,
      promoProduct,
    });
    const pdfBase64 = toBase64(pdfBytes);


    // --- Fetch product-specific AGB PDF (fallback to generic) ---
    // Konsolidiert auf gemeinsamen Resolver (Mini-Refactor A-lite → voll).
    // agbDownloadUrl wird weiter als Variable gehalten (aktuell nicht im Body
    // referenziert; Verhalten identisch zu vorher — PDF nur als Anhang).
    const agb = await resolveAgbForCandidates(
      adminClient,
      APP_URL,
      [contract.product_name, ...(Array.isArray(contract.modules) ? contract.modules : [])],
      "[send-contract-confirmation]",
    );
    const agbBase64 = agb.base64;
    const agbFilename = agb.filename;
    const agbDownloadUrl = agb.downloadUrl;

    // --- Build email ---
    // DEPRECATED — alte Stripe-Welt-Buchungslink entfernt am 08.05.2026.
    // Mail ist nun reine Brücken-Mitteilung; SEPA-Aktivierung erfolgt separat
    // über mandate-recovery / auto-invoice (NEUE Welt). Template-Override wird
    // bewusst ignoriert, damit kein alter ${buchenUrl}-Link mehr ausgespielt wird.
    {
      // Lese Override nur fürs Logging, ohne ihn anzuwenden
      const { data: legacyOverride } = await adminClient
        .from("email_template_overrides")
        .select("template_key")
        .eq("template_key", "booking-link")
        .maybeSingle();
      if (legacyOverride) {
        console.log("[send-contract-confirmation] Legacy booking-link override gefunden – ignoriert (alte Stripe-Welt abgeklemmt)");
      }
    }

    const anrede = [contract.vorname, contract.nachname].filter(Boolean).join(" ").trim();
    const greeting = anrede ? `Sehr geehrte/r ${anrede}` : "Sehr geehrte Damen und Herren";
    const hfxNr = contract.hfx_customer_number || "–";

    console.log("[send-contract-confirmation] Using activated-contract template (Variant B)");

    const monthlyFormatted = (Number(contract.monthly_price) || 0).toLocaleString("de-DE", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const bodyHtml = `
      <p style="margin:0 0 16px 0;">${greeting},</p>
      <p style="margin:0 0 16px 0;">
        vielen Dank f&uuml;r Ihren Vertragsabschluss bei HFX Honorarfuchs. Ihre SEPA-Bankverbindung haben wir erhalten und Ihr Vertrag ist nun aktiviert. Im Anhang finden Sie Ihre Vertrags&uuml;bersicht sowie unsere AGB als PDF.
      </p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;margin:8px 0 18px;">
        <tr><td style="padding:14px 18px;color:#374151;font-size:11pt;line-height:1.5;font-family:verdana,geneva,sans-serif;">
          <strong>Vertragsnummer:</strong> ${hfxNr}<br/>
          <strong>Produkt:</strong> ${contract.product_name || "–"}<br/>
          <strong>Monatlicher Gesamtbetrag:</strong> ${monthlyFormatted} &euro;
        </td></tr>
      </table>
      <p style="margin:0 0 16px 0;">Erste Lastschrift erfolgt zum 1. des kommenden Monats.</p>
      <p style="margin:0 0 16px 0;">Die AGB und Ihre Vertrags&uuml;bersicht finden Sie als PDF im Anhang dieser E-Mail.</p>
      <p style="margin:0 0 16px 0;">
        Bei Fragen stehen wir Ihnen unter <a href="mailto:info@hfx-honorarfuchs.de" style="color:#0b367f;">info@hfx-honorarfuchs.de</a> zur Verf&uuml;gung.
      </p>
      <p style="margin:24px 0 0 0;">
        Mit freundlichen Gr&uuml;&szlig;en<br />
        <strong>Ihr HFX Honorarfuchs Team</strong>
      </p>`;

    const bodyText = [
      `${greeting},`,
      "",
      "vielen Dank für Ihren Vertragsabschluss bei HFX Honorarfuchs. Ihre SEPA-Bankverbindung haben wir erhalten und Ihr Vertrag ist nun aktiviert. Im Anhang finden Sie Ihre Vertragsübersicht sowie unsere AGB als PDF.",
      "",
      `Vertragsnummer: ${hfxNr}`,
      `Produkt: ${contract.product_name || "–"}`,
      `Monatlicher Gesamtbetrag: ${monthlyFormatted} €`,
      "",
      "Erste Lastschrift erfolgt zum 1. des kommenden Monats.",
      "",
      "Die AGB und Ihre Vertragsübersicht finden Sie als PDF im Anhang dieser E-Mail.",
      "",
      "Bei Fragen stehen wir Ihnen unter info@hfx-honorarfuchs.de zur Verfügung.",
      "",
      "Mit freundlichen Grüßen",
      "Ihr HFX Honorarfuchs Team",
    ].join("\n");

    const { html, text } = renderBrandedEmail({
      subheadline: "Ihr Vertrag ist aktiviert",
      bodyHtml,
      bodyText,
    });

    // Build attachments
    const attachments: Array<{ filename: string; content: string }> = [
      { filename: "Vertragsuebersicht.pdf", content: pdfBase64 },
    ];
    if (agbBase64) {
      attachments.push({ filename: agbFilename, content: agbBase64 });
    }

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
        reply_to: "info@hfx-honorarfuchs.de",
        to: [contract.email],
        subject: `Ihre Vertragsbestätigung — SEPA-Lastschrift eingerichtet${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}`,
        html,
        text,
        attachments,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error("[send-contract-confirmation] Resend error:", err);
      throw new Error(`Email send failed: ${err}`);
    }

    console.log(`[send-contract-confirmation] Email with PDF attachments sent to ${contract.email} for contract ${contract_id}`);

    await adminClient
      .from("contracts")
      .update({ confirmation_email_sent_at: new Date().toISOString() })
      .eq("id", contract_id);

    return new Response(
      JSON.stringify({ success: true, email: contract.email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-contract-confirmation] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
