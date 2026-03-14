import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface InvoicePosition {
  description: string;
  quantity: number;
  unit_price: number;
}

interface InvoicePdfData {
  invoice_number: string;
  customer_name: string;
  customer_number?: string | null;
  adresse?: string | null;
  plz?: string | null;
  ort?: string | null;
  rechnungs_email?: string | null;
  invoice_date: string;
  due_date?: string | null;
  positions: InvoicePosition[];
  net_amount: number;
  tax_rate: number;
  tax_amount: number;
  gross_amount: number;
  status?: string;
  notes?: string | null;
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

function getGermanHolidays(year: number): Set<string> {
  const fmt = (d: Date) => d.toISOString().split("T")[0];
  const fixed = [
    `${year}-01-01`, `${year}-05-01`, `${year}-10-03`,
    `${year}-12-25`, `${year}-12-26`,
  ];
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const dv = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - dv - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);
  const add = (base: Date, days: number) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };
  const movable = [add(easter, -2), add(easter, 1), add(easter, 39), add(easter, 50), add(easter, 60)];
  return new Set([...fixed, ...movable.map(fmt)]);
}

function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from);
  const h1 = getGermanHolidays(from.getFullYear());
  const h2 = getGermanHolidays(from.getFullYear() + 1);
  const allHolidays = new Set([...h1, ...h2]);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    const ds = result.toISOString().split("T")[0];
    if (dow !== 0 && dow !== 6 && !allHolidays.has(ds)) added++;
  }
  return result;
}

