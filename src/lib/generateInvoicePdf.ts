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

/** Returns German public holiday dates for a year */
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

export async function generateInvoicePdf(
  data: InvoicePdfData,
  logoBytes?: ArrayBuffer
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const M = 52;
  const CW = PAGE_W - 2 * M;

  const C_NAVY    = rgb(0.044, 0.212, 0.498);
  const C_RED     = rgb(0.714, 0.098, 0.239);
  const C_TEXT    = rgb(0.1, 0.1, 0.12);
  const C_MUTED   = rgb(0.42, 0.44, 0.50);
  const C_LINE    = rgb(0.80, 0.82, 0.86);
  const C_BG_ROW  = rgb(0.96, 0.97, 0.99);
  const C_WHITE   = rgb(1, 1, 1);
  const C_GREEN   = rgb(0.09, 0.56, 0.28);
  const C_ACCENT  = rgb(0.95, 0.96, 0.98);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const text = (t: string, x: number, yy: number, size: number, f = font, color = C_TEXT, maxW?: number) => {
    if (!t) return;
    page.drawText(t, { x, y: yy, size, font: f, color, maxWidth: maxW });
  };

  const ensureSpace = (needed = 80) => {
    if (y < M + needed) {
      drawFooter();
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  };

  const drawFooter = () => {
    const fY = 42;
    page.drawLine({ start: { x: M, y: fY + 24 }, end: { x: PAGE_W - M, y: fY + 24 }, thickness: 0.5, color: C_LINE });
    text("HFX Honorarfuchs – eine Marke der MCC Medical CareCapital GmbH  ·  Hohenzollernstr. 47, 47799 Krefeld", M, fY + 14, 6, font, C_MUTED);
    text("Geschäftsführung: Olaf Hagelkruys, Thilo Wiers-Keiser, Robbin Zielke  ·  Amtsgericht Krefeld, HRB 14709  ·  USt-Id-Nr: DE 227 420 712  ·  www.hfx-honorarfuchs.de", M, fY + 4, 6, font, C_MUTED);
  };

  const hRule = (thickness = 0.5, color = C_LINE) => {
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness, color });
  };

  // ===== HEADER =====
  const mmToPt = 2.8346;

  // Embed logo early (async), draw later when we know position
  let embeddedLogo: Awaited<ReturnType<typeof doc.embedPng>> | null = null;
  if (logoBytes) {
    try { embeddedLogo = await doc.embedPng(logoBytes); } catch { try { embeddedLogo = await doc.embedJpg(logoBytes); } catch { /* skip */ } }
  }

  // Status label/colors (drawn inside metadata box later)
  const statusLabels: Record<string, string> = {
    entwurf: "ENTWURF", versendet: "VERSENDET", bezahlt: "BEZAHLT", storniert: "STORNIERT",
  };
  const C_LIGHT_BLUE_BG = rgb(0.88, 0.93, 1.0);
  const st = data.status || "entwurf";
  const stLabel = statusLabels[st] || st.toUpperCase();
  const stFg = st === "storniert" ? C_RED : st === "bezahlt" ? C_GREEN : C_NAVY;

  // ===== ADDRESS SECTION =====
  // 45mm from top edge of page to sender line
  const ADDR_TOP_MM = 45;
  y = PAGE_H - ADDR_TOP_MM * mmToPt;

  // Sender line (small, without company name)
  text("HFX Honorarfuchs · Hohenzollernstr. 47 · 47799 Krefeld", M, y, 6, font, C_MUTED);
  y -= 3;
  page.drawLine({ start: { x: M, y }, end: { x: M + 180, y }, thickness: 0.3, color: C_LINE });
  y -= 14;

  // Two-column layout: Recipient left, invoice details right
  const colLeft = M;
  const colRight = M + CW * 0.53;

  // --- Recipient ---
  const recipientStartY = y;
  text(data.customer_name, colLeft, y, 11.5, fontBold, C_TEXT);
  y -= 15;
  if (data.adresse) { text(data.adresse, colLeft, y, 9.5, font, C_TEXT); y -= 13; }
  if (data.plz || data.ort) {
    text([data.plz, data.ort].filter(Boolean).join(" "), colLeft, y, 9.5, font, C_TEXT);
    y -= 13;
  }
  if (data.rechnungs_email) { text(data.rechnungs_email, colLeft, y, 8.5, font, C_MUTED); y -= 13; }

  // --- Invoice metadata (right column) ---
  const metaY = recipientStartY;
  const metaLabelX = colRight;
  const metaValueX = colRight + 90;
  const metaBoxW = CW - (colRight - M) + 8;
  const metaBoxLeft = colRight - 8;
  const metaBoxRight = metaBoxLeft + metaBoxW;

  // Logo: 45mm from top edge, right-aligned to metadata box
  if (embeddedLogo) {
    const logoH = 40;
    const logoW = (embeddedLogo.width / embeddedLogo.height) * logoH;
    const LOGO_TOP_MM = 35;
    const logoX = metaBoxRight - logoW;
    const logoY = PAGE_H - LOGO_TOP_MM * mmToPt;
    page.drawImage(embeddedLogo, { x: logoX, y: logoY, width: logoW, height: logoH });
  }

  // Box behind metadata
  const metaBoxH = 80;
  page.drawRectangle({ x: metaBoxLeft, y: metaY - metaBoxH + 14, width: metaBoxW, height: metaBoxH, color: C_ACCENT });

  text("Rechnungsnummer:", metaLabelX, metaY, 7.5, font, C_MUTED);
  text(data.invoice_number, metaValueX, metaY, 9.5, fontBold, C_NAVY);

  // Status badge inside metadata box, right-aligned on the invoice number line
  const badgeW = font.widthOfTextAtSize(stLabel, 7.5) + 14;
  const badgeX = metaBoxRight - badgeW - 6;
  page.drawRectangle({ x: badgeX, y: metaY - 5, width: badgeW, height: 16, color: C_LIGHT_BLUE_BG });
  text(stLabel, badgeX + 7, metaY, 7.5, fontBold, stFg);

  text("Rechnungsdatum:", metaLabelX, metaY - 16, 7.5, font, C_MUTED);
  text(formatDate(data.invoice_date), metaValueX, metaY - 16, 9, font, C_TEXT);

  // Collection date: invoice_date + 3 business days
  const invoiceDateObj = new Date(data.invoice_date);
  const collectionDate = addBusinessDays(invoiceDateObj, 3);
  text("Einzugsdatum:", metaLabelX, metaY - 32, 7.5, font, C_MUTED);
  text(formatDate(collectionDate.toISOString().split("T")[0]), metaValueX, metaY - 32, 9, font, C_TEXT);

  if (data.customer_number) {
    text("Kundennummer:", metaLabelX, metaY - 48, 7.5, font, C_MUTED);
    text(data.customer_number, metaValueX, metaY - 48, 9, font, C_TEXT);
  }

  // Advance y to below both columns
  y = Math.min(y, metaY - metaBoxH + 10);
  y -= 20;

  y -= 14;

  // ===== SUBJECT LINE =====
  text(`Rechnung ${data.invoice_number}`, M, y, 13.5, fontBold, C_NAVY);
  y -= 16;
  text("Automatischer SEPA-Einzug / Stripe-Lastschrift", M, y, 8, font, C_MUTED);
  y -= 22;

  // ===== POSITIONS TABLE =====
  const COL_DESC  = M;
  const COL_QTY   = M + CW * 0.55;
  const COL_UNIT  = M + CW * 0.68;
  const COL_TOTAL = M + CW * 0.84;
  const TABLE_W   = CW;

  // Table header – light background instead of solid navy
  const theadH = 20;
  page.drawRectangle({ x: M, y: y - theadH + 14, width: TABLE_W, height: theadH, color: C_ACCENT });
  page.drawLine({ start: { x: M, y: y - theadH + 14 }, end: { x: M + TABLE_W, y: y - theadH + 14 }, thickness: 1, color: C_NAVY });
  text("Beschreibung",  COL_DESC  + 6, y, 8, fontBold, C_NAVY);
  text("Menge",         COL_QTY,       y, 8, fontBold, C_NAVY);
  text("Einzelpreis",   COL_UNIT,      y, 8, fontBold, C_NAVY);
  text("Gesamtpreis",   COL_TOTAL,     y, 8, fontBold, C_NAVY);
  y -= theadH + 2;

  // Helper: wrap text into lines respecting maxWidth
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

  // Rows
  let rowBg = false;
  const descMaxW = COL_QTY - COL_DESC - 14;
  const rowFontSize = 8.5;
  const lineSpacing = 12;
  const rowPadV = 7; // vertical padding top+bottom

  for (const pos of data.positions) {
    const lineTotal = pos.quantity * pos.unit_price;
    const descLines = wrapText(pos.description, rowFontSize, descMaxW);
    const rowH = Math.max(22, descLines.length * lineSpacing + rowPadV * 2);

    ensureSpace(rowH + 6);

    if (rowBg) {
      page.drawRectangle({ x: M, y: y - rowH + 14, width: TABLE_W, height: rowH, color: C_BG_ROW });
    }

    // Draw description lines: start from top of row, padding down
    const firstLineY = y - rowPadV;
    descLines.forEach((line, li) => {
      text(line, COL_DESC + 6, firstLineY - li * lineSpacing, rowFontSize, font, C_TEXT);
    });

    // Numeric columns: vertically centred in row
    const midY = y - rowH / 2 + 5;
    text(String(pos.quantity),                COL_QTY,   midY, rowFontSize, font, C_TEXT);
    text(formatCurrency(pos.unit_price),      COL_UNIT,  midY, rowFontSize, font, C_TEXT);
    text(formatCurrency(lineTotal),           COL_TOTAL, midY, rowFontSize, fontBold, C_TEXT);

    y -= rowH;
    rowBg = !rowBg;
  }

  // Bottom border of table
  page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + TABLE_W, y: y + 4 }, thickness: 0.5, color: C_LINE });
  y -= 10;

  // ===== TOTALS BLOCK =====
  ensureSpace(90);
  const totalsX = M + CW * 0.56;
  const totalsLabelX = totalsX;
  const totalsValueX = PAGE_W - M - 2;
  const totalsW = PAGE_W - M - totalsX;

  // Netto
  text("Nettobetrag:", totalsLabelX, y, 9, font, C_MUTED);
  const netStr = formatCurrency(data.net_amount);
  text(netStr, totalsValueX - font.widthOfTextAtSize(netStr, 9), y, 9, font, C_TEXT);
  y -= 22;

  // MwSt
  const taxLabel = data.tax_rate === 0 ? "Steuerbefreit (§ 4 UStG):" : `MwSt. ${data.tax_rate}%:`;
  text(taxLabel, totalsLabelX, y, 9, font, C_MUTED);
  const taxStr = formatCurrency(data.tax_amount);
  text(taxStr, totalsValueX - font.widthOfTextAtSize(taxStr, 9), y, 9, font, C_TEXT);
  y -= 18;

  page.drawLine({ start: { x: totalsLabelX - 4, y: y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: C_LINE });
  y -= 14;

  // Gross total highlighted – light background with navy border
  const grossBoxH = 36;
  const grossBoxY = y - grossBoxH;
  page.drawRectangle({ x: totalsLabelX - 8, y: grossBoxY, width: totalsW + 8, height: grossBoxH, color: C_ACCENT });
  page.drawLine({ start: { x: totalsLabelX - 8, y: grossBoxY + grossBoxH }, end: { x: PAGE_W - M, y: grossBoxY + grossBoxH }, thickness: 1.5, color: C_NAVY });
  page.drawLine({ start: { x: totalsLabelX - 8, y: grossBoxY }, end: { x: PAGE_W - M, y: grossBoxY }, thickness: 1.5, color: C_NAVY });
  const grossTextY = grossBoxY + grossBoxH / 2 - 5;
  text("Gesamtbetrag (brutto):", totalsLabelX, grossTextY, 9.5, fontBold, C_NAVY);
  const grossStr = formatCurrency(data.gross_amount);
  text(grossStr, totalsValueX - fontBold.widthOfTextAtSize(grossStr, 12), grossTextY, 12, fontBold, C_NAVY);
  y = grossBoxY - 18;

  // ===== PAYMENT NOTICE =====
  ensureSpace(70);
  const payBoxH = 40;
  page.drawRectangle({ x: M, y: y - payBoxH + 14, width: CW, height: payBoxH, color: rgb(0.93, 0.97, 0.93) });
  page.drawRectangle({ x: M, y: y - payBoxH + 14, width: 4, height: payBoxH, color: C_GREEN });
  text("Automatischer Einzug", M + 12, y, 9, fontBold, C_GREEN);
  y -= 14;
  const collectionFormatted = collectionDate.toLocaleDateString("de-DE");
  text(`Der Betrag von ${formatCurrency(data.gross_amount)} wird automatisch am ${collectionFormatted} per SEPA-Lastschrift eingezogen.`, M + 12, y, 8, font, C_TEXT, CW - 20);
  y -= payBoxH - 14 + 14;

  // ===== NOTES =====
  if (data.notes) {
    ensureSpace(40);
    y -= 4;
    const noteBoxH = 22;
    page.drawRectangle({ x: M, y: y - noteBoxH + 14, width: CW, height: noteBoxH, color: C_ACCENT });
    page.drawRectangle({ x: M, y: y - noteBoxH + 14, width: 4, height: noteBoxH, color: C_NAVY });
    text(data.notes, M + 12, y, 8, font, C_TEXT, CW - 20);
    y -= noteBoxH + 8;
  }

  // ===== TAX NOTE =====
  y -= 8;
  ensureSpace(20);
  if (data.tax_rate === 0) {
    text("Gemäß § 4 UStG ist diese Leistung umsatzsteuerfrei.", M, y, 7.5, font, C_MUTED, CW);
  } else {
    text(`Im ausgewiesenen Betrag sind ${formatCurrency(data.tax_amount)} Umsatzsteuer (${data.tax_rate} %) enthalten.`, M, y, 7.5, font, C_MUTED, CW);
  }

  drawFooter();

  return doc.save();
}
