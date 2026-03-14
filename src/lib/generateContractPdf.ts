import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

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

interface ContractPdfData {
  hfx_customer_number?: string;
  praxis?: string;
  fachrichtung?: string;
  vorname?: string;
  nachname?: string;
  adresse?: string;
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
  product_price_details?: ProductPriceDetail[];
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "–";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value?: number): string {
  if (value == null) return "0,00 €";
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export async function generateContractPdf(data: ContractPdfData, logoBytes?: ArrayBuffer): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const ML = 56;
  const MR = 56;
  const CW = PAGE_W - ML - MR;
  const mmToPt = 2.8346;

  // Colors – matching invoice design
  const C_NAVY = rgb(0.044, 0.212, 0.498);
  const C_TEXT = rgb(0.12, 0.12, 0.14);
  const C_MUTED = rgb(0.35, 0.37, 0.42);
  const C_LINE = rgb(0.044, 0.212, 0.498);
  const C_LINE_LIGHT = rgb(0.75, 0.80, 0.88);
  const C_WHITE = rgb(1, 1, 1);
  const C_BG_LIGHT = rgb(0.95, 0.96, 0.98);
  const C_GREEN = rgb(0.09, 0.56, 0.28);

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

  // ===== LOGO (top-right, matching invoice) =====
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
  const leftColW = CW * 0.46;
  const rightColX = ML + CW * 0.50;
  const rightColW = CW * 0.50;
  const boxTop = y;

  // --- Recipient ---
  const recipientLines: string[] = [];
  const fullName = [data.vorname, data.nachname].filter(Boolean).join(" ");
  if (data.praxis) recipientLines.push(data.praxis);
  if (fullName) recipientLines.push(fullName);
  if (data.adresse) recipientLines.push(data.adresse);
  if (data.email) recipientLines.push(data.email);

  const recipLineH = 13;

  let ry = boxTop - 4;
  recipientLines.forEach((line, i) => {
    const isFirst = i === 0;
    text(line, ML, ry, isFirst ? 10 : 8.5, isFirst ? fontBold : font, C_TEXT);
    ry -= recipLineH;
  });

  // --- Metadata table (right column) ---
  const statusLabels: Record<string, string> = {
    entwurf: "ENTWURF", aktiv: "AKTIV", eingegangen: "EINGEGANGEN", gekuendigt: "GEKÜNDIGT", beendet: "BEENDET",
  };
  const st = data.status || "entwurf";
  const intervalLabels: Record<string, string> = {
    monatlich: "Monatlich", quartalsweise: "Quartalsweise", jaehrlich: "Jährlich",
  };

  const metaRows: [string, string][] = [
    ["Kundennummer", data.hfx_customer_number || "–"],
    ["Vertragsbeginn", formatDate(data.start_date)],
    ["Vertragsende", formatDate(data.end_date)],
    ["Laufzeit", (data.duration_months ?? 0) === 0 ? "Unbefristet" : `${data.duration_months} Monate`],
    ["Zahlungsintervall", intervalLabels[data.payment_interval || "monatlich"] || data.payment_interval || "Monatlich"],
    ["Status", statusLabels[st] || st.toUpperCase()],
  ];

  const recipBoxH = Math.max(recipientLines.length * recipLineH + 10, metaRows.length * 16 + 10);
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

  // ===== "VERTRAGSÜBERSICHT" TITLE =====
  text("VERTRAGSÜBERSICHT", ML, y, 20, fontBold, C_TEXT);
  y -= 28;

  // ===== VERTRAGSPARTEIEN =====
  const sectionHeader = (title: string) => {
    ensureSpace(40);
    page.drawLine({ start: { x: ML, y: y + 10 }, end: { x: PAGE_W - MR, y: y + 10 }, thickness: 1, color: C_LINE });
    const rowH = 22;
    page.drawRectangle({ x: ML, y: y - rowH + 10, width: CW, height: rowH, color: C_BG_LIGHT });
    page.drawLine({ start: { x: ML, y: y - rowH + 10 }, end: { x: PAGE_W - MR, y: y - rowH + 10 }, thickness: 0.8, color: C_LINE });
    text(title, ML + 8, y, 8.5, fontBold, C_NAVY);
    y -= rowH + 6;
  };

  const fieldRow = (label: string, value: string, label2?: string, value2?: string) => {
    ensureSpace(20);
    const halfW = CW / 2;
    text(label, ML + 8, y, 7, font, C_MUTED);
    if (label2) text(label2, ML + halfW + 8, y, 7, font, C_MUTED);
    y -= 11;
    text(value || "–", ML + 8, y, 9, font, C_TEXT, halfW - 16);
    if (label2) text(value2 || "–", ML + halfW + 8, y, 9, font, C_TEXT, halfW - 16);
    y -= 15;
    page.drawLine({ start: { x: ML, y: y + 4 }, end: { x: PAGE_W - MR, y: y + 4 }, thickness: 0.3, color: C_LINE_LIGHT });
  };

  sectionHeader("VERTRAGSPARTEIEN");
  fieldRow("Praxis", data.praxis || "–", "Fachrichtung", data.fachrichtung || "–");
  fieldRow("Vorname", data.vorname || "–", "Nachname", data.nachname || "–");
  fieldRow("Adresse", data.adresse || "–");
  fieldRow("Telefon", data.telefon || "–", "E-Mail", data.email || "–");
  fieldRow("MP-Nummer", data.mp_nr || "–", "Vertriebspartner", data.sales_partner_name || "–");
  y -= 10;

  // ===== PRODUKTE & LIZENZEN =====
  sectionHeader("PRODUKTE & LIZENZEN");
  const productList = data.modules?.length ? data.modules.join(", ") : data.product_name || "–";
  fieldRow("Ausgewählte Produkte", productList);
  fieldRow("Anzahl Lizenzen", String(data.license_count ?? 1));

  // Addon modules
  if (data.addon_module_details && data.addon_module_details.length > 0) {
    text("Zusatzmodule:", ML + 8, y, 7, font, C_MUTED);
    y -= 12;
    for (const mod of data.addon_module_details) {
      ensureSpace(20);
      text(`• ${mod.name}`, ML + 12, y, 8.5, font, C_TEXT);
      rightText(`${formatCurrency(mod.monthly_price)}/Mon.`, PAGE_W - MR - 8, y, 8.5, font, C_NAVY);
      y -= 14;
    }
    const addonTotal = data.addon_module_details.reduce((s, m) => s + m.monthly_price, 0);
    rightText(`Zusatzmodule gesamt: ${formatCurrency(addonTotal)}/Mon.`, PAGE_W - MR - 8, y, 8, fontBold, C_NAVY);
    y -= 18;
  } else if (data.selected_addon_modules && data.selected_addon_modules.length > 0) {
    fieldRow("Zusatzmodule", data.selected_addon_modules.join(", "));
  }
  y -= 6;

  // ===== LAUFZEIT & KÜNDIGUNG =====
  sectionHeader("LAUFZEIT & KÜNDIGUNG");
  fieldRow("Vertragsbeginn", formatDate(data.start_date), "Vertragsende", formatDate(data.end_date));
  fieldRow("Laufzeit", `${data.duration_months ?? 12} Monate`, "Kündigungsfrist", `${data.cancellation_period_months ?? 6} Monate zum Monatsende`);
  y -= 10;

  // ===== PREISÜBERSICHT (table style like invoice) =====
  sectionHeader("PREISÜBERSICHT");

  const TABLE_RIGHT = PAGE_W - MR;
  const COL_LABEL = ML;
  const COL_VALUE_RIGHT = TABLE_RIGHT;

  // Price rows in bordered table style
  const priceRowH = 24;

  const drawPriceRow = (label: string, value: string, isBold = false, topBorder = false) => {
    ensureSpace(priceRowH + 4);
    const rowTop = y + 10;
    const rowBottom = rowTop - priceRowH;

    if (topBorder) {
      page.drawLine({ start: { x: ML, y: rowTop }, end: { x: TABLE_RIGHT, y: rowTop }, thickness: 0.8, color: C_LINE });
    }
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
    drawPriceRow("Rabatt", `${data.discount_percent}%`, false);
  }

  // Gesamtbetrag row (bold, highlighted)
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

  // Product price details (unit prices & promos)
  if (data.product_price_details && data.product_price_details.length > 0) {
    const detailProducts = data.product_price_details.filter(
      (pp) => pp.price_per_unit != null || pp.has_active_promo
    );
    if (detailProducts.length > 0) {
      y -= 6;
      for (const pp of detailProducts) {
        ensureSpace(50);
        text(pp.name, ML + 8, y, 8, fontBold, C_TEXT);
        y -= 14;
        if (pp.has_active_promo && pp.promo_price != null) {
          const promoLabel = pp.promo_price_label || `${pp.promo_price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."}`;
          text("Aktionspreis: " + promoLabel, ML + 8, y, 8, font, C_GREEN);
          y -= 12;
          const regParts: string[] = [];
          if (pp.monthly_price > 0) regParts.push(`${pp.monthly_price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/Mon.`);
          if (pp.price_per_unit != null) regParts.push(`${pp.price_per_unit.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."}`);
          if (regParts.length > 0) {
            text("Regulär: " + regParts.join(" + "), ML + 8, y, 7, font, C_MUTED);
            y -= 12;
          }
          if (pp.promo_end_date) {
            text("Gültig bis " + formatDate(pp.promo_end_date), ML + 8, y, 7, font, C_MUTED);
            y -= 12;
          }
        } else if (pp.price_per_unit != null) {
          text(`${pp.price_per_unit.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."}`, ML + 8, y, 8, font, C_TEXT);
          y -= 12;
        }
        y -= 4;
      }
    }
  }

  // Promo info box
  if (data.product_price_details && data.product_price_details.length > 0) {
    const promoProducts = data.product_price_details.filter((pp) => pp.has_active_promo);
    if (promoProducts.length > 0) {
      ensureSpace(80);
      y -= 4;
      const boxH = 58;
      const boxY = y - boxH;
      page.drawRectangle({ x: ML, y: boxY, width: CW, height: boxH, color: rgb(1, 0.97, 0.92), borderColor: rgb(0.9, 0.75, 0.4), borderWidth: 0.8 });
      page.drawRectangle({ x: ML, y: boxY, width: 3, height: boxH, color: rgb(0.9, 0.65, 0.1) });

      text("Info: Preis nach Ablauf der Aktion", ML + 12, boxY + boxH - 14, 8, fontBold, rgb(0.5, 0.35, 0.05));

      let totalAfterPromo = 0;
      for (const pp of data.product_price_details) {
        totalAfterPromo += pp.monthly_price;
      }
      const unitHints: string[] = [];
      for (const pp of data.product_price_details) {
        if (pp.has_active_promo && pp.promo_price != null) {
          unitHints.push(`${pp.name}: ${pp.promo_price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."} (dauerhaft)`);
        } else if (pp.price_per_unit != null) {
          unitHints.push(`${pp.name}: ${pp.price_per_unit.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."}`);
        }
      }

      let afterLine = `Grundgebühr: ${totalAfterPromo.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/Mon.`;
      if (unitHints.length > 0) afterLine += "  +  " + unitHints.join(", ");
      text(afterLine, ML + 12, boxY + boxH - 28, 7.5, font, rgb(0.25, 0.2, 0.05), CW - 24);

      const baseFeeEndDates = promoProducts
        .filter((pp) => pp.promo_base_fee_end_date)
        .map((pp) => pp.promo_base_fee_end_date!);
      const promoEndDates = promoProducts
        .filter((pp) => pp.promo_end_date)
        .map((pp) => pp.promo_end_date!);

      const baseFeeEnd = baseFeeEndDates.sort()[0];
      if (baseFeeEnd) {
        text("Grundgebühr regulär ab " + formatDate(baseFeeEnd) + "  |  Stückpreis dauerhaft reduziert", ML + 12, boxY + boxH - 40, 7, font, C_MUTED, CW - 24);
      } else {
        const promoEnd = promoEndDates.sort()[0];
        if (promoEnd) {
          text("Reguläre Preise gelten ab " + formatDate(promoEnd), ML + 12, boxY + boxH - 40, 7, font, C_MUTED);
        }
      }

      y = boxY - 8;
    }
  }

  y -= 10;

  // ===== SEPA =====
  sectionHeader("SEPA-LASTSCHRIFTEINZUG");
  fieldRow("Kontoinhaber", data.kontoinhaber || "–");
  fieldRow("IBAN", data.iban || "–", "BIC", data.bic || "–");
  y -= 10;

  // ===== UNTERSCHRIFT (nur wenn vorhanden) =====
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
