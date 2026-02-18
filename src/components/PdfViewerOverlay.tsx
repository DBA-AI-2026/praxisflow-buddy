import { useEffect } from "react";
import { usePdfViewer } from "@/lib/pdfViewerState";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Download } from "lucide-react";

/**
 * Full-screen overlay that displays a PDF via iframe.
 * Mount this once at the app root level (e.g. in App.tsx).
 */
export function PdfViewerOverlay() {
  const { pdfUrl, setPdfUrl, register } = usePdfViewer();

  useEffect(() => {
    return register(setPdfUrl);
  }, [register, setPdfUrl]);

  if (!pdfUrl) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shadow-sm">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2"
          onClick={() => setPdfUrl(null)}
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </Button>
        <span className="text-sm font-medium text-muted-foreground flex-1 truncate">
          Vertragsdokument
        </span>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => {
            // Trigger download
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

      {/* PDF iframe */}
      <iframe
        src={pdfUrl}
        className="flex-1 w-full border-0"
        title="PDF Viewer"
      />
    </div>
  );
}
