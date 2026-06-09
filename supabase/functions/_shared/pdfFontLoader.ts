/**
 * ⚠ SYNCHRONIZE MIT src/lib/pdfFontLoader.ts
 *
 * Edge-Variante des Font-Loaders. Lädt Exo-2-TTFs über fetch(`${APP_URL}/fonts/...`),
 * registriert @pdf-lib/fontkit (Deno via npm:-Specifier) am Doc und embedded
 * Regular/Medium/Bold mit subset:true.
 *
 * Caching: Bytes werden auf Modul-Ebene gecached. Bei Cold-Start der Edge-
 * Function wird einmalig nachgeladen (~3x ~300 KB). Bei warm Invokes
 * wiederverwendet.
 */
import type { PDFDocument, PDFFont } from "npm:pdf-lib@1.17.1";
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";

export interface PdfFontSet {
  regular: PDFFont;
  medium: PDFFont;
  bold: PDFFont;
}

let bytesPromise: Promise<[ArrayBuffer, ArrayBuffer, ArrayBuffer]> | null = null;

async function loadFontBytes(appUrl: string): Promise<[ArrayBuffer, ArrayBuffer, ArrayBuffer]> {
  if (!bytesPromise) {
    bytesPromise = Promise.all([
      fetch(`${appUrl}/fonts/Exo2-Regular.ttf`).then((r) => r.arrayBuffer()),
      fetch(`${appUrl}/fonts/Exo2-Medium.ttf`).then((r) => r.arrayBuffer()),
      fetch(`${appUrl}/fonts/Exo2-Bold.ttf`).then((r) => r.arrayBuffer()),
    ]) as Promise<[ArrayBuffer, ArrayBuffer, ArrayBuffer]>;
  }
  return bytesPromise;
}

export async function embedExo2(doc: PDFDocument, appUrl: string): Promise<PdfFontSet> {
  // @ts-ignore — pdf-lib types via npm: specifier
  doc.registerFontkit(fontkit);
  const [reg, med, bold] = await loadFontBytes(appUrl);
  const [regular, medium, boldFont] = await Promise.all([
    doc.embedFont(reg, { subset: true }),
    doc.embedFont(med, { subset: true }),
    doc.embedFont(bold, { subset: true }),
  ]);
  return { regular, medium, bold: boldFont };
}
