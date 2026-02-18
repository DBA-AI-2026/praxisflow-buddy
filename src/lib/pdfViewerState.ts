import { useState, useCallback } from "react";

let globalShowPdf: ((dataUrl: string) => void) | null = null;

/** Call this from anywhere to display a PDF in the in-app viewer overlay. */
export function showPdfInViewer(dataUrl: string) {
  if (globalShowPdf) {
    globalShowPdf(dataUrl);
  } else {
    // Fallback: open in same tab
    window.location.href = dataUrl;
  }
}

/** Hook consumed by the PdfViewerOverlay component. */
export function usePdfViewer() {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const register = useCallback((show: (url: string) => void) => {
    globalShowPdf = show;
    return () => { globalShowPdf = null; };
  }, []);

  return { pdfUrl, setPdfUrl, register };
}
