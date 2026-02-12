import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

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

export async function generateContractPdf(data: ContractPdfData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // A4
  const pageHeight = 841.89;
  const margin = 50;
  const contentWidth = pageWidth - 2 * margin;

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const primaryColor = rgb(0.05, 0.15, 0.4); // dark blue
  const textColor = rgb(0.15, 0.15, 0.15);
  const mutedColor = rgb(0.45, 0.45, 0.45);
  const lineColor = rgb(0.85, 0.85, 0.85);
  const accentBg = rgb(0.95, 0.96, 0.98);

  // Helper: draw text
  const drawText = (text: string, x: number, yPos: number, options?: { size?: number; font?: typeof font; color?: typeof textColor; maxWidth?: number }) => {
    const size = options?.size ?? 9;
    const f = options?.font ?? font;
    const color = options?.color ?? textColor;
    page.drawText(text || "", { x, y: yPos, size, font: f, color, maxWidth: options?.maxWidth });
  };

  // Helper: section header
  const drawSectionHeader = (title: string) => {
    y -= 8;
    page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: 18, color: accentBg });
    drawText(title.toUpperCase(), margin + 8, y, { size: 8, font: fontBold, color: primaryColor });
    y -= 22;
  };

  // Helper: label-value row
  const drawField = (label: string, value: string, xOffset = 0, width = contentWidth / 2 - 10) => {
    drawText(label, margin + xOffset, y, { size: 7, color: mutedColor });
    y -= 11;
    drawText(value || "–", margin + xOffset, y, { size: 9, maxWidth: width });
    y -= 15;
  };

  // Helper: two-column field
  const drawFieldRow = (label1: string, value1: string, label2: string, value2: string) => {
    const col2X = contentWidth / 2 + 10;
    const savedY = y;

    drawText(label1, margin, y, { size: 7, color: mutedColor });
    drawText(label2, margin + col2X, y, { size: 7, color: mutedColor });
    y -= 11;
    drawText(value1 || "–", margin, y, { size: 9, maxWidth: contentWidth / 2 - 20 });
    drawText(value2 || "–", margin + col2X, y, { size: 9, maxWidth: contentWidth / 2 - 20 });
    y -= 15;
  };

  const drawLine = () => {
    page.drawLine({ start: { x: margin, y }, end: { x: pageWidth - margin, y }, thickness: 0.5, color: lineColor });
    y -= 8;
  };

  const checkNewPage = (needed = 80) => {
    if (y < margin + needed) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  // ===== HEADER =====
  drawText("HONORARFUCHS", margin, y, { size: 20, font: fontBold, color: primaryColor });
  drawText("VERTRAGSÜBERSICHT", margin + 250, y, { size: 10, font: fontBold, color: mutedColor });
  y -= 12;

  // HFX number + date
  drawText(
    `${data.hfx_customer_number || "Entwurf"} · Erstellt am ${formatDate(new Date().toISOString())}`,
    margin, y, { size: 8, color: mutedColor }
  );
  y -= 8;
  drawLine();

  // Status badge text
  const statusLabels: Record<string, string> = {
    entwurf: "ENTWURF",
    aktiv: "AKTIV",
    gekuendigt: "GEKÜNDIGT",
    beendet: "BEENDET",
  };
  drawText(`Status: ${statusLabels[data.status || "entwurf"] || data.status?.toUpperCase() || "ENTWURF"}`, pageWidth - margin - 100, pageHeight - margin, {
    size: 8, font: fontBold, color: primaryColor,
  });

  // ===== VERTRAGSPARTEIEN =====
  drawSectionHeader("Vertragsparteien");
  drawField("Praxis", data.praxis || "–");
  y += 26; // go back up for second column
  drawText("Fachrichtung", margin + contentWidth / 2 + 10, y + 15, { size: 7, color: mutedColor });
  drawText(data.fachrichtung || "–", margin + contentWidth / 2 + 10, y + 4, { size: 9 });

  drawFieldRow("Vorname", data.vorname || "–", "Nachname", data.nachname || "–");
  drawField("Adresse", data.adresse || "–", 0, contentWidth);
  drawFieldRow("Telefon", data.telefon || "–", "E-Mail", data.email || "–");
  drawFieldRow("MP-Nummer", data.mp_nr || "–", "Vertriebspartner", data.sales_partner_name || "–");

  drawLine();
  checkNewPage();

  // ===== PRODUKTE =====
  drawSectionHeader("Produkte");
  const productList = data.modules?.length ? data.modules.join(", ") : data.product_name || "–";
  drawField("Ausgewählte Produkte", productList, 0, contentWidth);
  drawFieldRow("Lizenzen", String(data.license_count ?? 1), "", "");

  drawLine();
  checkNewPage();

  // ===== LAUFZEIT =====
  drawSectionHeader("Laufzeit & Kündigung");
  drawFieldRow("Vertragsbeginn", formatDate(data.start_date), "Vertragsende", formatDate(data.end_date));
  drawFieldRow("Laufzeit", `${data.duration_months ?? 12} Monate`, "Kündigungsfrist", `${data.cancellation_period_months ?? 3} Monate`);
  drawField("Automatische Verlängerung", data.auto_renewal ? "Ja" : "Nein");

  drawLine();
  checkNewPage();

  // ===== PREISÜBERSICHT =====
  drawSectionHeader("Preisübersicht");
  // Price box
  page.drawRectangle({ x: margin, y: y - 4, width: contentWidth, height: 50, color: accentBg, borderColor: lineColor, borderWidth: 0.5 });
  drawText("Monatspreis", margin + 10, y + 28, { size: 7, color: mutedColor });
  drawText(formatCurrency(data.monthly_price), margin + 10, y + 14, { size: 14, font: fontBold, color: primaryColor });

  if ((data.one_time_fee ?? 0) > 0) {
    drawText("Einmalgebühr", margin + 200, y + 28, { size: 7, color: mutedColor });
    drawText(formatCurrency(data.one_time_fee), margin + 200, y + 14, { size: 14, font: fontBold, color: primaryColor });
  }

  if ((data.discount_percent ?? 0) > 0) {
    drawText("Rabatt", margin + 380, y + 28, { size: 7, color: mutedColor });
    drawText(`${data.discount_percent}%`, margin + 380, y + 14, { size: 14, font: fontBold, color: rgb(0.1, 0.6, 0.3) });
  }
  y -= 60;

  const intervalLabels: Record<string, string> = {
    monatlich: "Monatlich",
    quartalsweise: "Quartalsweise",
    jaehrlich: "Jährlich",
  };
  drawField("Zahlungsintervall", intervalLabels[data.payment_interval || "monatlich"] || data.payment_interval || "Monatlich");

  drawLine();
  checkNewPage();

  // ===== SEPA =====
  drawSectionHeader("SEPA-Lastschrifteinzug");
  drawField("Kontoinhaber", data.kontoinhaber || "–", 0, contentWidth);
  drawFieldRow("IBAN", data.iban || "–", "BIC", data.bic || "–");

  drawLine();
  checkNewPage(160);

  // ===== UNTERSCHRIFT =====
  drawSectionHeader("Unterschrift");
  if (data.signature_data && data.signature_data.startsWith("data:image")) {
    try {
      const base64 = data.signature_data.split(",")[1];
      const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pngImage = await doc.embedPng(imgBytes);
      const sigWidth = 200;
      const sigHeight = (pngImage.height / pngImage.width) * sigWidth;
      page.drawImage(pngImage, { x: margin, y: y - sigHeight, width: sigWidth, height: sigHeight });
      y -= sigHeight + 10;
    } catch {
      drawText("(Unterschrift konnte nicht geladen werden)", margin, y, { size: 8, color: mutedColor });
      y -= 15;
    }
  } else {
    // Empty signature line
    page.drawLine({ start: { x: margin, y }, end: { x: margin + 250, y }, thickness: 0.5, color: textColor });
    y -= 5;
    drawText("Datum, Unterschrift", margin, y, { size: 7, color: mutedColor });
    y -= 15;
  }

  // ===== NOTIZEN =====
  if (data.notes) {
    checkNewPage(60);
    drawLine();
    drawSectionHeader("Notizen");
    drawText(data.notes, margin, y, { size: 9, maxWidth: contentWidth });
    y -= 15;
  }

  // ===== FOOTER =====
  const footerY = margin - 10;
  page.drawLine({ start: { x: margin, y: footerY + 15 }, end: { x: pageWidth - margin, y: footerY + 15 }, thickness: 0.3, color: lineColor });
  drawText("Honorarfuchs GmbH · Dieses Dokument dient der Vorschau und hat keine rechtliche Bindung.", margin, footerY, { size: 6, color: mutedColor });

  return doc.save();
}
