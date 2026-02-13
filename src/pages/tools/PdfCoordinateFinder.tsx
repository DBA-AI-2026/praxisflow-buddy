import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs`;

interface MarkedPoint {
  x: number;
  y: number;
  page: number;
  label: string;
}

export default function PdfCoordinateFinder() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [lastClick, setLastClick] = useState<{ x: number; y: number } | null>(null);
  const [marks, setMarks] = useState<MarkedPoint[]>([]);
  const [pdfPageDims, setPdfPageDims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Load PDF
  useEffect(() => {
    const loadPdf = async () => {
      try {
        const response = await fetch("/templates/vertrag-honorarfuchs.pdf");
        const arrayBuffer = await response.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      } catch (err) {
        console.error("Failed to load PDF:", err);
        toast.error("PDF konnte nicht geladen werden");
      }
    };
    loadPdf();
  }, []);

  // Render current page
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      const page = await pdfDoc.getPage(currentPage);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;

      setPdfPageDims({ width: page.getViewport({ scale: 1 }).width, height: page.getViewport({ scale: 1 }).height });

      await page.render({ canvasContext: ctx, viewport }).promise;
    };

    renderPage();
  }, [pdfDoc, currentPage, scale]);

  // Handle click on canvas
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || pdfPageDims.height === 0) return;

      const rect = canvas.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;

      // Convert to PDF coordinates (origin bottom-left, unscaled)
      const pdfX = Math.round(clickX / scale);
      const pdfY = Math.round(pdfPageDims.height - clickY / scale);

      setLastClick({ x: pdfX, y: pdfY });
    },
    [scale, pdfPageDims]
  );

  const addMark = () => {
    if (!lastClick) return;
    const label = prompt("Feldname (z.B. 'MP-Nr', 'Datum', 'Unterschrift'):");
    if (!label) return;
    setMarks((prev) => [...prev, { ...lastClick, page: currentPage, label }]);
    toast.success(`Markierung "${label}" gespeichert`);
  };

  const copyCoordinates = () => {
    if (!lastClick) return;
    const code = `write(${currentPage - 1}, "...", ${lastClick.x}, ${lastClick.y}, FONT_SIZE);`;
    navigator.clipboard.writeText(code);
    toast.success("Code kopiert!");
  };

  const copyAllMarks = () => {
    const lines = marks
      .map((m) => `// ${m.label} (Seite ${m.page})\nwrite(${m.page - 1}, "...", ${m.x}, ${m.y}, FONT_SIZE);`)
      .join("\n\n");
    navigator.clipboard.writeText(lines);
    toast.success("Alle Markierungen kopiert!");
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">PDF Koordinaten-Finder</h1>
        <p className="text-muted-foreground mb-4">
          Klicke auf das PDF, um die exakten Koordinaten für <code>fillContractTemplate.ts</code> zu ermitteln.
          Koordinaten-Ursprung ist <strong>unten links</strong>.
        </p>

        <div className="flex gap-4 flex-col lg:flex-row">
          {/* Left: PDF Canvas */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <Select value={String(currentPage)} onValueChange={(v) => setCurrentPage(Number(v))}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: totalPages }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      Seite {i + 1}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">100%</SelectItem>
                  <SelectItem value="1.5">150%</SelectItem>
                  <SelectItem value="2">200%</SelectItem>
                  <SelectItem value="2.5">250%</SelectItem>
                </SelectContent>
              </Select>

              <span className="text-sm text-muted-foreground">
                PDF: {pdfPageDims.width} × {pdfPageDims.height} pt
              </span>
            </div>

            <div className="border rounded-lg overflow-auto max-h-[80vh] cursor-crosshair">
              <canvas ref={canvasRef} onClick={handleCanvasClick} />
            </div>
          </div>

          {/* Right: Coordinates Panel */}
          <div className="w-full lg:w-80 space-y-4">
            {/* Current Click */}
            <Card className="p-4">
              <h3 className="font-semibold mb-2">Letzter Klick</h3>
              {lastClick ? (
                <div className="space-y-2">
                  <div className="font-mono text-lg">
                    x: <span className="text-primary font-bold">{lastClick.x}</span>, y:{" "}
                    <span className="text-primary font-bold">{lastClick.y}</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Seite {currentPage} (Index {currentPage - 1})</div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                    {`write(${currentPage - 1}, "...", ${lastClick.x}, ${lastClick.y}, FONT_SIZE);`}
                  </pre>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={copyCoordinates}>
                      <Copy className="h-3 w-3 mr-1" /> Code kopieren
                    </Button>
                    <Button size="sm" onClick={addMark}>
                      Markieren
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Klicke auf das PDF…</p>
              )}
            </Card>

            {/* Saved Marks */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Markierungen ({marks.length})</h3>
                {marks.length > 0 && (
                  <Button size="sm" variant="outline" onClick={copyAllMarks}>
                    <Copy className="h-3 w-3 mr-1" /> Alle kopieren
                  </Button>
                )}
              </div>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                {marks.map((m, i) => (
                  <div key={i} className="flex items-center justify-between text-sm bg-muted rounded p-2">
                    <div>
                      <Badge variant="secondary" className="mr-1">S.{m.page}</Badge>
                      <span className="font-medium">{m.label}</span>
                      <span className="text-muted-foreground ml-2 font-mono text-xs">
                        ({m.x}, {m.y})
                      </span>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => setMarks((prev) => prev.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {marks.length === 0 && (
                  <p className="text-xs text-muted-foreground">Noch keine Markierungen</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
