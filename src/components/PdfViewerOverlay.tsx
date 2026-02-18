import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { usePdfViewer } from "@/lib/pdfViewerState";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download, Loader2 } from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

export function PdfViewerOverlay() {
  const { pdfUrl, setPdfUrl, register } = usePdfViewer();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  useEffect(() => {
    return register(setPdfUrl);
  }, [register, setPdfUrl]);

  // Render all pages when pdfUrl changes
  useEffect(() => {
    if (!pdfUrl || !containerRef.current) return;

    let cancelled = false;
    const container = containerRef.current;

    const renderAll = async () => {
      setLoading(true);
      try {
        // Convert blob URL to ArrayBuffer
        const response = await fetch(pdfUrl);
        const arrayBuffer = await response.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        if (cancelled) return;
        setPageCount(doc.numPages);

        // Clear previous canvases
        container.innerHTML = "";

        // Determine scale based on container width
        const firstPage = await doc.getPage(1);
        const containerWidth = container.clientWidth || window.innerWidth;
        const unscaledViewport = firstPage.getViewport({ scale: 1 });
        const scale = Math.min((containerWidth - 16) / unscaledViewport.width, 2.5);

        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.display = "block";
          canvas.style.margin = "0 auto 8px auto";
          canvas.style.maxWidth = "100%";
          canvas.style.height = "auto";

          container.appendChild(canvas);

          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport }).promise;
        }
      } catch (err) {
        console.error("PDF render error:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    renderAll();
    return () => { cancelled = true; };
  }, [pdfUrl]);

  if (!pdfUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shadow-sm shrink-0">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => {
            URL.revokeObjectURL(pdfUrl);
            setPdfUrl(null);
          }}
        >
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

      {/* Scrollable PDF pages */}
      <div className="flex-1 overflow-y-auto bg-muted/50 p-2" ref={containerRef}>
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">PDF wird geladen…</span>
          </div>
        )}
      </div>
    </div>
  );
}
