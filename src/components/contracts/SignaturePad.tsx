import { useRef, useEffect, useState } from "react";
import SignaturePadLib from "signature_pad";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  label: string;
  onSignatureChange: (dataUrl: string | null) => void;
  height?: number;
}

export function SignaturePad({ label, onSignatureChange, height = 150 }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const padRef = useRef<SignaturePadLib | null>(null);
  const [isEmpty, setIsEmpty] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resizeCanvas = () => {
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(ratio, ratio);
      // Restore after resize
      if (padRef.current && !padRef.current.isEmpty()) {
        // Can't perfectly restore, so just clear
        padRef.current.clear();
        setIsEmpty(true);
        onSignatureChange(null);
      }
    };

    const pad = new SignaturePadLib(canvas, {
      backgroundColor: "rgb(255, 255, 255)",
      penColor: "rgb(0, 0, 0)",
      minWidth: 1,
      maxWidth: 2.5,
    });

    pad.addEventListener("endStroke", () => {
      setIsEmpty(pad.isEmpty());
      onSignatureChange(pad.isEmpty() ? null : pad.toDataURL("image/png"));
    });

    padRef.current = pad;
    resizeCanvas();

    window.addEventListener("resize", resizeCanvas);
    return () => {
      window.removeEventListener("resize", resizeCanvas);
      pad.off();
    };
  }, []);

  const handleClear = () => {
    padRef.current?.clear();
    setIsEmpty(true);
    onSignatureChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleClear}
          disabled={isEmpty}
          className="h-7 text-xs gap-1"
        >
          <Eraser className="h-3 w-3" />
          Löschen
        </Button>
      </div>
      <div className="border rounded-lg overflow-hidden bg-white touch-none">
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: `${height}px`, touchAction: "none" }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {isEmpty ? "Bitte hier unterschreiben" : "✓ Unterschrift erfasst"}
      </p>
    </div>
  );
}
