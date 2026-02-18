import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { usePdfViewer } from "@/lib/pdfViewerState";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

export function PdfViewerOverlay() {
  const { pdfUrl, setPdfUrl, register } = usePdfViewer();
  const [loading, setLoading] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [pageDataUrls, setPageDataUrls] = useState<string[]>([]);

  useEffect(() => {
    return register(setPdfUrl);
  }, [register, setPdfUrl]);

  // Render all pages to data URLs when pdfUrl changes
  useEffect(() => {
    if (!pdfUrl) {
      setPageDataUrls([]);
      setPageCount(0);
      return;
    }

    let cancelled = false;

    const renderAll = async () => {
      setLoading(true);
      setPageDataUrls([]);
      try {
        const response = await fetch(pdfUrl);
        const arrayBuffer = await response.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (cancelled) return;
        setPageCount(doc.numPages);

        const containerWidth = Math.min(window.innerWidth - 16, 1200);
        const firstPage = await doc.getPage(1);
        const unscaledViewport = firstPage.getViewport({ scale: 1 });
        const scale = Math.min(containerWidth / unscaledViewport.width, 2.5);

        const urls: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;

          urls.push(canvas.toDataURL("image/png"));
        }

        if (!cancelled) setPageDataUrls(urls);
      } catch (err) {
        console.error("PDF render error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    renderAll();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  const handleClose = useCallback(() => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  }, [pdfUrl, setPdfUrl]);

  if (!pdfUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shadow-sm shrink-0">
        <Button variant="ghost" size="sm" className="gap-2" onClick={handleClose}>
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <span className="text-sm font-medium text-muted-foreground flex-1 truncate">
          Vertragsdokument {pageCount > 0 ? `(${pageCount} Seiten)` : ""}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            const a = document.createElement("a");
            a.href = pdfUrl;
            a.download = "Vertrag.pdf";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
          }}
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Herunterladen</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto bg-muted/50 p-2">
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">PDF wird geladen…</span>
          </div>
        )}
        {pageDataUrls.map((dataUrl, i) => (
          <img
            key={i}
            src={dataUrl}
            alt={`Seite ${i + 1}`}
            className="block mx-auto mb-2 max-w-full shadow-sm"
          />
        ))}
      </div>
    </div>
  );
}
