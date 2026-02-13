import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface TemplateFillData {
  mp_nr?: string;
  praxis?: string;
  fachrichtung?: string;
  vorname?: string;
  nachname?: string;
  adresse?: string; // "Straße Hausnr, PLZ Ort"
  telefon?: string;
  email?: string;
  kontoinhaber?: string;
  iban?: string;
  bic?: string;
  monthly_price?: number;
  start_date?: string;
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

// Split address into street/housenr and plz/ort parts
function splitAddress(addr?: string): { street: string; plzOrt: string } {
  if (!addr) return { street: "", plzOrt: "" };
  // Try to split by comma
  const parts = addr.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    return { street: parts[0], plzOrt: parts.slice(1).join(", ") };
  }
  // Try to find PLZ pattern (5 digits)
  const match = addr.match(/^(.+?)\s+(\d{5}\s+.+)$/);
  if (match) {
    return { street: match[1], plzOrt: match[2] };
  }
  return { street: addr, plzOrt: "" };
}

// Format IBAN with spaces for readability
function formatIban(iban?: string): string {
  if (!iban) return "";
  return iban.replace(/(.{4})/g, "$1 ").trim();
}

const todayFormatted = () => {
  return new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
};

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
  const startDateFormatted = formatDate(data.start_date);

  // Helper to draw text on a specific page
  const write = (
    pageIdx: number,
    t: string,
    x: number,
    y: number,
    size = FONT_SIZE,
    f = font,
    color = C_TEXT
  ) => {
    if (pageIdx < pages.length && t) {
      pages[pageIdx].drawText(t, { x, y, size, font: f, color });
    }
  };

  // Helper to embed and draw signature on a page
  const drawSignature = async (
    pageIdx: number,
    x: number,
    y: number,
    maxW: number,
    maxH: number
  ) => {
    if (!data.signature_data || !data.signature_data.startsWith("data:image")) return;
    try {
      const base64 = data.signature_data.split(",")[1];
      const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pngImage = await doc.embedPng(imgBytes);
      let w = maxW;
      let h = (pngImage.height / pngImage.width) * w;
      if (h > maxH) {
        h = maxH;
        w = (pngImage.width / pngImage.height) * h;
      }
      if (pageIdx < pages.length) {
        pages[pageIdx].drawImage(pngImage, { x, y: y - h, width: w, height: h });
      }
    } catch {
      // Skip if signature can't be embedded
    }
  };

  // ============================================================
  // PAGE 1 – Stammdaten & HFX EBM
  // ============================================================
  write(0, data.mp_nr || "", 115, 780, FONT_SIZE);

  // STAMMDATEN
  write(0, data.praxis || "", 78, 725, FONT_SIZE);
  write(0, data.fachrichtung || "", 348, 725, FONT_SIZE);

  // Praxisadresse: Straße/Hausnummer (etwas höher)
  write(0, street, 78, 695, FONT_SIZE);

  // Praxisadresse: PLZ/Ort
  write(0, plzOrt, 78, 660, FONT_SIZE);

  // Kontoinhaber
  write(0, data.kontoinhaber || "", 310, 660, FONT_SIZE);

  // Name des Arztes (getrennt von Email)
  write(0, arztName, 78, 648, FONT_SIZE);

  // Allgemeine E-Mail-Adresse
  write(0, data.email || "", 368, 632, FONT_SIZE);

  // Monatliche Lizenzgebühren (höher und mehr rechts)
  if (data.monthly_price != null) {
    write(0, formatCurrency(data.monthly_price), 130, 280, 10, fontBold);
  }

  // Sondervereinbarungen / Notizen
  if (data.notes) {
    write(0, data.notes.substring(0, 120), 78, 197, SMALL);
  }

  // ============================================================
  // PAGE 2 – HFX GOÄ & Services
  // ============================================================
  if (pages.length > 1) {
    write(1, data.mp_nr || "", 115, 785, FONT_SIZE);

    if (data.start_date) {
      write(1, startDateFormatted, 438, 700, FONT_SIZE);
    }

    write(1, today, 90, 55, FONT_SIZE);
    await drawSignature(1, 200, 65, 100, 30);
  }

  // ============================================================
  // PAGE 3 – SEPA Mandate (2 copies: top + bottom)
  // ============================================================
  if (pages.length > 2) {
    write(2, data.mp_nr || "", 115, 790, FONT_SIZE);
    write(2, data.mp_nr || "", 488, 710, SMALL);

    // --- TOP SEPA (Ausfertigung CareCapital) ---
    write(2, data.kontoinhaber || "", 78, 590, FONT_SIZE);
    write(2, formatIban(data.iban), 85, 555, FONT_SIZE);
    write(2, data.bic || "", 85, 535, FONT_SIZE);
    write(2, today, 76, 494, FONT_SIZE);
    await drawSignature(2, 272, 520, 100, 28);

    // --- BOTTOM SEPA (Ausfertigung Bank) ---
    write(2, data.mp_nr || "", 488, 378, SMALL);
    write(2, data.kontoinhaber || "", 78, 260, FONT_SIZE);
    write(2, formatIban(data.iban), 85, 225, FONT_SIZE);
    write(2, data.bic || "", 85, 205, FONT_SIZE);
    write(2, today, 76, 164, FONT_SIZE);
    await drawSignature(2, 272, 190, 100, 28);
  }

  // ============================================================
  // PAGE 4–13: Shared positions for MP-Nr, Datum, Unterschrift
  // ============================================================
  const PG_MP_X = 48;
  const PG_MP_Y = 735;
  const PG_DAT_X = 76;
  const PG_DAT_Y = 40;
  const PG_SIG_X = 200;
  const PG_SIG_Y = 50;

  // Page 4 – Dienstleistungsvertrag
  if (pages.length > 3) {
    write(3, data.mp_nr || "", PG_MP_X, PG_MP_Y, FONT_SIZE);
    write(3, data.praxis || "", 330, 718, FONT_SIZE);
    write(3, data.mp_nr || "", 385, 688, FONT_SIZE);
    write(3, today, PG_DAT_X, PG_DAT_Y, FONT_SIZE);
    await drawSignature(3, PG_SIG_X, PG_SIG_Y, 100, 28);
  }

  // Pages 5+ – AGB & remaining pages: MP-Nr, Datum, Unterschrift
  for (let i = 4; i < pages.length; i++) {
    write(i, data.mp_nr || "", PG_MP_X, PG_MP_Y, FONT_SIZE);
    write(i, today, PG_DAT_X, PG_DAT_Y, FONT_SIZE);
    await drawSignature(i, PG_SIG_X, PG_SIG_Y, 100, 28);
  }

  // Page 7 (index 6) – zusätzlich Praxis & MP-Nr im Body
  if (pages.length > 6) {
    write(6, data.praxis || "", 330, 718, FONT_SIZE);
    write(6, data.mp_nr || "", 385, 688, FONT_SIZE);
  }

  return doc.save();
}
