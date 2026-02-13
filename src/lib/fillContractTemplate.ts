import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface TemplateFillData {
  mp_nr?: string;
  praxis?: string;
  fachrichtung?: string;
  rechtsform?: string;
  vorname?: string;
  nachname?: string;
  adresse?: string; // "Straße Hausnr, PLZ Ort"
  telefon?: string;
  email?: string;
  kontoinhaber?: string;
  kontoinhaber_strasse?: string;
  kontoinhaber_plz_ort?: string;
  bank_name?: string;
  iban?: string;
  bic?: string;
  bsnr?: string;
  lanr?: string;
  weitere_bsnr?: string;
  weitere_lanr?: string;
  monthly_price?: number;
  start_date?: string;
  end_date?: string;
  ort?: string;
  modules?: string[];
  notes?: string;
  signature_data?: string | null;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return dateStr;
  }
}

function formatCurrency(value?: number): string {
  if (value == null) return "0,00";
  return value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function splitAddress(addr?: string): { street: string; plzOrt: string } {
  if (!addr) return { street: "", plzOrt: "" };
  const parts = addr.split(",").map((s) => s.trim());
  if (parts.length >= 2) return { street: parts[0], plzOrt: parts.slice(1).join(", ") };
  const match = addr.match(/^(.+?)\s+(\d{5}\s+.+)$/);
  if (match) return { street: match[1], plzOrt: match[2] };
  return { street: addr, plzOrt: "" };
}

const todayFormatted = () =>
  new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export async function fillContractTemplate(
  templateBytes: ArrayBuffer,
  data: TemplateFillData
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(templateBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const C_TEXT = rgb(0.05, 0.05, 0.15);
  const FONT_SIZE = 9;
  const SMALL = 7.5;
  const pages = doc.getPages();

  const { street, plzOrt } = splitAddress(data.adresse);
  const arztName = [data.vorname, data.nachname].filter(Boolean).join(" ");
  const today = todayFormatted();
  const ortText = data.ort || "";
  const startDateFormatted = formatDate(data.start_date);
  const endDateFormatted = formatDate(data.end_date);

  // Clean IBAN (remove spaces)
  const ibanClean = (data.iban || "").replace(/\s/g, "");
  // Clean MP-Nr
  const mpClean = (data.mp_nr || "").replace(/\s/g, "");

  const write = (
    pageIdx: number, t: string, x: number, y: number, size = FONT_SIZE, f = font, color = C_TEXT
  ) => {
    if (pageIdx < pages.length && t) {
      pages[pageIdx].drawText(t, { x, y, size, font: f, color });
    }
  };

  // Write individual characters at specific x positions (for IBAN/MP-Nr boxes)
  const writeChars = (
    pageIdx: number, text: string, positions: number[], y: number, size = FONT_SIZE
  ) => {
    for (let i = 0; i < Math.min(text.length, positions.length); i++) {
      write(pageIdx, text[i], positions[i], y, size);
    }
  };

  const drawSignature = async (
    pageIdx: number, x: number, y: number, maxW: number, maxH: number
  ) => {
    if (!data.signature_data || !data.signature_data.startsWith("data:image")) return;
    try {
      const base64 = data.signature_data.split(",")[1];
      const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pngImage = await doc.embedPng(imgBytes);
      let w = maxW;
      let h = (pngImage.height / pngImage.width) * w;
      if (h > maxH) { h = maxH; w = (pngImage.width / pngImage.height) * h; }
      if (pageIdx < pages.length) {
        pages[pageIdx].drawImage(pngImage, { x, y: y - h, width: w, height: h });
      }
    } catch { /* skip */ }
  };

  // IBAN x-positions for the 20 character boxes (page 3 bottom / Ausfertigung Bank)
  const IBAN_X_BOTTOM = [116,139,162,185,207,231,254,277,300,323,346,369,391,414,438,459,483,506,529,551];
  const IBAN_Y_BOTTOM = 243;
  // IBAN x-positions for the 20 character boxes (page 3 top / Ausfertigung CC)
  const IBAN_X_TOP = [115,140,161,185,208,231,253,277,299,322,345,369,390,413,437,459,483,507,529,552];
  const IBAN_Y_TOP = 556;

  // MP-Nr digit positions (page 3 top)
  const MP_X_TOP = [452,466,481,496,511];
  const MP_Y_TOP = 681;
  // MP-Nr digit positions (page 3 bottom)
  const MP_X_BOTTOM = [452,467,481,496,511];
  const MP_Y_BOTTOM = 369;

  // ============================================================
  // PAGE 1 – Stammdaten & Produkte
  // ============================================================
  write(0, data.mp_nr || "", 103, 784);
  write(0, data.praxis || "", 87, 727);
  write(0, data.fachrichtung || "", 351, 726);
  write(0, street, 82, 700);
  write(0, data.rechtsform || "", 352, 701);
  write(0, arztName, 81, 647);
  write(0, data.email || "", 349, 649);

  // EBM
  write(0, startDateFormatted, 143, 541);
  write(0, data.bsnr || "", 337, 570);
  write(0, data.lanr || "", 456, 571);
  write(0, data.weitere_bsnr || "", 337, 506);
  write(0, data.weitere_lanr || "", 337, 461);

  // Monatliche Lizenzgebühren
  if (data.monthly_price != null) {
    write(0, formatCurrency(data.monthly_price), 267, 287, 10, fontBold);
  }

  // Sondervereinbarungen
  write(0, startDateFormatted, 104, 206);
  write(0, endDateFormatted, 289, 207);
  if (data.notes) {
    write(0, data.notes.substring(0, 120), 73, 183, SMALL);
  }

  // ============================================================
  // PAGE 2 – GOÄ & Unterschrift
  // ============================================================
  if (pages.length > 1) {
    write(1, data.mp_nr || "", 101, 785);
    // kostenpflichtig ab Datum
    write(1, startDateFormatted, 450, 709);
    // Ort + Datum + Unterschrift
    write(1, ortText, 61, 105);
    write(1, today, 68, 56);
    await drawSignature(1, 190, 64, 100, 30);
  }

  // ============================================================
  // PAGE 3 – SEPA (2 Ausfertigungen: oben CC, unten Bank)
  // ============================================================
  if (pages.length > 2) {
    // --- TOP: Ausfertigung CareCapital ---
    writeChars(2, mpClean, MP_X_TOP, MP_Y_TOP);
    write(2, data.bank_name || "", 69, 601);
    write(2, data.kontoinhaber || "", 65, 578);
    write(2, data.kontoinhaber_strasse || street, 237, 578);
    write(2, data.kontoinhaber_plz_ort || plzOrt, 405, 579);
    // Bank address (same as Kontoinhaber if not separate)
    write(2, data.kontoinhaber || "", 235, 601);
    write(2, data.kontoinhaber_plz_ort || plzOrt, 406, 600);
    writeChars(2, ibanClean, IBAN_X_TOP, IBAN_Y_TOP);
    write(2, ortText, 69, 500);
    write(2, today, 67, 471);
    await drawSignature(2, 208, 491, 100, 28);

    // --- BOTTOM: Ausfertigung Bank ---
    writeChars(2, mpClean, MP_X_BOTTOM, MP_Y_BOTTOM);
    write(2, data.bank_name || "", 66, 288);
    write(2, data.kontoinhaber || "", 66, 267);
    write(2, data.kontoinhaber_strasse || street, 235, 265);
    write(2, data.kontoinhaber_plz_ort || plzOrt, 407, 265);
    writeChars(2, ibanClean, IBAN_X_BOTTOM, IBAN_Y_BOTTOM);
    write(2, ortText, 72, 187);
    write(2, today, 80, 159);
    await drawSignature(2, 207, 180, 100, 28);
  }

  // ============================================================
  // PAGE 4 – Dienstleistungsvertrag
  // ============================================================
  if (pages.length > 3) {
    write(3, data.mp_nr || "", 101, 784);
    write(3, data.mp_nr || "", 271, 669);
    write(3, ortText, 67, 185);
    write(3, today, 68, 161);
    await drawSignature(3, 202, 167, 100, 28); // Vertrieb
    write(3, ortText, 69, 81);
    write(3, today, 69, 55);
    await drawSignature(3, 205, 61, 100, 28);
  }

  // ============================================================
  // PAGE 5
  // ============================================================
  if (pages.length > 4) {
    write(4, data.mp_nr || "", 101, 784);
    write(4, data.mp_nr || "", 271, 657);
  }

  // ============================================================
  // PAGE 6
  // ============================================================
  if (pages.length > 5) {
    write(5, data.mp_nr || "", 103, 784);
    write(5, ortText, 67, 185);
    write(5, today, 69, 161);
    await drawSignature(5, 201, 166, 100, 28); // Vertrieb
    write(5, ortText, 67, 80);
    write(5, today, 69, 57);
    await drawSignature(5, 204, 61, 100, 28);
  }

  // ============================================================
  // PAGE 7
  // ============================================================
  if (pages.length > 6) {
    write(6, data.mp_nr || "", 101, 783);
    write(6, data.mp_nr || "", 271, 669);
  }

  // ============================================================
  // PAGE 8
  // ============================================================
  if (pages.length > 7) {
    write(7, data.mp_nr || "", 102, 784);
  }

  // ============================================================
  // PAGE 9
  // ============================================================
  if (pages.length > 8) {
    write(8, data.mp_nr || "", 99, 785);
    write(8, ortText, 65, 190);
    write(8, today, 64, 165);
    await drawSignature(8, 199, 167, 100, 28); // Vertrieb
    write(8, ortText, 65, 81);
    write(8, today, 67, 56);
    await drawSignature(8, 200, 57, 100, 28);
  }

  // ============================================================
  // PAGE 10
  // ============================================================
  if (pages.length > 9) {
    write(9, data.mp_nr || "", 99, 785);
  }

  // ============================================================
  // PAGE 11
  // ============================================================
  if (pages.length > 10) {
    write(10, data.mp_nr || "", 100, 785);
  }

  // ============================================================
  // PAGE 12
  // ============================================================
  if (pages.length > 11) {
    write(11, data.mp_nr || "", 101, 785);
    write(11, data.mp_nr || "", 271, 669);
  }

  // ============================================================
  // PAGE 13
  // ============================================================
  if (pages.length > 12) {
    write(12, data.mp_nr || "", 101, 785);
    write(12, ortText, 67, 191);
    write(12, today, 67, 167);
    await drawSignature(12, 201, 167, 100, 28); // Vertrieb
    write(12, ortText, 63, 81);
    write(12, today, 65, 55);
    await drawSignature(12, 201, 58, 100, 28);
  }

  return doc.save();
}
