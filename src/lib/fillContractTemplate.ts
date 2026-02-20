import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface TemplateFillData {
  mp_nr?: string;
  praxis?: string;
  fachrichtung?: string;
  rechtsform?: string;
  vorname?: string;
  nachname?: string;
  adresse?: string;
  praxisanschrift?: string;
  plz?: string;
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
  selected_addon_modules?: string[];
  notes?: string;
  signature_data?: string | null;
  vertrieb_signature_data?: string | null;
  duration_months?: number;
  praxissystem?: string;
  stundenaufwand_pro_woche?: string;
}

// ~2mm offset in PDF points (1mm ≈ 2.835pt → 2mm ≈ 5.67pt → round to 6)
const DY = -6;
// Additional signature-only offset: 5mm higher (1mm ≈ 2.835pt → 5mm ≈ 14pt)
const SIG_DY = 14;

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
  // Prefer structured fields from form over legacy splitAddress
  const praxisStrasse = data.praxisanschrift || street;
  const praxisPlzOrt = [data.plz, data.ort].filter(Boolean).join(" ") || plzOrt;
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
      pages[pageIdx].drawText(t, { x, y: y + DY, size, font: f, color });
    }
  };

  const mods = (data.modules || []).map((m) => m.toLowerCase());
  const addonMods = (data.selected_addon_modules || []).map((m) => m.toLowerCase());
  const has = (name: string) => mods.some((m) => m.includes(name));
  const hasAddon = (name: string) => addonMods.some((m) => m.includes(name));
  const dur = data.duration_months || 12;
  const CHECK = "X";

  // Write individual characters at specific x positions (for IBAN/MP-Nr boxes)
  const writeChars = (
    pageIdx: number, text: string, positions: number[], y: number, size = FONT_SIZE
  ) => {
    for (let i = 0; i < Math.min(text.length, positions.length); i++) {
      write(pageIdx, text[i], positions[i], y, size);
    }
  };

  const drawSignature = async (
    pageIdx: number, x: number, y: number, maxW: number, maxH: number,
    sigType: "customer" | "vertrieb" = "customer"
  ) => {
    const sigSource = sigType === "vertrieb" ? data.vertrieb_signature_data : data.signature_data;
    if (!sigSource || !sigSource.startsWith("data:image")) return;
    try {
      const base64 = sigSource.split(",")[1];
      const imgBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pngImage = await doc.embedPng(imgBytes);
      let w = maxW;
      let h = (pngImage.height / pngImage.width) * w;
      if (h > maxH) { h = maxH; w = (pngImage.width / pngImage.height) * h; }
      if (pageIdx < pages.length) {
        pages[pageIdx].drawImage(pngImage, { x, y: y + DY + SIG_DY - h, width: w, height: h });
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
  write(0, data.fachrichtung || "", 353, 727);
  write(0, praxisStrasse, 83, 701);
  write(0, data.rechtsform || "", 352, 700);
  write(0, praxisPlzOrt, 84, 673);
  write(0, arztName, 81, 647);
  write(0, data.email || "", 349, 649);

  // EBM
  write(0, startDateFormatted, 143, 541);
  write(0, data.bsnr || "", 337, 570);
  // LANR: may be comma-separated (LANR 1, 2, 3)
  const lanrParts = (data.lanr || "").split(",").map(s => s.trim());
  write(0, lanrParts[0] || "", 456, 571);
  // Weitere BSNR: may be comma-separated (up to 3)
  const weitereBsnrParts = (data.weitere_bsnr || "").split(",").map(s => s.trim());
  write(0, weitereBsnrParts[0] || "", 337, 506);
  // Weitere LANR
  write(0, data.weitere_lanr || "", 337, 461);

  // PAGE 1 – Checkboxes (EBM)
  if (has("ebm")) {
    write(0, CHECK, 60, 541);  // EBM kostenpflichtig ab
    if (hasAddon("schnittstelle")) write(0, CHECK, 61, 526);  // Schnittstelle Patientenaktivierung
    if (hasAddon("datenbankrückschrift") || hasAddon("datenbankr")) write(0, CHECK, 62, 479);  // Datenbankrückschrift
    if (hasAddon("tsvg")) write(0, CHECK, 61, 439);  // TSVG-Modul
    if (hasAddon("bericht")) write(0, CHECK, 60, 400);  // Bericht-Modul
    if (hasAddon("nephro")) write(0, CHECK, 61, 377);  // Nephro-Modul
  }
  if (data.bsnr) write(0, CHECK, 318, 595);       // Lizenz BSNR
  if (data.weitere_bsnr) write(0, CHECK, 318, 528); // weitere BSNR
  if (data.weitere_lanr) write(0, CHECK, 318, 486); // jede weitere LANR
  if (data.notes) write(0, CHECK, 437, 220);        // Zusatzblatt vorhanden

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
    // kostenpflichtig Kreuz + Datum entfallen im neuen Formular

    // PAGE 2 – Checkboxes
    const hasLiveCheck = has("live-check") || has("live check");
    if (hasLiveCheck) {
      write(1, CHECK, 61, 506); // GOÄ/GOZ LiveCheck
      if (dur === 3) write(1, CHECK, 413, 467);
      if (dur === 6) write(1, CHECK, 412, 456);
      if (dur === 12) write(1, CHECK, 411, 445);
    }
    if (has("wingmann")) {
      write(1, CHECK, 60, 434); // GOÄ/GOZ Wingman
      if (dur === 3) write(1, CHECK, 413, 467);
      if (dur === 6) write(1, CHECK, 412, 456);
      if (dur === 12) write(1, CHECK, 411, 445);
    }
    if (has("goä") || has("goz")) {
      write(1, CHECK, 62, 371); // GOÄ/GOZ permanent Check
      if (dur === 3) write(1, CHECK, 412, 404);
      if (dur === 6) write(1, CHECK, 413, 394);
      if (dur === 12) write(1, CHECK, 412, 382);
    }
    if (has("doku")) write(1, CHECK, 61, 308);  // THOKX / Doku
    if (has("praxismanagement")) {
      write(1, CHECK, 62, 241); // Praxismanagement
      if (dur === 3) write(1, CHECK, 412, 176);
      if (dur === 6) write(1, CHECK, 412, 165);
      if (dur === 12) write(1, CHECK, 412, 154);
    }

    // Ort + Datum + Unterschrift
    write(1, ortText, 69, 81);
    write(1, today, 68, 56);
    await drawSignature(1, 190, 64, 100, 30, "customer");

    // Praxissystem & Stundenaufwand (Praxismanagement)
    write(1, data.praxissystem || "", 419, 120);
    write(1, data.stundenaufwand_pro_woche || "", 419, 98);
  }

  // ============================================================
  // PAGE 3 – SEPA (2 Ausfertigungen: oben CC, unten Bank)
  // ============================================================
  if (pages.length > 2) {
    write(2, data.mp_nr || "", 101, 784);
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
    await drawSignature(2, 208, 491, 100, 28, "customer");

    // --- BOTTOM: Ausfertigung Bank ---
    writeChars(2, mpClean, MP_X_BOTTOM, MP_Y_BOTTOM);
    write(2, data.bank_name || "", 66, 288);
    write(2, data.kontoinhaber || "", 66, 267);
    write(2, data.kontoinhaber_strasse || street, 235, 265);
    write(2, data.kontoinhaber_plz_ort || plzOrt, 407, 265);
    writeChars(2, ibanClean, IBAN_X_BOTTOM, IBAN_Y_BOTTOM);
    write(2, ortText, 72, 187);
    write(2, today, 80, 159);
    await drawSignature(2, 207, 180, 100, 28, "customer");
  }

  // ============================================================
  // PAGE 4 – Dienstleistungsvertrag
  // ============================================================
  if (pages.length > 3) {
    write(3, data.mp_nr || "", 101, 784);
    write(3, data.mp_nr || "", 271, 669);

    // PAGE 4 – Checkboxes
    if (has("goä")) write(3, CHECK, 74, 590);  // GG 1
    if (has("goz")) write(3, CHECK, 74, 578);  // GG 2
    const hasLC = has("live-check") || has("live check");
    if (hasLC) {
      write(3, CHECK, 74, 546);  // Live Check
      if (dur === 3) write(3, CHECK, 164, 546);
      if (dur === 6) write(3, CHECK, 164, 534);
      if (dur === 12) write(3, CHECK, 166, 523);
    }
    if (has("wingmann")) write(3, CHECK, 74, 503);       // Wingman
    if (has("goä") || has("goz")) write(3, CHECK, 74, 490); // Permanent Check
    if (has("doku")) write(3, CHECK, 74, 479);            // THOKX
    if (has("praxismanagement")) {
      write(3, CHECK, 73, 459);  // Praxismanagement
      if (dur === 3) write(3, CHECK, 165, 448);
      if (dur === 6) write(3, CHECK, 164, 437);
      if (dur === 12) write(3, CHECK, 164, 425);
    }

    write(3, ortText, 67, 185);
    write(3, today, 68, 161);
    await drawSignature(3, 202, 167, 100, 28, "vertrieb");
    write(3, ortText, 69, 81);
    write(3, today, 69, 55);
    await drawSignature(3, 205, 61, 100, 28, "customer");

    // Praxissystem & Stundenaufwand (Praxismanagement)
    write(3, data.praxissystem || "", 172, 397);
    write(3, data.stundenaufwand_pro_woche || "", 171, 375);
  }

  // ============================================================
  // PAGES 5–22: MP-Nr in header
  // ============================================================
  for (let i = 4; i < Math.min(pages.length, 22); i++) {
    write(i, data.mp_nr || "", 101, 784);
  }

  // Pages with "MP-Nummer, falls vorhanden" box in body text
  // Page 5 (AGB DL-Vertrag), Page 7 (AGB Wartung), Page 12 (EULA), Page 14 (AVV)
  const bodyMpPages = [4, 6, 11, 13];
  for (const idx of bodyMpPages) {
    if (idx < pages.length) {
      write(idx, data.mp_nr || "", 271, 669);
    }
  }

  // ============================================================
  // PAGE 6 (index 5) – Unterschriften (Vertrieb + Kunde)
  // ============================================================
  if (pages.length > 5) {
    write(5, ortText, 67, 185);
    write(5, today, 69, 161);
    await drawSignature(5, 201, 166, 100, 28, "vertrieb");
    write(5, ortText, 67, 80);
    write(5, today, 69, 57);
    await drawSignature(5, 204, 61, 100, 28, "customer");
  }

  // ============================================================
  // PAGE 9 (index 8) – Unterschriften (Vertrieb + Kunde)
  // ============================================================
  if (pages.length > 8) {
    write(8, ortText, 65, 190);
    write(8, today, 64, 165);
    await drawSignature(8, 199, 181, 100, 28, "vertrieb");
    write(8, ortText, 65, 81);
    write(8, today, 67, 56);
    await drawSignature(8, 200, 71, 100, 28, "customer");
  }

  // ============================================================
  // PAGE 13 (index 12) – Unterschriften (Vertrieb + Kunde)
  // ============================================================
  if (pages.length > 12) {
    write(12, ortText, 67, 191);
    write(12, today, 67, 167);
    await drawSignature(12, 201, 181, 100, 28, "vertrieb");
    write(12, ortText, 63, 81);
    write(12, today, 65, 55);
    await drawSignature(12, 201, 72, 100, 28, "customer");
  }

  // ============================================================
  // PAGE 16 (index 15) – Unterschriften (Vertrieb + Kunde)
  // ============================================================
  if (pages.length > 15) {
    write(15, ortText, 67, 185);
    write(15, today, 69, 161);
    await drawSignature(15, 201, 166, 100, 28, "vertrieb");
    write(15, ortText, 67, 80);
    write(15, today, 69, 57);
    await drawSignature(15, 204, 61, 100, 28, "customer");
  }

  return doc.save();
}
