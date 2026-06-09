/**
 * ⚠ SYNCHRONIZE MIT supabase/functions/_shared/pdfFontLoader.ts
 *
 * Lädt die Exo-2-Schriftschnitte (Regular/Medium/Bold), registriert
 * @pdf-lib/fontkit am übergebenen PDFDocument und embedded alle drei
 * Schnitte mit subset:true. Die TTF-Bytes werden auf Modul-Ebene
 * gecached, um Mehrfach-Fetches je PDF-Render zu vermeiden.
 *
 * Pendant für Edge nutzt fetch(`${APP_URL}/fonts/...`). Die Schnitt-
 * Namen und das Rückgabeobjekt MÜSSEN identisch bleiben.
 */
import type { PDFDocument, PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";

// Dateien unter public/ werden von Vite/Server am Root-Pfad ausgeliefert.
const exo2RegularUrl = "/fonts/Exo2-Regular.ttf";
const exo2MediumUrl = "/fonts/Exo2-Medium.ttf";
const exo2BoldUrl = "/fonts/Exo2-Bold.ttf";

export interface PdfFontSet {
  regular: PDFFont;
  medium: PDFFont;
  bold: PDFFont;
}

let bytesPromise: Promise<[ArrayBuffer, ArrayBuffer, ArrayBuffer]> | null = null;

async function loadFontBytes(): Promise<[ArrayBuffer, ArrayBuffer, ArrayBuffer]> {
  if (!bytesPromise) {
    bytesPromise = Promise.all([
      fetch(exo2RegularUrl).then((r) => r.arrayBuffer()),
      fetch(exo2MediumUrl).then((r) => r.arrayBuffer()),
      fetch(exo2BoldUrl).then((r) => r.arrayBuffer()),
    ]) as Promise<[ArrayBuffer, ArrayBuffer, ArrayBuffer]>;
  }
  return bytesPromise;
}

export async function embedExo2(doc: PDFDocument): Promise<PdfFontSet> {
  doc.registerFontkit(fontkit);
  const [reg, med, bold] = await loadFontBytes();
  const [regular, medium, boldFont] = await Promise.all([
    doc.embedFont(reg, { subset: true }),
    doc.embedFont(med, { subset: true }),
    doc.embedFont(bold, { subset: true }),
  ]);
  return { regular, medium, bold: boldFont };
}