export async function generateInvoicePdfV2(
  data: InvoicePdfData,
  logoBytes?: ArrayBuffer
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const ML = 56; // left margin
  const MR = 56; // right margin
  const CW = PAGE_W - ML - MR;
  const mmToPt = 2.8346;

  // Colors - blue-based scheme
  const C_NAVY    = rgb(0.044, 0.212, 0.498); // #0b367f
  const C_RED     = rgb(0.714, 0.098, 0.239);
  const C_TEXT    = rgb(0.12, 0.12, 0.14);
  const C_MUTED   = rgb(0.35, 0.37, 0.42);
  const C_LINE    = rgb(0.044, 0.212, 0.498); // blue lines
  const C_LINE_LIGHT = rgb(0.75, 0.80, 0.88);
  const C_WHITE   = rgb(1, 1, 1);
  const C_GREEN   = rgb(0.09, 0.56, 0.28);
  const C_BG_LIGHT = rgb(0.95, 0.96, 0.98);
  const C_STATUS_RED = rgb(0.714, 0.098, 0.239);

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

  // ===== LOGO & STATUS HEADER =====
  let embeddedLogo: Awaited<ReturnType<typeof doc.embedJpg>> | null = null;
  if (logoBytes) {
    try { embeddedLogo = await doc.embedJpg(logoBytes); } catch { /* skip */ }
  }

  const headerTop = PAGE_H - 36;

  // Logo top-left
  if (embeddedLogo) {
    const logoH = 42;
    const logoW = (embeddedLogo.width / embeddedLogo.height) * logoH;
    page.drawImage(embeddedLogo, { x: ML, y: headerTop - logoH + 10, width: logoW, height: logoH });
    // Subtitle below logo
    text("ein Geschäftsbereich der MCC Medical CareCapital GmbH", ML, headerTop - logoH - 2, 7, font, C_MUTED);
  } else {
    text("HFX Honorarfuchs", ML, headerTop, 18, fontBold, C_NAVY);
    text("ein Geschäftsbereich der MCC Medical CareCapital GmbH", ML, headerTop - 16, 7, font, C_MUTED);
  }

  // Status badge top-right
  const statusLabels: Record<string, string> = {
    entwurf: "ENTWURF", versendet: "VERSENDET", bezahlt: "BEZAHLT", storniert: "STORNIERT",
  };
  const st = data.status || "entwurf";
  const stLabel = statusLabels[st] || st.toUpperCase();
  const stBg = st === "bezahlt" ? C_GREEN : st === "storniert" ? C_MUTED : C_STATUS_RED;
  const badgeW = fontBold.widthOfTextAtSize(stLabel, 9) + 20;
  const badgeH = 22;
  const badgeX = PAGE_W - MR - badgeW;
  const badgeY = headerTop - 18;
  page.drawRectangle({ x: badgeX, y: badgeY, width: badgeW, height: badgeH, color: stBg });
  text(stLabel, badgeX + 10, badgeY + 6, 9, fontBold, C_WHITE);

  // ===== SENDER LINE =====
  y = headerTop - 60;
  text("HFX Honorarfuchs · Hohenzollernstr. 47 · 47799 Krefeld", ML, y, 7, font, C_MUTED);
  y -= 4;
  page.drawLine({ start: { x: ML, y }, end: { x: ML + 220, y }, thickness: 0.3, color: C_LINE_LIGHT });
  y -= 14;

  // ===== TWO-COLUMN: RECIPIENT + METADATA =====
  const leftColW = CW * 0.46;
  const rightColX = ML + CW * 0.50;
  const rightColW = CW * 0.50;
  const boxTop = y;

  // --- Recipient box (with border) ---
  const recipientLines: string[] = [];
  recipientLines.push(data.customer_name);
  if (data.adresse) recipientLines.push(data.adresse);
  if (data.plz || data.ort) recipientLines.push([data.plz, data.ort].filter(Boolean).join(" "));
  if (data.rechnungs_email) recipientLines.push(data.rechnungs_email);

  const recipLineH = 13;
  const recipBoxH = 18 + recipientLines.length * recipLineH + 10; // header + lines + padding

  // Draw recipient box border
  page.drawRectangle({ x: ML, y: boxTop - recipBoxH, width: leftColW, height: recipBoxH, color: C_WHITE });
  page.drawLine({ start: { x: ML, y: boxTop }, end: { x: ML + leftColW, y: boxTop }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: ML, y: boxTop - recipBoxH }, end: { x: ML + leftColW, y: boxTop - recipBoxH }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: ML, y: boxTop }, end: { x: ML, y: boxTop - recipBoxH }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: ML + leftColW, y: boxTop }, end: { x: ML + leftColW, y: boxTop - recipBoxH }, thickness: 0.8, color: C_LINE });

  // Header row
  text("Rechnung an", ML + 8, boxTop - 12, 7.5, fontBold, C_NAVY);
  let ry = boxTop - 26;
  recipientLines.forEach((line, i) => {
    const isFirst = i === 0;
    text(line, ML + 8, ry, isFirst ? 10 : 8.5, isFirst ? fontBold : font, C_TEXT);
    ry -= recipLineH;
  });

  // --- Metadata table (right column, bordered rows) ---
  const invoiceDateObj = new Date(data.invoice_date);
  const collectionDate = addBusinessDays(invoiceDateObj, 3);

  const metaRows: [string, string][] = [
    ["Rechnungsnummer", data.invoice_number],
    ["Rechnungsdatum", formatDate(data.invoice_date)],
    ["Kundennummer", data.customer_number || "–"],
    ["Leistungszeitraum", formatDate(data.invoice_date).substring(3)], // month/year
    ["Einzugsdatum / Fälligkeit", formatDate(collectionDate.toISOString().split("T")[0])],
    ["Zahlungsart", "SEPA-Lastschrift"],
  ];

  const metaRowH = recipBoxH / metaRows.length;
  const metaLabelW = rightColW * 0.48;

  // Outer border
  page.drawRectangle({ x: rightColX, y: boxTop - recipBoxH, width: rightColW, height: recipBoxH, color: C_WHITE });
  // Border lines
  page.drawLine({ start: { x: rightColX, y: boxTop }, end: { x: rightColX + rightColW, y: boxTop }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: rightColX, y: boxTop - recipBoxH }, end: { x: rightColX + rightColW, y: boxTop - recipBoxH }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: rightColX, y: boxTop }, end: { x: rightColX, y: boxTop - recipBoxH }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: rightColX + rightColW, y: boxTop }, end: { x: rightColX + rightColW, y: boxTop - recipBoxH }, thickness: 0.8, color: C_LINE });
  // Vertical divider
  page.drawLine({ start: { x: rightColX + metaLabelW, y: boxTop }, end: { x: rightColX + metaLabelW, y: boxTop - recipBoxH }, thickness: 0.4, color: C_LINE_LIGHT });

  metaRows.forEach((row, i) => {
    const rowY = boxTop - i * metaRowH;
    // Horizontal divider between rows
    if (i > 0) {
      page.drawLine({ start: { x: rightColX, y: rowY }, end: { x: rightColX + rightColW, y: rowY }, thickness: 0.4, color: C_LINE_LIGHT });
    }
    const textY = rowY - metaRowH / 2 - 3;
    text(row[0], rightColX + 6, textY, 7.5, fontBold, C_TEXT);
    text(row[1], rightColX + metaLabelW + 6, textY, 8, font, C_TEXT);
  });

  y = boxTop - recipBoxH - 24;

  // ===== "RECHNUNG" TITLE =====
  text("RECHNUNG", ML, y, 20, fontBold, C_TEXT);
  y -= 28;

  // ===== INTRO TEXT =====
  text("Sehr geehrte Damen und Herren,", ML, y, 9, font, C_TEXT);
  y -= 18;
  text("wir berechnen Ihnen für den angegebenen Zeitraum folgende Leistungen:", ML, y, 9, font, C_TEXT);
  y -= 22;

  // ===== POSITIONS TABLE (bordered, with Pos. column) =====
  const COL_POS   = ML;
  const COL_POS_W = 36;
  const COL_DESC  = ML + COL_POS_W;
  const COL_QTY   = ML + CW * 0.58;
  const COL_UNIT  = ML + CW * 0.72;
  const COL_TOTAL = ML + CW * 0.86;
  const TABLE_RIGHT = PAGE_W - MR;

  // Table header
  const theadH = 22;
  const theadY = y;
  // Header bg
  page.drawRectangle({ x: ML, y: theadY - theadH + 10, width: CW, height: theadH, color: C_BG_LIGHT });
  // Top border
  page.drawLine({ start: { x: ML, y: theadY + 10 }, end: { x: TABLE_RIGHT, y: theadY + 10 }, thickness: 1, color: C_LINE });
  // Bottom of header
  page.drawLine({ start: { x: ML, y: theadY - theadH + 10 }, end: { x: TABLE_RIGHT, y: theadY - theadH + 10 }, thickness: 0.8, color: C_LINE });

  text("Pos.",           COL_POS + 6,  y, 8, fontBold, C_NAVY);
  text("Beschreibung",   COL_DESC + 6, y, 8, fontBold, C_NAVY);
  text("Menge",          COL_QTY,      y, 8, fontBold, C_NAVY);
  text("Einzelpreis",    COL_UNIT,     y, 8, fontBold, C_NAVY);
  text("Gesamt",         COL_TOTAL,    y, 8, fontBold, C_NAVY);
  y -= theadH;

  // Wrap helper
  const wrapText = (t: string, size: number, maxW: number): string[] => {
    const words = t.split(" ");
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxW && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [""];
  };

  const descMaxW = COL_QTY - COL_DESC - 14;

  // Draw rows
  data.positions.forEach((pos, idx) => {
    const lineTotal = pos.quantity * pos.unit_price;
    const descLines = wrapText(pos.description, 8.5, descMaxW);
    const rowH = Math.max(24, descLines.length * 12 + 12);

    ensureSpace(rowH + 6);

    // Left & right borders
    page.drawLine({ start: { x: ML, y: y + 10 }, end: { x: ML, y: y - rowH + 10 }, thickness: 0.4, color: C_LINE_LIGHT });
    page.drawLine({ start: { x: TABLE_RIGHT, y: y + 10 }, end: { x: TABLE_RIGHT, y: y - rowH + 10 }, thickness: 0.4, color: C_LINE_LIGHT });
    // Pos. column separator
    page.drawLine({ start: { x: COL_DESC, y: y + 10 }, end: { x: COL_DESC, y: y - rowH + 10 }, thickness: 0.3, color: C_LINE_LIGHT });

    // Row bottom border
    page.drawLine({ start: { x: ML, y: y - rowH + 10 }, end: { x: TABLE_RIGHT, y: y - rowH + 10 }, thickness: 0.4, color: C_LINE_LIGHT });

    // Pos. number
    const midY = y - rowH / 2 + 6;
    text(String(idx + 1), COL_POS + 14, midY, 8.5, font, C_TEXT);

    // Description lines
    descLines.forEach((line, li) => {
      text(line, COL_DESC + 6, y - 4 - li * 12, 8.5, font, C_TEXT);
    });

    // Numeric columns centered
    text(String(pos.quantity),           COL_QTY + 8,   midY, 8.5, font, C_TEXT);
    text(formatCurrency(pos.unit_price), COL_UNIT,      midY, 8.5, font, C_TEXT);
    text(formatCurrency(lineTotal),      COL_TOTAL,     midY, 8.5, fontBold, C_TEXT);

    y -= rowH;
  });

  // Bottom border of table
  page.drawLine({ start: { x: ML, y: y + 10 }, end: { x: TABLE_RIGHT, y: y + 10 }, thickness: 1, color: C_LINE });
  y -= 6;

  // ===== ZAHLUNGSHINWEIS + TOTALS (side by side) =====
  ensureSpace(100);

  const payBoxX = ML;
  const payBoxW = CW * 0.52;
  const totalsX = ML + CW * 0.56;
  const totalsW = CW * 0.44;
  const totalsRight = PAGE_W - MR;

  // Calculate collection date
  const collectionFormatted = collectionDate.toLocaleDateString("de-DE");

  // Zahlungshinweis box
  const payTop = y;
  text("Zahlungshinweis", payBoxX, payTop, 9, fontBold, C_NAVY);
  y -= 16;
  text(`Zahlungsart: Automatischer SEPA-Einzug`, payBoxX, y, 8, font, C_TEXT, payBoxW);
  y -= 13;
  text(`Hinweis: Der Betrag wird am ${collectionFormatted}`, payBoxX, y, 8, font, C_TEXT, payBoxW);
  y -= 11;
  text("automatisch eingezogen.", payBoxX, y, 8, font, C_TEXT, payBoxW);
  y -= 13;
  if (data.tax_rate > 0) {
    text(`Im ausgewiesenen Betrag sind ${formatCurrency(data.tax_amount)}`, payBoxX, y, 7.5, font, C_MUTED, payBoxW);
    y -= 10;
    text(`Umsatzsteuer (${data.tax_rate} %) enthalten.`, payBoxX, y, 7.5, font, C_MUTED, payBoxW);
  } else {
    text("Gemäß § 4 UStG ist diese Leistung umsatzsteuerfrei.", payBoxX, y, 7.5, font, C_MUTED, payBoxW);
  }

  // Totals (right side, table style with borders)
  let ty = payTop;
  const totalsRowH = 22;
  const totalsLabelW = totalsW * 0.55;

  // Helper for totals row
  const drawTotalsRow = (label: string, value: string, isBold = false, topBorder = false) => {
    if (topBorder) {
      page.drawLine({ start: { x: totalsX, y: ty + 10 }, end: { x: totalsRight, y: ty + 10 }, thickness: 0.8, color: C_LINE });
    }
    // Row bottom border
    page.drawLine({ start: { x: totalsX, y: ty - totalsRowH + 10 }, end: { x: totalsRight, y: ty - totalsRowH + 10 }, thickness: 0.4, color: C_LINE_LIGHT });
    // Side borders
    page.drawLine({ start: { x: totalsX, y: ty + 10 }, end: { x: totalsX, y: ty - totalsRowH + 10 }, thickness: 0.4, color: C_LINE_LIGHT });
    page.drawLine({ start: { x: totalsRight, y: ty + 10 }, end: { x: totalsRight, y: ty - totalsRowH + 10 }, thickness: 0.4, color: C_LINE_LIGHT });

    const textY = ty - totalsRowH / 2 + 4;
    text(label, totalsX + 8, textY, 8.5, isBold ? fontBold : font, isBold ? C_NAVY : C_TEXT);
    rightText(value, totalsRight - 8, textY, isBold ? 10 : 8.5, isBold ? fontBold : font, isBold ? C_NAVY : C_TEXT);
    ty -= totalsRowH;
  };

  drawTotalsRow("Nettobetrag", formatCurrency(data.net_amount), false, true);

  const taxLabel = data.tax_rate === 0 ? "Steuerbefreit" : `MwSt. ${data.tax_rate} %`;
  drawTotalsRow(taxLabel, formatCurrency(data.tax_amount));

  // Gesamtbetrag (bold, thicker borders)
  page.drawLine({ start: { x: totalsX, y: ty + 10 }, end: { x: totalsRight, y: ty + 10 }, thickness: 1.5, color: C_LINE });
  const grossRowH = 26;
  page.drawRectangle({ x: totalsX, y: ty - grossRowH + 10, width: totalsW, height: grossRowH, color: C_BG_LIGHT });
  page.drawLine({ start: { x: totalsX, y: ty - grossRowH + 10 }, end: { x: totalsRight, y: ty - grossRowH + 10 }, thickness: 1.5, color: C_LINE });
  page.drawLine({ start: { x: totalsX, y: ty + 10 }, end: { x: totalsX, y: ty - grossRowH + 10 }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: totalsRight, y: ty + 10 }, end: { x: totalsRight, y: ty - grossRowH + 10 }, thickness: 0.8, color: C_LINE });
  const grossTextY = ty - grossRowH / 2 + 5;
  text("Gesamtbetrag", totalsX + 8, grossTextY, 10, fontBold, C_NAVY);
  rightText(formatCurrency(data.gross_amount), totalsRight - 8, grossTextY, 11, fontBold, C_NAVY);
  ty -= grossRowH;

  // Zahlstatus row
  const statusRowH = 22;
  page.drawLine({ start: { x: totalsX, y: ty + 10 }, end: { x: totalsRight, y: ty + 10 }, thickness: 0.4, color: C_LINE_LIGHT });
  page.drawLine({ start: { x: totalsX, y: ty - statusRowH + 10 }, end: { x: totalsRight, y: ty - statusRowH + 10 }, thickness: 0.8, color: C_LINE });
  page.drawLine({ start: { x: totalsX, y: ty + 10 }, end: { x: totalsX, y: ty - statusRowH + 10 }, thickness: 0.4, color: C_LINE_LIGHT });
  page.drawLine({ start: { x: totalsRight, y: ty + 10 }, end: { x: totalsRight, y: ty - statusRowH + 10 }, thickness: 0.4, color: C_LINE_LIGHT });
  const statusTextY = ty - statusRowH / 2 + 4;
  text("Zahlstatus", totalsX + 8, statusTextY, 8.5, fontBold, C_TEXT);
  const stColor = st === "bezahlt" ? C_GREEN : st === "storniert" ? C_RED : C_NAVY;
  rightText(stLabel.toLowerCase(), totalsRight - 8, statusTextY, 8.5, fontBold, stColor);

  y = Math.min(y, ty - statusRowH) - 24;

  // ===== NOTES =====
  if (data.notes) {
    ensureSpace(30);
    text(data.notes, ML, y, 8, font, C_MUTED, CW);
    y -= 18;
  }

  // ===== CLOSING =====
  ensureSpace(50);
  y -= 8;
  text("Mit freundlichen Grüßen", ML, y, 9, font, C_TEXT);
  y -= 16;
  text("HFX Honorarfuchs", ML, y, 10, fontBold, C_NAVY);

  drawFooter();

  return doc.save();
}
