import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

/**
 * Contract data fields that map to the Honorarfuchs PDF template.
 */
export interface PdfFillData {
  // Stammdaten (Page 1)
  praxisName: string;
  fachrichtung?: string;
  strasseHausnummer?: string;
  plzOrt?: string;
  kontoinhaber?: string;
  iban?: string;
  bic?: string;
  arztName: string;
  email?: string;
  mpNr?: string;
  
  // Product & pricing
  productName: string;
  modules?: string[];
  monthlyPrice: number;
  oneTimeFee?: number;
  
  // Contract dates
  startDate: string; // ISO format
  endDate: string;
  durationMonths: number;
  
  // Vertriebspartner
  salesPartnerName?: string;
  
  // Signing
  ort?: string;
  datum?: string;
}

/**
 * Fill the Honorarfuchs PDF template with contract data.
 * 
 * The PDF is A4 (595 x 842 pt). We use drawText helper where y is measured
 * from the TOP of the page (the helper converts to PDF-native bottom-origin).
 * 
 * Coordinates were calibrated against the template "vertrag-honorarfuchs.pdf" 
 * (Stand 01/2026, 13 pages).
 */
export async function fillPdfTemplate(
  pdfBytes: ArrayBuffer,
  data: PdfFillData
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const fillColor = rgb(0.0, 0.15, 0.45);

  // Helper: draw text at (x, yFromTop) on given page index
  const drawText = (
    pageIdx: number,
    text: string,
    x: number,
    yFromTop: number,
    size = 9,
    useBold = false
  ) => {
    if (pageIdx >= pages.length || !text) return;
    const page = pages[pageIdx];
    const { height } = page.getSize();
    page.drawText(text, {
      x,
      y: height - yFromTop,
      size,
      font: useBold ? boldFont : font,
      color: fillColor,
    });
  };

  const startFormatted = new Date(data.startDate).toLocaleDateString("de-DE");
  const datumFormatted = data.datum
    ? new Date(data.datum).toLocaleDateString("de-DE")
    : "";

  // =============================================
  // PAGE 1 – Stammdaten & Produktauswahl
  // =============================================
  // MP-Nummer (top left, next to "MP-Nummer" label)
  if (data.mpNr) {
    drawText(0, data.mpNr, 95, 56, 9);
  }

  // Praxisname (in STAMMDATEN box, right of "Praxisname" label)
  drawText(0, data.praxisName, 95, 108, 10, true);

  // Fachrichtung (right column, same row as Praxisname)
  if (data.fachrichtung) {
    drawText(0, data.fachrichtung, 370, 108, 9);
  }

  // Straße/Hausnummer
  if (data.strasseHausnummer) {
    drawText(0, data.strasseHausnummer, 95, 140, 9);
  }

  // PLZ/Ort
  if (data.plzOrt) {
    drawText(0, data.plzOrt, 95, 172, 9);
  }

  // Kontoinhaber (middle-right area of Stammdaten)
  if (data.kontoinhaber) {
    drawText(0, data.kontoinhaber, 370, 172, 9);
  }

  // Name des Arztes
  drawText(0, data.arztName, 95, 203, 9);

  // Allgemeine E-Mail-Adresse (right column)
  if (data.email) {
    drawText(0, data.email, 370, 203, 9);
  }

  // "Kostenpflichtig ab" (in the EBM product section)
  drawText(0, startFormatted, 150, 420, 8);

  // Ihre monatlichen Lizenzgebühren (bottom of product section)
  drawText(0, `${data.monthlyPrice.toLocaleString("de-DE")} €`, 380, 755, 11, true);

  // Sondervereinbarungen – Gültigkeit vom/bis
  drawText(0, startFormatted, 95, 800, 8);
  if (data.endDate) {
    const endFormatted = new Date(data.endDate).toLocaleDateString("de-DE");
    drawText(0, endFormatted, 370, 800, 8);
  }

  // =============================================
  // PAGE 2 – GOÄ & Unterschriften
  // =============================================
  if (pages.length > 1) {
    // MP-Nummer
    if (data.mpNr) {
      drawText(1, data.mpNr, 95, 56, 9);
    }

    // Kostenpflichtig ab (GOÄ section)
    drawText(1, startFormatted, 410, 135, 8);

    // Ort (bottom signature area)
    if (data.ort) {
      drawText(1, data.ort, 42, 763, 9);
    }
    // Datum
    if (datumFormatted) {
      drawText(1, datumFormatted, 42, 782, 9);
    }
  }

  // =============================================
  // PAGE 3 – SEPA Lastschrift (two copies on one page)
  // =============================================
  if (pages.length > 2) {
    // MP-Nummer
    if (data.mpNr) {
      drawText(2, data.mpNr, 95, 56, 9);
    }

    // --- TOP COPY (Ausfertigung für CareCapital) ---
    // Kontoinhaber
    if (data.kontoinhaber) {
      drawText(2, data.kontoinhaber, 42, 332, 8);
    }
    // IBAN (after the "D E" prefix boxes)
    if (data.iban) {
      drawText(2, data.iban, 80, 365, 9);
    }
    // Ort
    if (data.ort) {
      drawText(2, data.ort, 42, 400, 9);
    }
    // Datum
    if (datumFormatted) {
      drawText(2, datumFormatted, 42, 420, 9);
    }

    // --- BOTTOM COPY (Ausfertigung für die Bank) ---
    if (data.kontoinhaber) {
      drawText(2, data.kontoinhaber, 42, 620, 8);
    }
    if (data.iban) {
      drawText(2, data.iban, 80, 655, 9);
    }
    if (data.ort) {
      drawText(2, data.ort, 42, 690, 9);
    }
    if (datumFormatted) {
      drawText(2, datumFormatted, 42, 710, 9);
    }
  }

  // =============================================
  // PAGE 4 – Dienstleistungsvertrag
  // =============================================
  if (pages.length > 3) {
    // MP-Nummer top
    if (data.mpNr) {
      drawText(3, data.mpNr, 95, 56, 9);
    }

    // Praxis name (right column "und Praxis")
    drawText(3, data.praxisName, 310, 130, 9, true);

    // MP-Nummer in contract body
    if (data.mpNr) {
      drawText(3, data.mpNr, 370, 175, 8);
    }

    // Ort & Datum – MCC side (top signature block)
    if (data.ort) {
      drawText(3, data.ort, 42, 660, 9);
    }
    if (datumFormatted) {
      drawText(3, datumFormatted, 42, 680, 9);
    }

    // Ort & Datum – Customer side (bottom signature block)
    if (data.ort) {
      drawText(3, data.ort, 42, 732, 9);
    }
    if (datumFormatted) {
      drawText(3, datumFormatted, 42, 752, 9);
    }
  }

  return pdfDoc.save();
}
