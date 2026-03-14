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

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const M = 48; // margin
  const CW = PAGE_W - 2 * M;
  const COL2_X = M + CW / 2 + 10;
  const COL_W = CW / 2 - 10;

  // Brand colors matching the page theme
  const C_NAVY = rgb(0.044, 0.212, 0.498);    // #0b367f - sidebar/accent
  const C_RED = rgb(0.714, 0.098, 0.239);      // #b6193d - primary
  const C_TEXT = rgb(0.12, 0.12, 0.12);
  const C_MUTED = rgb(0.4, 0.42, 0.48);
  const C_LINE = rgb(0.82, 0.84, 0.88);
  const C_BG_LIGHT = rgb(0.95, 0.96, 0.98);    // matches --background
  const C_WHITE = rgb(1, 1, 1);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  // ---------- helpers ----------
  const text = (t: string, x: number, yy: number, size: number, f = font, color = C_TEXT, maxW?: number) => {
    page.drawText(t || "", { x, y: yy, size, font: f, color, maxWidth: maxW });
  };

  const ensureSpace = (needed = 80) => {
    if (y < M + needed) {
      // Footer on current page
      drawFooter();
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  };

  const drawFooter = () => {
    const fY = 30;
    page.drawLine({ start: { x: M, y: fY + 12 }, end: { x: PAGE_W - M, y: fY + 12 }, thickness: 0.4, color: C_LINE });
    text("HFX Honorarfuchs GmbH · Dieses Dokument dient der Vorschau und hat keine rechtliche Bindung.", M, fY, 6, font, C_MUTED);
  };

  const sectionHeader = (title: string) => {
    y -= 8;
    // Navy bar on left, light bg
    page.drawRectangle({ x: M, y: y - 4, width: CW, height: 20, color: C_BG_LIGHT });
    page.drawRectangle({ x: M, y: y - 4, width: 3, height: 20, color: C_NAVY });
    text(title.toUpperCase(), M + 12, y + 1, 8, fontBold, C_NAVY);
    y -= 26;
  };

  const fieldPair = (l1: string, v1: string, l2: string, v2: string) => {
    text(l1, M + 4, y, 7, font, C_MUTED);
    if (l2) text(l2, COL2_X, y, 7, font, C_MUTED);
    y -= 12;
    text(v1 || "–", M + 4, y, 9.5, font, C_TEXT, COL_W - 8);
    if (l2) text(v2 || "–", COL2_X, y, 9.5, font, C_TEXT, COL_W - 8);
    y -= 16;
  };

  const fieldFull = (label: string, value: string) => {
    text(label, M + 4, y, 7, font, C_MUTED);
    y -= 12;
    text(value || "–", M + 4, y, 9.5, font, C_TEXT, CW - 8);
    y -= 16;
  };

  const divider = () => {
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.4, color: C_LINE });
    y -= 12;
  };

  // ===== TOP BAR (Navy header strip) =====
  const headerH = 56;
  page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: C_NAVY });

  // Logo in header
  let logoXEnd = M + 4;
  if (logoBytes) {
    try {
      let logoImage; try { logoImage = await doc.embedPng(logoBytes); } catch { logoImage = await doc.embedJpg(logoBytes); }
      const logoH = 30;
      const logoW = (logoImage.width / logoImage.height) * logoH;
      page.drawImage(logoImage, { x: M, y: PAGE_H - headerH + 13, width: logoW, height: logoH });
      logoXEnd = M + logoW + 10;
    } catch {
      // continue without logo
    }
  }

  // Title in header bar
  text("HFX Honorarfuchs", logoXEnd, PAGE_H - headerH + 24, 16, fontBold, C_WHITE);
  text("Vertragsübersicht", logoXEnd, PAGE_H - headerH + 10, 9, font, rgb(0.75, 0.8, 0.9));

  // Status badge top-right
  const statusLabels: Record<string, string> = {
    entwurf: "ENTWURF", aktiv: "AKTIV", gekuendigt: "GEKÜNDIGT", beendet: "BEENDET",
  };
  const statusColors: Record<string, { bg: ReturnType<typeof rgb>; fg: ReturnType<typeof rgb> }> = {
    entwurf: { bg: rgb(0.85, 0.86, 0.9), fg: C_NAVY },
    aktiv: { bg: rgb(0.2, 0.7, 0.35), fg: C_WHITE },
    gekuendigt: { bg: rgb(0.9, 0.7, 0.15), fg: rgb(0.35, 0.3, 0.05) },
    beendet: { bg: C_RED, fg: C_WHITE },
  };
  const st = data.status || "entwurf";
  const stLabel = statusLabels[st] || st.toUpperCase();
  const stColor = statusColors[st] || statusColors.entwurf;
  const badgeW = font.widthOfTextAtSize(stLabel, 8) + 16;
  const badgeX = PAGE_W - M - badgeW;
  page.drawRectangle({ x: badgeX, y: PAGE_H - headerH + 20, width: badgeW, height: 18, color: stColor.bg, borderColor: stColor.bg, borderWidth: 0 });
  text(stLabel, badgeX + 8, PAGE_H - headerH + 24, 8, fontBold, stColor.fg);

  y = PAGE_H - headerH - 14;

  // HFX number + date line
  const hfxLine = `${data.hfx_customer_number || "Entwurf"}  ·  Erstellt am ${formatDate(new Date().toISOString())}`;
  text(hfxLine, M, y, 8, font, C_MUTED);
  y -= 18;
  divider();

  // ===== VERTRAGSPARTEIEN =====
  sectionHeader("Vertragsparteien");
  fieldPair("Praxis", data.praxis || "–", "Fachrichtung", data.fachrichtung || "–");
  fieldPair("Vorname", data.vorname || "–", "Nachname", data.nachname || "–");
  fieldFull("Adresse", data.adresse || "–");
  fieldPair("Telefon", data.telefon || "–", "E-Mail", data.email || "–");
  fieldPair("MP-Nummer", data.mp_nr || "–", "Vertriebspartner", data.sales_partner_name || "–");
  divider();
  ensureSpace();

  // ===== PRODUKTE =====
  sectionHeader("Produkte & Lizenzen");
  const productList = data.modules?.length ? data.modules.join(", ") : data.product_name || "–";
  fieldFull("Ausgewählte Produkte", productList);
  fieldPair("Anzahl Lizenzen", String(data.license_count ?? 1), "", "");

  // Addon modules
  if (data.addon_module_details && data.addon_module_details.length > 0) {
    y -= 4;
    text("Zusatzmodule:", M + 4, y, 7, font, C_MUTED);
    y -= 12;
    for (const mod of data.addon_module_details) {
      ensureSpace(20);
      text(`• ${mod.name}`, M + 8, y, 8.5, font, C_TEXT);
      text(`${formatCurrency(mod.monthly_price)}/Mon.`, COL2_X, y, 8.5, font, C_NAVY);
      y -= 14;
    }
    const addonTotal = data.addon_module_details.reduce((s, m) => s + m.monthly_price, 0);
    text(`Zusatzmodule gesamt: ${formatCurrency(addonTotal)}/Mon.`, M + 8, y, 8, fontBold, C_NAVY);
    y -= 14;
  } else if (data.selected_addon_modules && data.selected_addon_modules.length > 0) {
    fieldFull("Zusatzmodule", data.selected_addon_modules.join(", "));
  }

  divider();
  ensureSpace();

  // ===== LAUFZEIT =====
  sectionHeader("Laufzeit & Kündigung");
  fieldPair("Vertragsbeginn", formatDate(data.start_date), "Vertragsende", formatDate(data.end_date));
  fieldPair("Laufzeit", `${data.duration_months ?? 12} Monate`, "Kündigungsfrist", `${data.cancellation_period_months ?? 6} Monate zum Monatsende`);
  divider();
  ensureSpace();

  // ===== PREISÜBERSICHT =====
  sectionHeader("Preisübersicht");

  // Price cards row
  const cardW = (CW - 20) / 3;
  const cardH = 50;
  const cardY = y - cardH;

  // Card 1: Monatspreis
  page.drawRectangle({ x: M, y: cardY, width: cardW, height: cardH, color: C_BG_LIGHT, borderColor: C_LINE, borderWidth: 0.5 });
  text("Monatspreis", M + 10, cardY + cardH - 14, 7, font, C_MUTED);
  text(formatCurrency(data.monthly_price), M + 10, cardY + 10, 14, fontBold, C_NAVY);

  // Card 2: Einmalgebühr
  const c2x = M + cardW + 10;
  page.drawRectangle({ x: c2x, y: cardY, width: cardW, height: cardH, color: C_BG_LIGHT, borderColor: C_LINE, borderWidth: 0.5 });
  text("Einmalgebühr", c2x + 10, cardY + cardH - 14, 7, font, C_MUTED);
  text(formatCurrency(data.one_time_fee), c2x + 10, cardY + 10, 14, fontBold, C_NAVY);

  // Card 3: Rabatt
  const c3x = M + 2 * (cardW + 10);
  page.drawRectangle({ x: c3x, y: cardY, width: cardW, height: cardH, color: C_BG_LIGHT, borderColor: C_LINE, borderWidth: 0.5 });
  text("Rabatt", c3x + 10, cardY + cardH - 14, 7, font, C_MUTED);
  const discountVal = (data.discount_percent ?? 0) > 0 ? `${data.discount_percent}%` : "–";
  text(discountVal, c3x + 10, cardY + 10, 14, fontBold, (data.discount_percent ?? 0) > 0 ? rgb(0.1, 0.6, 0.3) : C_MUTED);

  y = cardY - 12;

  // Product price details (unit prices & promos)
  if (data.product_price_details && data.product_price_details.length > 0) {
    const detailProducts = data.product_price_details.filter(
      (pp) => pp.price_per_unit != null || pp.has_active_promo
    );
    if (detailProducts.length > 0) {
      y -= 4;
      for (const pp of detailProducts) {
        ensureSpace(50);
        // Product name
        text(pp.name, M + 4, y, 8, fontBold, C_TEXT);
        y -= 14;
        if (pp.has_active_promo && pp.promo_price != null) {
          // Show promo pricing
          const promoLabel = pp.promo_price_label || `${pp.promo_price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."}`;
          text("Aktionspreis: " + promoLabel, M + 4, y, 8, font, rgb(0.1, 0.6, 0.3));
          y -= 12;
          // Show regular price struck through (as reference)
          const regParts: string[] = [];
          if (pp.monthly_price > 0) regParts.push(`${pp.monthly_price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/Mon.`);
          if (pp.price_per_unit != null) regParts.push(`${pp.price_per_unit.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."}`);
          if (regParts.length > 0) {
            text("Regulaer: " + regParts.join(" + "), M + 4, y, 7, font, C_MUTED);
            y -= 12;
          }
          if (pp.promo_end_date) {
            text("Gueltig bis " + formatDate(pp.promo_end_date), M + 4, y, 7, font, C_MUTED);
            y -= 12;
          }
        } else if (pp.price_per_unit != null) {
          // Show unit price without promo
          text(`${pp.price_per_unit.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."}`, M + 4, y, 8, font, C_TEXT);
          y -= 12;
        }
        y -= 4;
      }
    }
  }

  // Info-Box: Gesamtpreis nach Ablauf der Aktion
  if (data.product_price_details && data.product_price_details.length > 0) {
    const promoProducts = data.product_price_details.filter((pp) => pp.has_active_promo);
    if (promoProducts.length > 0) {
      ensureSpace(80);
      y -= 4;
      const boxH = 58;
      const boxY = y - boxH;
      page.drawRectangle({ x: M, y: boxY, width: CW, height: boxH, color: rgb(1, 0.97, 0.92), borderColor: rgb(0.9, 0.75, 0.4), borderWidth: 0.8 });
      page.drawRectangle({ x: M, y: boxY, width: 3, height: boxH, color: rgb(0.9, 0.65, 0.1) });

      text("Info: Preis nach Ablauf der Aktion", M + 12, boxY + boxH - 14, 8, fontBold, rgb(0.5, 0.35, 0.05));

      // Total monthly after base fee waiver ends
      let totalAfterPromo = 0;
      for (const pp of data.product_price_details) {
        totalAfterPromo += pp.monthly_price;
      }
      // Unit prices: promo unit price is permanent, regular unit price only for non-promo products
      const unitHints: string[] = [];
      for (const pp of data.product_price_details) {
        if (pp.has_active_promo && pp.promo_price != null) {
          unitHints.push(`${pp.name}: ${pp.promo_price.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."} (dauerhaft)`);
        } else if (pp.price_per_unit != null) {
          unitHints.push(`${pp.name}: ${pp.price_per_unit.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/${pp.price_per_unit_label || "Stk."}`);
        }
      }

      let afterLine = `Grundgebuehr: ${totalAfterPromo.toLocaleString("de-DE", { minimumFractionDigits: 2 })} EUR/Mon.`;
      if (unitHints.length > 0) afterLine += "  +  " + unitHints.join(", ");
      text(afterLine, M + 12, boxY + boxH - 28, 7.5, font, rgb(0.25, 0.2, 0.05), CW - 24);

      // Show when base fee waiver ends (use promo_base_fee_end_date if available)
      const baseFeeEndDates = promoProducts
        .filter((pp) => pp.promo_base_fee_end_date)
        .map((pp) => pp.promo_base_fee_end_date!);
      const promoEndDates = promoProducts
        .filter((pp) => pp.promo_end_date)
        .map((pp) => pp.promo_end_date!);

      const baseFeeEnd = baseFeeEndDates.sort()[0];
      if (baseFeeEnd) {
        text("Grundgebuehr regulaer ab " + formatDate(baseFeeEnd) + "  |  Stueckpreis dauerhaft reduziert", M + 12, boxY + boxH - 40, 7, font, C_MUTED, CW - 24);
      } else {
        const promoEnd = promoEndDates.sort()[0];
        if (promoEnd) {
          text("Regulaere Preise gelten ab " + formatDate(promoEnd), M + 12, boxY + boxH - 40, 7, font, C_MUTED);
        }
      }

      y = boxY - 8;
    }
  }

  const intervalLabels: Record<string, string> = {
    monatlich: "Monatlich", quartalsweise: "Quartalsweise", jaehrlich: "Jährlich",
  };
  fieldPair("Zahlungsintervall", intervalLabels[data.payment_interval || "monatlich"] || data.payment_interval || "Monatlich", "", "");
  divider();
  ensureSpace();

  // ===== SEPA =====
  sectionHeader("SEPA-Lastschrifteinzug");
  fieldFull("Kontoinhaber", data.kontoinhaber || "–");
  fieldPair("IBAN", data.iban || "–", "BIC", data.bic || "–");
  divider();
  ensureSpace(140);

  // ===== UNTERSCHRIFT =====
  sectionHeader("Unterschrift");
  if (data.signature_data && data.signature_data.startsWith("data:image")) {
    try {
      const base64 = data.signature_data.split(",")[1];
      const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pngImage = await doc.embedPng(imgBytes);
      const sigW = 200;
      const sigH = (pngImage.height / pngImage.width) * sigW;
      page.drawImage(pngImage, { x: M + 4, y: y - sigH, width: sigW, height: sigH });
      y -= sigH + 10;
    } catch {
      text("(Unterschrift konnte nicht geladen werden)", M + 4, y, 8, font, C_MUTED);
      y -= 15;
    }
  } else {
    page.drawLine({ start: { x: M + 4, y }, end: { x: M + 250, y }, thickness: 0.5, color: C_TEXT });
    y -= 8;
    text("Datum, Unterschrift", M + 4, y, 7, font, C_MUTED);
    y -= 15;
  }

  // ===== NOTIZEN =====
  if (data.notes) {
    ensureSpace(60);
    divider();
    sectionHeader("Notizen");
    text(data.notes, M + 4, y, 9, font, C_TEXT, CW - 8);
    y -= 15;
  }

  // ===== FOOTER =====
  drawFooter();

  return doc.save();
}
