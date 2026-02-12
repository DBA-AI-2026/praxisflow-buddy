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
 * Since the PDF is a static layout (not a fillable form), we overlay text at known coordinates.
 */
export async function fillPdfTemplate(
  pdfBytes: ArrayBuffer,
  data: PdfFillData
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();

  const textColor = rgb(0.1, 0.1, 0.1);
  const fillColor = rgb(0.0, 0.2, 0.5);

  // Helper to draw text
  const drawText = (
    pageIdx: number,
    text: string,
    x: number,
    y: number,
    size = 9,
    useBold = false
  ) => {
    if (pageIdx >= pages.length) return;
    const page = pages[pageIdx];
    const { height } = page.getSize();
    page.drawText(text, {
      x,
      y: height - y,
      size,
      font: useBold ? boldFont : font,
      color: fillColor,
    });
  };

  // =============================================
  // PAGE 1 – Stammdaten & Produktauswahl
  // =============================================
  // Praxisname (top header area)
  drawText(0, data.praxisName, 130, 88, 11, true);

  // Fachrichtung
  if (data.fachrichtung) {
    drawText(0, data.fachrichtung, 130, 108, 9);
  }

  // Straße/Hausnummer
  if (data.strasseHausnummer) {
    drawText(0, data.strasseHausnummer, 88, 153, 8);
  }

  // PLZ/Ort
  if (data.plzOrt) {
    drawText(0, data.plzOrt, 88, 168, 8);
  }

  // Kontoinhaber
  if (data.kontoinhaber) {
    drawText(0, data.kontoinhaber, 88, 183, 8);
  }

  // IBAN
  if (data.iban) {
    drawText(0, data.iban, 88, 198, 8);
  }

  // BIC
  if (data.bic) {
    drawText(0, data.bic, 88, 213, 8);
  }

  // Name des Arztes
  drawText(0, data.arztName, 88, 240, 8);

  // Allgemeine E-Mail-Adresse
  if (data.email) {
    drawText(0, data.email, 88, 255, 8);
  }

  // Monatliche Lizenzgebühren
  drawText(0, `${data.monthlyPrice.toLocaleString("de-DE")} €`, 170, 720, 10, true);

  // Kostenpflichtig ab (start date)
  const startFormatted = new Date(data.startDate).toLocaleDateString("de-DE");
  drawText(0, startFormatted, 108, 375, 8);

  // =============================================
  // PAGE 2 – GOÄ & Unterschriften
  // =============================================
  if (pages.length > 1) {
    // Kostenpflichtig ab
    drawText(1, startFormatted, 108, 110, 8);

    // Ort & Datum for signatures (bottom of page 2)
    if (data.ort) {
      drawText(1, data.ort, 50, 700, 9);
    }
    if (data.datum) {
      const datumFormatted = new Date(data.datum).toLocaleDateString("de-DE");
      drawText(1, datumFormatted, 50, 715, 9);
    }
  }

  // =============================================
  // PAGE 4 – Dienstleistungsvertrag mit Unterschriften
  // =============================================
  if (pages.length > 3) {
    // Praxis name on contract page
    drawText(3, data.praxisName, 310, 115, 9, true);

    // MP-Nummer area
    if (data.fachrichtung) {
      drawText(3, data.fachrichtung, 310, 145, 8);
    }

    // Ort & Datum (MCC side)
    if (data.ort) {
      drawText(3, data.ort, 50, 670, 9);
    }
    if (data.datum) {
      const datumFormatted = new Date(data.datum).toLocaleDateString("de-DE");
      drawText(3, datumFormatted, 50, 685, 9);
    }

    // Ort & Datum (customer side)
    if (data.ort) {
      drawText(3, data.ort, 50, 710, 9);
    }
    if (data.datum) {
      const datumFormatted = new Date(data.datum).toLocaleDateString("de-DE");
      drawText(3, datumFormatted, 50, 725, 9);
    }
  }

  return pdfDoc.save();
}
