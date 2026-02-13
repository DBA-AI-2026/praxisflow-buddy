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
  // MP-Nummer (top-left, in the box)
  write(0, data.mp_nr || "", 115, 802, FONT_SIZE);

  // STAMMDATEN
  write(0, data.praxis || "", 78, 725, FONT_SIZE);
  write(0, data.fachrichtung || "", 368, 725, FONT_SIZE);

  // Praxisadresse: Straße/Hausnummer
  write(0, street, 78, 690, FONT_SIZE);

  // Praxisadresse: PLZ/Ort
  write(0, plzOrt, 78, 655, FONT_SIZE);

  // Kontoinhaber
  write(0, data.kontoinhaber || "", 310, 655, FONT_SIZE);

  // Name des Arztes
  write(0, arztName, 78, 628, FONT_SIZE);

  // Allgemeine E-Mail-Adresse
  write(0, data.email || "", 368, 628, FONT_SIZE);

  // Monatliche Lizenzgebühren (total EUR value)
  if (data.monthly_price != null) {
    write(0, formatCurrency(data.monthly_price), 430, 248, 10, fontBold);
  }

  // Kostenpflichtig ab (HFX EBM section) - start date
  if (data.start_date) {
    write(0, startDateFormatted, 158, 467, SMALL);
  }

  // ============================================================
  // PAGE 2 – HFX GOÄ & Services
  // ============================================================
  if (pages.length > 1) {
    // MP-Nummer
    write(1, data.mp_nr || "", 115, 802, FONT_SIZE);

    // Kostenpflichtig ab (GOÄ section) 
    if (data.start_date) {
      write(1, startDateFormatted, 438, 700, SMALL);
    }

    // Ort
    write(1, "", 70, 82, FONT_SIZE); // Leave empty - user fills at signing

    // Datum
    write(1, today, 70, 58, FONT_SIZE);

    // Signature (3 signature areas at bottom)
    await drawSignature(1, 130, 65, 100, 30);
  }

  // ============================================================
  // PAGE 3 – SEPA Mandate (2 copies: top + bottom)
  // ============================================================
  if (pages.length > 2) {
    // MP-Nummer
    write(2, data.mp_nr || "", 115, 802, FONT_SIZE);

    // Mandatsreferenz (SMP field) - usually the MP number
    write(2, data.mp_nr || "", 488, 710, SMALL);

    // --- TOP SEPA COPY (Ausfertigung für CareCapital) ---
    // Kontoinhaber
    write(2, data.kontoinhaber || "", 48, 548, FONT_SIZE);

    // IBAN
    write(2, formatIban(data.iban), 85, 510, FONT_SIZE);

    // Ort
    // write(2, "", 48, 443, FONT_SIZE); // Leave blank

    // Datum
    write(2, today, 48, 423, FONT_SIZE);

    // Signature on top SEPA
    await drawSignature(2, 130, 435, 100, 28);

    // --- BOTTOM SEPA COPY (Ausfertigung für die Bank) ---
    // Mandatsreferenz
    write(2, data.mp_nr || "", 488, 378, SMALL);

    // Kontoinhaber
    write(2, data.kontoinhaber || "", 48, 218, FONT_SIZE);

    // IBAN
    write(2, formatIban(data.iban), 85, 180, FONT_SIZE);

    // Datum
    write(2, today, 48, 93, FONT_SIZE);

    // Signature on bottom SEPA
    await drawSignature(2, 130, 105, 100, 28);
  }

  // ============================================================
  // PAGE 4 – Dienstleistungsvertrag
  // ============================================================
  if (pages.length > 3) {
    // MP-Nummer (top)
    write(3, data.mp_nr || "", 115, 802, FONT_SIZE);

    // Praxis name (right side, "genaue MP-Bezeichnung")
    write(3, data.praxis || "", 330, 718, FONT_SIZE);

    // MP-Nummer (in body, "falls vorhanden")
    write(3, data.mp_nr || "", 385, 688, FONT_SIZE);

    // Bottom signature area 1 (MCC) - left blank (MCC signs)
    
    // Bottom signature area 2 (Kunde)
    // Ort
    // write(3, "", 48, 128, FONT_SIZE);

    // Datum
    write(3, today, 48, 108, FONT_SIZE);

    // Signature
    await drawSignature(3, 130, 118, 100, 28);
  }

  // ============================================================
  // PAGE 5 – AGB page 1 (no variable fields, only page header)
  // ============================================================

  // ============================================================
  // PAGE 6 – AGB page 2 with signature
  // ============================================================
  if (pages.length > 5) {
    // Datum (bottom)
    write(5, today, 48, 108, FONT_SIZE);

    // Signature
    await drawSignature(5, 130, 118, 100, 28);
  }

  // ============================================================
  // PAGE 7 – AGB Wartung/Lizenz with Praxis & MP-Nr
  // ============================================================
  if (pages.length > 6) {
    // Praxis name
    write(6, data.praxis || "", 330, 718, FONT_SIZE);

    // MP-Nummer
    write(6, data.mp_nr || "", 385, 688, FONT_SIZE);
  }

  // Sondervereinbarungen / Notizen on page 1 (if notes exist)
  // The "Sondervereinbarungen" section at the bottom of page 1
  if (data.notes) {
    write(0, data.notes.substring(0, 120), 78, 197, SMALL);
  }

  return doc.save();
}
