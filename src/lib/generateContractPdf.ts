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

export async function generateContractPdf(data: ContractPdfData, logoBytes?: ArrayBuffer): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const PAGE_W = 595.28; // A4
  const PAGE_H = 841.89;
  const M = 50; // margin
  const CW = PAGE_W - 2 * M; // content width
  const COL2_X = M + CW / 2 + 5; // second column start
  const COL_W = CW / 2 - 5; // single column width

  const C_PRIMARY = rgb(0.044, 0.212, 0.498); // #0b367f
  const C_TEXT = rgb(0.15, 0.15, 0.15);
  const C_MUTED = rgb(0.45, 0.45, 0.45);
  const C_LINE = rgb(0.82, 0.82, 0.82);
  const C_BG = rgb(0.95, 0.96, 0.98);

  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - M;

  // ---------- helpers ----------

  const text = (t: string, x: number, yy: number, size: number, f = font, color = C_TEXT, maxW?: number) => {
    page.drawText(t || "", { x, y: yy, size, font: f, color, maxWidth: maxW });
  };

  const sectionHeader = (title: string) => {
    y -= 6;
    page.drawRectangle({ x: M, y: y - 5, width: CW, height: 18, color: C_BG });
    text(title.toUpperCase(), M + 8, y, 8, fontBold, C_PRIMARY);
    y -= 24;
  };

  const fieldPair = (l1: string, v1: string, l2: string, v2: string) => {
    text(l1, M, y, 7, font, C_MUTED);
    if (l2) text(l2, COL2_X, y, 7, font, C_MUTED);
    y -= 11;
    text(v1 || "–", M, y, 9, font, C_TEXT, COL_W);
    if (l2) text(v2 || "–", COL2_X, y, 9, font, C_TEXT, COL_W);
    y -= 14;
  };

  const fieldFull = (label: string, value: string) => {
    text(label, M, y, 7, font, C_MUTED);
    y -= 11;
    text(value || "–", M, y, 9, font, C_TEXT, CW);
    y -= 14;
  };

  const line = () => {
    page.drawLine({ start: { x: M, y }, end: { x: PAGE_W - M, y }, thickness: 0.5, color: C_LINE });
    y -= 10;
  };

  const ensureSpace = (needed = 80) => {
    if (y < M + needed) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - M;
    }
  };

  // ===== HEADER =====
  const titleSize = 16;
  const titleBaseline = y - titleSize + 4; // baseline for text at this size
  let logoXEnd = M;

  if (logoBytes) {
    try {
      const logoImage = await doc.embedJpg(logoBytes);
      const logoH = titleSize + 4; // match text height
      const logoW = (logoImage.width / logoImage.height) * logoH;
      page.drawImage(logoImage, { x: M, y: titleBaseline - 2, width: logoW, height: logoH });
      logoXEnd = M + logoW + 8;
    } catch {
      // continue without logo
    }
  }

  text("HONORARFUCHS", logoXEnd, titleBaseline, titleSize, fontBold, C_PRIMARY);

  // Status top-right
  const statusLabels: Record<string, string> = {
    entwurf: "ENTWURF", aktiv: "AKTIV", gekuendigt: "GEKÜNDIGT", beendet: "BEENDET",
  };
  const statusText = statusLabels[data.status || "entwurf"] || data.status?.toUpperCase() || "ENTWURF";
  text(`Status: ${statusText}`, PAGE_W - M - 90, titleBaseline + 10, 8, fontBold, C_PRIMARY);

  // Subtitle
  text("VERTRAGSÜBERSICHT", PAGE_W - M - 120, titleBaseline, 9, fontBold, C_MUTED);

  y = titleBaseline - 10;

  // HFX number + date
  text(
    `${data.hfx_customer_number || "Entwurf"} · Erstellt am ${formatDate(new Date().toISOString())}`,
    M, y, 8, font, C_MUTED,
  );
  y -= 10;
  line();

  // ===== VERTRAGSPARTEIEN =====
  sectionHeader("Vertragsparteien");
  fieldPair("Praxis", data.praxis || "–", "Fachrichtung", data.fachrichtung || "–");
  fieldPair("Vorname", data.vorname || "–", "Nachname", data.nachname || "–");
  fieldFull("Adresse", data.adresse || "–");
  fieldPair("Telefon", data.telefon || "–", "E-Mail", data.email || "–");
  fieldPair("MP-Nummer", data.mp_nr || "–", "Vertriebspartner", data.sales_partner_name || "–");
  line();
  ensureSpace();

  // ===== PRODUKTE =====
  sectionHeader("Produkte");
  const productList = data.modules?.length ? data.modules.join(", ") : data.product_name || "–";
  fieldFull("Ausgewählte Produkte", productList);
  fieldPair("Lizenzen", String(data.license_count ?? 1), "", "");
  line();
  ensureSpace();

  // ===== LAUFZEIT =====
  sectionHeader("Laufzeit & Kündigung");
  fieldPair("Vertragsbeginn", formatDate(data.start_date), "Vertragsende", formatDate(data.end_date));
  fieldPair("Laufzeit", `${data.duration_months ?? 12} Monate`, "Kündigungsfrist", `${data.cancellation_period_months ?? 3} Monate`);
  fieldPair("Automatische Verlängerung", data.auto_renewal ? "Ja" : "Nein", "", "");
  line();
  ensureSpace();

  // ===== PREISÜBERSICHT =====
  sectionHeader("Preisübersicht");

  // Price box - draw background first, then content below
  const boxH = 45;
  const boxTop = y;
  page.drawRectangle({ x: M, y: boxTop - boxH, width: CW, height: boxH, color: C_BG, borderColor: C_LINE, borderWidth: 0.5 });

  // Labels inside box (top row)
  const labelY = boxTop - 14;
  const valueY = boxTop - 30;

  text("Monatspreis", M + 12, labelY, 7, font, C_MUTED);
  text(formatCurrency(data.monthly_price), M + 12, valueY, 13, fontBold, C_PRIMARY);

  if ((data.one_time_fee ?? 0) > 0) {
    text("Einmalgebühr", M + 180, labelY, 7, font, C_MUTED);
    text(formatCurrency(data.one_time_fee), M + 180, valueY, 13, fontBold, C_PRIMARY);
  }

  if ((data.discount_percent ?? 0) > 0) {
    text("Rabatt", M + 360, labelY, 7, font, C_MUTED);
    text(`${data.discount_percent}%`, M + 360, valueY, 13, fontBold, rgb(0.1, 0.6, 0.3));
  }

  y = boxTop - boxH - 10;

  const intervalLabels: Record<string, string> = {
    monatlich: "Monatlich", quartalsweise: "Quartalsweise", jaehrlich: "Jährlich",
  };
  fieldPair("Zahlungsintervall", intervalLabels[data.payment_interval || "monatlich"] || data.payment_interval || "Monatlich", "", "");
  line();
  ensureSpace();

  // ===== SEPA =====
  sectionHeader("SEPA-Lastschrifteinzug");
  fieldFull("Kontoinhaber", data.kontoinhaber || "–");
  fieldPair("IBAN", data.iban || "–", "BIC", data.bic || "–");
  line();
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
      page.drawImage(pngImage, { x: M, y: y - sigH, width: sigW, height: sigH });
      y -= sigH + 10;
    } catch {
      text("(Unterschrift konnte nicht geladen werden)", M, y, 8, font, C_MUTED);
      y -= 15;
    }
  } else {
    page.drawLine({ start: { x: M, y }, end: { x: M + 250, y }, thickness: 0.5, color: C_TEXT });
    y -= 6;
    text("Datum, Unterschrift", M, y, 7, font, C_MUTED);
    y -= 15;
  }

  // ===== NOTIZEN =====
  if (data.notes) {
    ensureSpace(60);
    line();
    sectionHeader("Notizen");
    text(data.notes, M, y, 9, font, C_TEXT, CW);
    y -= 15;
  }

  // ===== FOOTER =====
  const fY = M - 10;
  page.drawLine({ start: { x: M, y: fY + 15 }, end: { x: PAGE_W - M, y: fY + 15 }, thickness: 0.3, color: C_LINE });
  text("Honorarfuchs GmbH · Dieses Dokument dient der Vorschau und hat keine rechtliche Bindung.", M, fY, 6, font, C_MUTED);

  return doc.save();
}
