import { useState, useCallback } from "react";

let globalShowPdf: ((dataUrl: string, filename?: string) => void) | null = null;

/** Call this from anywhere to display a PDF in the in-app viewer overlay. */
export function showPdfInViewer(dataUrl: string, filename?: string) {
  if (globalShowPdf) {
    globalShowPdf(dataUrl, filename);
  } else {
    window.location.href = dataUrl;
  }
}

/** Hook consumed by the PdfViewerOverlay component. */
export function usePdfViewer() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfFilename, setPdfFilename] = useState<string>("Dokument.pdf");

  const register = useCallback((show: (url: string, filename?: string) => void) => {
    globalShowPdf = show;
    return () => { globalShowPdf = null; };
  }, []);

  return { pdfUrl, setPdfUrl, pdfFilename, setPdfFilename, register };
}
