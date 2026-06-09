/**
 * ⚠ SYNCHRONIZE MIT supabase/functions/send-contract-confirmation/index.ts → buildContractPdf
 *
 * Diese Datei rendert die UI-Vorschau-PDF („Vertragsdaten PDF"-Button im Dashboard
 * sowie in der Verträge-Liste). Der Renderer für die nach Stripe-Zahlung an Kunden
 * versendete Mail-PDF (gleiche Optik, andere IBAN-Maskierung, ohne UNTERSCHRIFT)
 * lebt in der oben genannten Edge Function.
 *
 * Änderungen an Helfer-Funktionen (text, rightText, fieldRow, sectionHeader,
 * drawPriceRow, ensureSpace, drawFooter, maskIban) IMMER in beiden Dateien anpassen.
 *
 * Drift wird durch das Skript scripts/diff-contract-pdf.ts erkannt — erwartete
 * Unterschiede sind: (a) IBAN-Modus partial vs. compact, (b) UNTERSCHRIFT-Sektion
 * nur in der UI. Alles andere muss byte-identisch sein.
 */
import { PDFDocument, rgb } from "pdf-lib";
import { embedExo2 } from "@/lib/pdfFontLoader";
import { isContractPromoActive } from "@/lib/promoStatus";
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
} from "@/lib/pdfDesignTokens";

interface ProductPriceDetail {
  name: string;
  monthly_price: number;
  price_per_unit?: number | null;
  price_per_unit_label?: string | null;
  promo_price?: number | null;
  promo_price_label?: string | null;
  promo_end_date?: string | null;
  promo_base_fee_end_date?: string | null;
  has_active_promo?: boolean;
}

interface AddonModuleDetail {
  name: string;
  monthly_price: number;
}

export interface PromoProductFull {
  name: string;
  promo_price: number | null;
  promo_end_date: string | null;
  promo_price_label: string | null;
  promo_base_fee_end_date: string | null;
  monthly_price: number | null;
  price_per_unit: number | null;
  price_per_unit_label: string | null;
}

interface ContractPdfData {
  hfx_customer_number?: string;
  praxis?: string;
  fachrichtung?: string;
  vorname?: string;
  nachname?: string;
  adresse?: string;
  plz?: string;
  ort?: string;
  telefon?: string;
  email?: string;
  mp_nr?: string;
  sales_partner_name?: string;
  product_name?: string;
  modules?: string[];
  selected_addon_modules?: string[];
  addon_module_details?: AddonModuleDetail[];
  license_count?: number;
  start_date?: string;
  end_date?: string;
  duration_months?: number;
  cancellation_period_months?: number;
  auto_renewal?: boolean;
  monthly_price?: number;
  one_time_fee?: number;
  discount_percent?: number;
  payment_interval?: string;
  kontoinhaber?: string;
  stripe_customer_id?: string | null;
  iban?: string;
  bic?: string;
  notes?: string;
  signature_data?: string | null;
  status?: string;
  qodia_unit_price?: number | null;
  /**
   * @deprecated Wird für Promo-Erkennung nicht mehr verwendet — SSOT ist jetzt
   * `extras.promoProduct` + `isContractPromoActive` aus src/lib/promoStatus.ts.
   * Bleibt im Typ, weil bestehende Aufrufer es noch übergeben (Hygiene-TODO).
   */
  product_price_details?: ProductPriceDetail[];
}

export interface GenerateContractPdfExtras {
  promoProduct?: PromoProductFull | null;
}

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

