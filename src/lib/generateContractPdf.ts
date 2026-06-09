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
  const fontBold = fonts.bold;

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const ML = 56;
  const MR = 56;
  const CW = PAGE_W - ML - MR;
  const mmToPt = 2.8346;

  const C_NAVY = rgb(0.044, 0.212, 0.498);
  const C_TEXT = rgb(0.12, 0.12, 0.14);
  const C_MUTED = rgb(0.35, 0.37, 0.42);
  const C_LINE = rgb(0.044, 0.212, 0.498);
  const C_LINE_LIGHT = rgb(0.75, 0.80, 0.88);
  const C_BG_LIGHT = rgb(0.95, 0.96, 0.98);

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
  text("VERTRAGSÜBERSICHT", ML, y, 20, fontBold, C_TEXT);
  y -= 28;

  const sectionHeader = (title: string) => {
    ensureSpace(40);
    page.drawLine({ start: { x: ML, y: y + 10 }, end: { x: PAGE_W - MR, y: y + 10 }, thickness: 1, color: C_LINE });
    const rowH = 24;
    page.drawRectangle({ x: ML, y: y - rowH + 10, width: CW, height: rowH, color: C_BG_LIGHT });
    page.drawLine({ start: { x: ML, y: y - rowH + 10 }, end: { x: PAGE_W - MR, y: y - rowH + 10 }, thickness: 0.8, color: C_LINE });
    page.drawText(title, { x: ML + 8, y: y - 1, size: 10, font: fontBold, color: C_NAVY, characterSpacing: 0.5 } as any);
    y -= rowH + 6;
  };

  const fieldRow = (label: string, value: string, label2?: string, value2?: string) => {
    ensureSpace(20);
    const halfW = CW / 2;
    text(label, ML + 8, y, 7, font, C_MUTED);
    if (label2) text(label2, ML + halfW + 8, y, 7, font, C_MUTED);
    y -= 13;
    text(value || "–", ML + 8, y, 9, font, C_TEXT, halfW - 16);
    if (label2) text(value2 || "–", ML + halfW + 8, y, 9, font, C_TEXT, halfW - 16);
    y -= 13;
    // Trennlinie deutlich über dem nächsten Label (Label ist 7pt hoch, +9 lässt ~2pt Luft über der Label-Oberkante)
    page.drawLine({ start: { x: ML, y: y + 9 }, end: { x: PAGE_W - MR, y: y + 9 }, thickness: 0.3, color: C_LINE_LIGHT });
  };

  // ===== VERTRAGSPARTEIEN =====
  sectionHeader("VERTRAGSPARTEIEN");
  fieldRow("Praxis", data.praxis || "–", "Fachrichtung", data.fachrichtung || "–");
  fieldRow("Vorname", data.vorname || "–", "Nachname", data.nachname || "–");
  fieldRow("Adresse", data.adresse || "–", "PLZ / Ort", [data.plz, data.ort].filter(Boolean).join(" ") || "–");
  fieldRow("Telefon", data.telefon || "–", "E-Mail", data.email || "–");
  fieldRow("MP-Nummer", data.mp_nr || "–", "Vertriebspartner", data.sales_partner_name || "–");
  y -= 10;

  // ===== PRODUKTE & LIZENZEN =====
  sectionHeader("PRODUKTE & LIZENZEN");
  const productList = data.modules?.length ? data.modules.join(", ") : data.product_name || "–";
  fieldRow("Ausgewählte Produkte", productList);
  fieldRow("Anzahl Lizenzen", String(data.license_count ?? 1));
  y -= 6;

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
  fieldRow("Vertragsbeginn", formatDate(data.start_date), "Vertragsende", endDateLabel);
  const laufzeitLabel = (data.duration_months ?? 0) === 0 ? "Unbefristet" : `${data.duration_months} Monate`;
  fieldRow("Laufzeit", laufzeitLabel);
  y -= 10;

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

  // Gesamtbetrag row
  ensureSpace(30);
  const grossRowTop = y + 10;
  const grossRowH = 28;
  const grossRowBottom = grossRowTop - grossRowH;
  page.drawLine({ start: { x: ML, y: grossRowTop }, end: { x: TABLE_RIGHT, y: grossRowTop }, thickness: 1.5, color: C_LINE });
  page.drawRectangle({ x: ML, y: grossRowBottom, width: CW, height: grossRowH, color: C_BG_LIGHT });
  page.drawLine({ start: { x: ML, y: grossRowBottom }, end: { x: TABLE_RIGHT, y: grossRowBottom }, thickness: 1.5, color: C_LINE });
  page.drawLine({ start: { x: ML, y: grossRowTop }, end: { x: ML, y: grossRowBottom }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: TABLE_RIGHT, y: grossRowTop }, end: { x: TABLE_RIGHT, y: grossRowBottom }, thickness: 0.8, color: C_LINE });
  const grossTextY = grossRowTop - grossRowH / 2 - 2;
  text("Monatlicher Gesamtbetrag", ML + 8, grossTextY, 10, fontBold, C_NAVY);
  rightText(formatCurrency(data.monthly_price), TABLE_RIGHT - 8, grossTextY, 11, fontBold, C_NAVY);
  y -= grossRowH + 4;

  // ===== AKTIONSPREIS (SSOT: src/lib/promoStatus.ts) =====
  const promoProduct = extras.promoProduct ?? null;
  const promoActive = isContractPromoActive(
    { qodia_unit_price: Number(data.qodia_unit_price ?? 0) },
    promoProduct,
  );
  if (promoActive && promoProduct) {
    sectionHeader("AKTIONSPREIS");
    ensureSpace(20);
    text(promoProduct.name, ML + 8, y, 10, fontBold, C_NAVY);
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
    fieldRow("Regulär nach Aktionsende", regBase, "Stückpreis regulär", regUnit);
    if (promoProduct.promo_end_date) {
      fieldRow("Aktion gültig bis (Abschlussdatum)", formatDate(promoProduct.promo_end_date));
    }
    y -= 6;
  }

  // ===== SEPA =====
  sectionHeader("SEPA-LASTSCHRIFTEINZUG");
  const ibanRaw = String(data.iban || "").trim();
  const hasMandate = ibanRaw.length > 0;
  if (hasMandate) {
    fieldRow(
      "Kontoinhaber",
      data.kontoinhaber || "–",
      "IBAN (maskiert)",
      maskIban(ibanRaw, "partial"),
    );
  } else {
    ensureSpace(20);
    text("SEPA-Mandat liegt nicht im System hinterlegt", ML + 8, y, 9, font, C_MUTED);
    y -= 16;
  }
  y -= 10;

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
  ensureSpace(50);
  y -= 8;
  text("Mit freundlichen Grüßen", ML, y, 9, font, C_TEXT);
  y -= 16;
  text("HFX Honorarfuchs", ML, y, 10, fontBold, C_NAVY);

  // ===== FOOTER =====
  drawFooter();

  return doc.save();
}
