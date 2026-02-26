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

export async function generateInvoicePdf(
  data: InvoicePdfData,
  logoBytes?: ArrayBuffer
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const M = 48;
  const CW = PAGE_W - 2 * M;

  const C_NAVY = rgb(0.044, 0.212, 0.498);
  const C_RED = rgb(0.714, 0.098, 0.239);
  const C_TEXT = rgb(0.12, 0.12, 0.12);
  const C_MUTED = rgb(0.4, 0.42, 0.48);
  const C_LINE = rgb(0.82, 0.84, 0.88);
  const C_BG_LIGHT = rgb(0.95, 0.96, 0.98);
  const C_WHITE = rgb(1, 1, 1);
  const C_GREEN = rgb(0.1, 0.6, 0.3);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H;

  const text = (t: string, x: number, yy: number, size: number, f = font, color = C_TEXT, maxW?: number) => {
    page.drawText(t || "", { x, y: yy, size, font: f, color, maxWidth: maxW });
  };

  const ensureSpace = (needed = 80) => {
    if (y < M + needed) {
      drawFooter();
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  };

  const drawFooter = () => {
    const fY = 30;
    page.drawLine({ start: { x: M, y: fY + 12 }, end: { x: PAGE_W - M, y: fY + 12 }, thickness: 0.4, color: C_LINE });
    text("HFX Honorarfuchs GmbH · Steuer-Nr: XX/XXX/XXXXX · USt-IdNr: DEXXXXXXXXX · IBAN: DEXX XXXX XXXX XXXX XXXX XX", M, fY, 5.5, font, C_MUTED);
  };

  const divider = () => {
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.4, color: C_LINE });
    y -= 10;
  };

  // ===== HEADER =====
  const headerH = 56;
  page.drawRectangle({ x: 0, y: PAGE_H - headerH, width: PAGE_W, height: headerH, color: C_NAVY });

  let logoXEnd = M + 4;
  if (logoBytes) {
    try {
      const logoImage = await doc.embedJpg(logoBytes);
      const logoH = 30;
      const logoW = (logoImage.width / logoImage.height) * logoH;
      page.drawImage(logoImage, { x: M, y: PAGE_H - headerH + 13, width: logoW, height: logoH });
      logoXEnd = M + logoW + 10;
    } catch {
      // continue without logo
    }
  }

  text("HFX Honorarfuchs", logoXEnd, PAGE_H - headerH + 24, 16, fontBold, C_WHITE);
  text("Rechnung", logoXEnd, PAGE_H - headerH + 10, 9, font, rgb(0.75, 0.8, 0.9));

  // Status badge
  const statusLabels: Record<string, string> = {
    entwurf: "ENTWURF", versendet: "VERSENDET", bezahlt: "BEZAHLT", storniert: "STORNIERT",
  };
  const statusColors: Record<string, { bg: ReturnType<typeof rgb>; fg: ReturnType<typeof rgb> }> = {
    entwurf: { bg: rgb(0.85, 0.86, 0.9), fg: C_NAVY },
    versendet: { bg: rgb(0.2, 0.5, 0.85), fg: C_WHITE },
    bezahlt: { bg: C_GREEN, fg: C_WHITE },
    storniert: { bg: C_RED, fg: C_WHITE },
  };
  const st = data.status || "entwurf";
  const stLabel = statusLabels[st] || st.toUpperCase();
  const stColor = statusColors[st] || statusColors.entwurf;
  const badgeW = font.widthOfTextAtSize(stLabel, 8) + 16;
  const badgeX = PAGE_W - M - badgeW;
  page.drawRectangle({ x: badgeX, y: PAGE_H - headerH + 20, width: badgeW, height: 18, color: stColor.bg });
  text(stLabel, badgeX + 8, PAGE_H - headerH + 24, 8, fontBold, stColor.fg);

  y = PAGE_H - headerH - 18;

  // ===== SENDER (Absender in kleiner Schrift über Empfängeradresse) =====
  text("HFX Honorarfuchs GmbH · Musterstraße 1 · 12345 Musterstadt", M, y, 7, font, C_MUTED);
  y -= 20;

  // ===== EMPFÄNGER-BLOCK =====
  text(data.customer_name, M, y, 11, fontBold, C_TEXT);
  y -= 14;
  if (data.adresse) {
    text(data.adresse, M, y, 9.5, font, C_TEXT);
    y -= 13;
  }
  if (data.plz || data.ort) {
    text([data.plz, data.ort].filter(Boolean).join(" "), M, y, 9.5, font, C_TEXT);
    y -= 13;
  }
  y -= 8;

  // ===== RECHNUNGSDETAILS (rechtsbündig) =====
  const detailX = M + CW / 2;
  const detailLabelX = detailX;
  const detailValueX = detailX + 80;

  // Rechts neben Empfänger
  const detailStartY = PAGE_H - headerH - 18 - 4;
  page.drawLine({ start: { x: detailX - 10, y: detailStartY + 5 }, end: { x: detailX - 10, y: detailStartY - 65 }, thickness: 0.4, color: C_LINE });

  text("Rechnungsnummer:", detailLabelX, detailStartY, 7, font, C_MUTED);
  text(data.invoice_number, detailValueX, detailStartY, 9, fontBold, C_NAVY);

  text("Rechnungsdatum:", detailLabelX, detailStartY - 16, 7, font, C_MUTED);
  text(formatDate(data.invoice_date), detailValueX, detailStartY - 16, 9, font, C_TEXT);

  if (data.due_date) {
    text("Zahlungsziel:", detailLabelX, detailStartY - 32, 7, font, C_MUTED);
    text(formatDate(data.due_date), detailValueX, detailStartY - 32, 9, font, C_TEXT);
  }

  if (data.customer_number) {
    text("Kundennummer:", detailLabelX, detailStartY - 48, 7, font, C_MUTED);
    text(data.customer_number, detailValueX, detailStartY - 48, 9, font, C_TEXT);
  }

  // Adjust y to be below both blocks
  y = Math.min(y, PAGE_H - headerH - 18 - 75);
  y -= 8;
  divider();

  // ===== TITEL =====
  text(`Rechnung ${data.invoice_number}`, M, y, 13, fontBold, C_NAVY);
  y -= 24;

  // ===== POSITIONEN TABLE =====
  // Header
  const colDesc = M;
  const colQty = M + CW * 0.55;
  const colUnit = M + CW * 0.68;
  const colTotal = M + CW * 0.85;

  page.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: C_NAVY });
  text("Beschreibung", colDesc + 4, y + 1, 8, fontBold, C_WHITE);
  text("Menge", colQty, y + 1, 8, fontBold, C_WHITE);
  text("Einzelpreis", colUnit, y + 1, 8, fontBold, C_WHITE);
  text("Gesamtpreis", colTotal, y + 1, 8, fontBold, C_WHITE);
  y -= 22;

  // Rows
  let rowBg = false;
  for (const pos of data.positions) {
    ensureSpace(30);
    const rowH = 18;
    if (rowBg) {
      page.drawRectangle({ x: M, y: y - 4, width: CW, height: rowH, color: C_BG_LIGHT });
    }
    const lineTotal = pos.quantity * pos.unit_price;
    text(pos.description, colDesc + 4, y + 1, 9, font, C_TEXT, colQty - colDesc - 8);
    text(String(pos.quantity), colQty, y + 1, 9, font, C_TEXT);
    text(formatCurrency(pos.unit_price), colUnit, y + 1, 9, font, C_TEXT);
    text(formatCurrency(lineTotal), colTotal, y + 1, 9, fontBold, C_TEXT);
    y -= rowH;
    rowBg = !rowBg;
  }

  y -= 6;
  divider();

  // ===== TOTALS =====
  ensureSpace(80);
  const totalLabelX = M + CW * 0.6;
  const totalValueX = M + CW * 0.85;

  // Netto
  text("Nettobetrag:", totalLabelX, y, 9, font, C_MUTED);
  text(formatCurrency(data.net_amount), totalValueX, y, 9, font, C_TEXT);
  y -= 14;

  // MwSt
  const taxLabel = data.tax_rate === 0
    ? "Umsatzsteuer (steuerfrei):"
    : `Umsatzsteuer ${data.tax_rate}%:`;
  text(taxLabel, totalLabelX, y, 9, font, C_MUTED);
  text(formatCurrency(data.tax_amount), totalValueX, y, 9, font, C_TEXT);
  y -= 2;
  page.drawLine({ start: { x: totalLabelX - 4, y: y - 2 }, end: { x: PAGE_W - M, y: y - 2 }, thickness: 0.5, color: C_LINE });
  y -= 8;

  // Brutto (highlighted box)
  const grossBoxH = 24;
  page.drawRectangle({ x: totalLabelX - 8, y: y - grossBoxH + 14, width: PAGE_W - M - totalLabelX + 8, height: grossBoxH, color: C_NAVY });
  text("Gesamtbetrag (brutto):", totalLabelX, y, 9, fontBold, C_WHITE);
  text(formatCurrency(data.gross_amount), totalValueX, y, 11, fontBold, C_WHITE);
  y -= grossBoxH + 8;

  // ===== ZAHLUNGSHINWEIS =====
  ensureSpace(60);
  y -= 8;
  if (data.due_date) {
    const payNote = `Bitte überweisen Sie den Betrag von ${formatCurrency(data.gross_amount)} bis zum ${formatDate(data.due_date)} auf unser Konto.`;
    text(payNote, M, y, 8.5, font, C_TEXT, CW);
    y -= 16;
  }

  if (data.notes) {
    y -= 4;
    page.drawRectangle({ x: M, y: y - 4, width: CW, height: 18, color: C_BG_LIGHT });
    page.drawRectangle({ x: M, y: y - 4, width: 3, height: 18, color: C_NAVY });
    text(data.notes, M + 10, y + 1, 8, font, C_TEXT, CW - 14);
    y -= 24;
  }

  // Tax footer note
  y -= 8;
  if (data.tax_rate === 0) {
    text("Gemäß § 4 UStG ist diese Leistung umsatzsteuerfrei.", M, y, 7.5, font, C_MUTED, CW);
  } else {
    text(`Im ausgewiesenen Betrag sind ${formatCurrency(data.tax_amount)} Umsatzsteuer (${data.tax_rate}%) enthalten.`, M, y, 7.5, font, C_MUTED, CW);
  }

  drawFooter();

  return doc.save();
}