export async function generateContractPdf(
  data: ContractPdfData,
  logoBytes?: ArrayBuffer,
  extras: GenerateContractPdfExtras = {},
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = await embedExo2(doc);
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

  // ===== LOGO =====
  let embeddedLogo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (logoBytes) {
    try { embeddedLogo = await doc.embedPng(logoBytes); } catch { try { embeddedLogo = await doc.embedJpg(logoBytes); } catch { /* skip */ } }
  }

  const headerTop = PAGE_H - 36;
  if (embeddedLogo) {
    const logoH = 40;
    const logoW = (embeddedLogo.width / embeddedLogo.height) * logoH;
    const logoX = PAGE_W - MR - logoW;
    page.drawImage(embeddedLogo, { x: logoX, y: headerTop - logoH + 10, width: logoW, height: logoH });
  } else {
    text("HFX Honorarfuchs", ML, headerTop, 18, fontBold, C_NAVY);
    text("ein Geschäftsbereich der MCC Medical CareCapital GmbH", ML, headerTop - 16, 7, font, C_MUTED);
  }

  // ===== SENDER LINE =====
  y = PAGE_H - 48 * mmToPt;
  text("HFX Honorarfuchs · Hohenzollernstr. 47 · 47799 Krefeld", ML, y, 7, font, C_MUTED);
  y -= 4;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + 220, y }, thickness: 0.3, color: C_LINE_LIGHT });
  y -= 14;

  // ===== TWO-COLUMN: RECIPIENT + METADATA =====
  const rightColX = ML + CW * 0.50;
  const rightColW = CW * 0.50;
  const boxTop = y;

  const recipientLines: string[] = [];
  const fullName = [data.vorname, data.nachname].filter(Boolean).join(" ");
  if (data.praxis) recipientLines.push(data.praxis);
  if (fullName) recipientLines.push(fullName);
  if (data.adresse) recipientLines.push(data.adresse);
  const plzOrt = [data.plz, data.ort].filter(Boolean).join(" ");
  if (plzOrt) recipientLines.push(plzOrt);
  if (data.email) recipientLines.push(data.email);

  let ry = boxTop - 4;
  recipientLines.forEach((line, i) => {
    text(line, ML, ry, i === 0 ? 10 : 8.5, i === 0 ? fontBold : font, C_TEXT);
    ry -= 13;
  });

  const statusLabels: Record<string, string> = {
    entwurf: "ENTWURF", aktiv: "AKTIV", eingegangen: "EINGEGANGEN", gekuendigt: "GEKÜNDIGT", beendet: "BEENDET",
  };
  const st = data.status || "entwurf";
  const intervalLabels: Record<string, string> = {
    monatlich: "Monatlich", quartalsweise: "Quartalsweise", jaehrlich: "Jährlich",
  };
  const endDateStr = data.end_date || "";
  const metaRows: [string, string][] = [
    ["Kundennummer", data.hfx_customer_number || "–"],
    ["Vertragsbeginn", formatDate(data.start_date)],
    ["Vertragsende", endDateStr === "2099-12-31" ? "Unbefristet" : formatDate(endDateStr)],
    ["Laufzeit", (data.duration_months ?? 0) === 0 ? "Unbefristet" : `${data.duration_months} Monate`],
    ["Zahlungsintervall", intervalLabels[data.payment_interval || "monatlich"] || data.payment_interval || "Monatlich"],
    ["Status", statusLabels[st] || st.toUpperCase()],
  ];

  const recipBoxH = Math.max(recipientLines.length * 13 + 10, metaRows.length * 16 + 10);
  const metaRowH = recipBoxH / metaRows.length;

  metaRows.forEach((row, i) => {
    const rowY = boxTop - i * metaRowH;
    if (i > 0) {
      page.drawLine({ start: { x: rightColX, y: rowY }, end: { x: rightColX + rightColW, y: rowY }, thickness: 0.4, color: C_LINE_LIGHT });
    }
    const textY = rowY - metaRowH / 2 - 3;
    text(row[0], rightColX + 6, textY, 7.5, fontBold, C_TEXT);
    text(row[1], rightColX + rightColW * 0.48 + 6, textY, 8, font, C_TEXT);
  });

  y = boxTop - recipBoxH - 24 - 20 * mmToPt;

  // ===== TITLE =====
  text("VERTRAGSÜBERSICHT", ML, y, SIZE_HEADING, fontBold, C_TEXT);
  y -= 28;

  const sectionHeader = (title: string, titleColor = C_SECTION_TITLE) => {
    ensureSpace(40);
    y -= SECTION_GAP_BEFORE + SIZE_SECTION_TITLE;
    text(title, ML, y, SIZE_SECTION_TITLE, fontBold, titleColor);
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
      // Doppel-Variante (Backwards-Compat — neue Aufrufer sollten Single nutzen)
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

  // ===== VERTRAGSPARTEIEN =====
  sectionHeader("VERTRAGSPARTEIEN");
  fieldRow("Praxis", data.praxis || "–");
  fieldRow("Fachrichtung", data.fachrichtung || "–");
  fieldRow("Vorname", data.vorname || "–");
  fieldRow("Nachname", data.nachname || "–");
  fieldRow("Adresse", data.adresse || "–");
  fieldRow("PLZ / Ort", [data.plz, data.ort].filter(Boolean).join(" ") || "–");
  fieldRow("Telefon", data.telefon || "–");
  fieldRow("E-Mail", data.email || "–");
  fieldRow("MP-Nummer", data.mp_nr || "–");
  fieldRow("Vertriebspartner", data.sales_partner_name || "–");

  // ===== PRODUKTE & LIZENZEN =====
  sectionHeader("PRODUKTE & LIZENZEN");
  const productList = data.modules?.length ? data.modules.join(", ") : data.product_name || "–";
  fieldRow("Ausgewählte Produkte", productList);
  fieldRow("Anzahl Lizenzen", String(data.license_count ?? 1));

  // ===== ZUSATZMODULE =====
  sectionHeader("ZUSATZMODULE");
  const addons = data.addon_module_details ?? [];
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

  // ===== LAUFZEIT =====
  sectionHeader("LAUFZEIT");
  const endDateLabel = endDateStr === "2099-12-31" ? "Unbefristet" : formatDate(endDateStr);
  fieldRow("Vertragsbeginn", formatDate(data.start_date));
  fieldRow("Vertragsende", endDateLabel);
  const laufzeitLabel = (data.duration_months ?? 0) === 0 ? "Unbefristet" : `${data.duration_months} Monate`;
  fieldRow("Laufzeit", laufzeitLabel);

  // ===== PREISÜBERSICHT =====
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

  drawPriceRow("Monatspreis (netto)", formatCurrency(data.monthly_price), false, true);
  drawPriceRow("Einmalgebühr", formatCurrency(data.one_time_fee));
  if ((data.discount_percent ?? 0) > 0) {
    drawPriceRow("Rabatt", `${data.discount_percent}%`);
  }

  // Gesamtbetrag row — kein Hintergrund, kräftigere Top-Linie als Akzent
  ensureSpace(30);
  const grossRowTop = y + 10;
  const grossRowH = 28;
  const grossRowBottom = grossRowTop - grossRowH;
  page.drawLine({ start: { x: ML, y: grossRowTop }, end: { x: TABLE_RIGHT, y: grossRowTop }, thickness: 1.2, color: C_NAVY });
  page.drawLine({ start: { x: ML, y: grossRowBottom }, end: { x: TABLE_RIGHT, y: grossRowBottom }, thickness: 0.4, color: C_LINE_LIGHT });
  const grossTextY = grossRowTop - grossRowH / 2 - 2;
  text("Monatlicher Gesamtbetrag", ML, grossTextY, SIZE_SECTION_TITLE, fontBold, C_NAVY);
  rightText(formatCurrency(data.monthly_price), TABLE_RIGHT, grossTextY, SIZE_SECTION_TITLE + 1, fontBold, C_NAVY);
  y -= grossRowH + 4;

  // ===== AKTIONSPREIS (SSOT: src/lib/promoStatus.ts) =====
  const promoProduct = extras.promoProduct ?? null;
  const promoActive = isContractPromoActive(
    { qodia_unit_price: Number(data.qodia_unit_price ?? 0) },
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

  // ===== SEPA — Drei-Wege-Hinweis (Hybrid; SSOT-Entscheidung in Phase D-vor) =====
  //  D) IBAN in DB hinterlegt → Tabelle
  //  A) IBAN leer, aber stripe_customer_id gesetzt → Mandat liegt beim PSP
  //  B/C) Beides leer → je nach Status "noch ausstehend" oder "nicht im System hinterlegt"
  sectionHeader("SEPA-LASTSCHRIFTEINZUG");
  const ibanRaw = String(data.iban || "").trim();
  const stripeCustomerId = String(data.stripe_customer_id || "").trim();
  const contractStatus = String(data.status || "").toLowerCase();
  if (ibanRaw.length > 0) {
    fieldRow("Kontoinhaber", data.kontoinhaber || "–");
    fieldRow("IBAN (maskiert)", maskIban(ibanRaw, "partial"));
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

  // ===== UNTERSCHRIFT (UI-only) =====
  if (data.signature_data && data.signature_data.startsWith("data:image")) {
    sectionHeader("UNTERSCHRIFT");
    try {
      const base64 = data.signature_data.split(",")[1];
      const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pngImage = await doc.embedPng(imgBytes);
      const sigW = 200;
      const sigH = (pngImage.height / pngImage.width) * sigW;
      ensureSpace(sigH + 20);
      page.drawImage(pngImage, { x: ML + 8, y: y - sigH, width: sigW, height: sigH });
      y -= sigH + 10;
    } catch {
      // skip
    }
  }

  // ===== CLOSING =====
  ensureSpace(60);
  y -= 28;
  text("Mit freundlichen Grüßen", ML, y, SIZE_BODY, font, C_TEXT);
  y -= 18;
  text("HFX Honorarfuchs", ML, y, SIZE_BODY + 1, fontBold, C_NAVY);

  // ===== FOOTER =====
  drawFooter();

  return doc.save();
}
