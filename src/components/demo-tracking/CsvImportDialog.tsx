import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Upload, Loader2, FileText, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(";").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const vals = line.split(";");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = vals[i]?.trim() || "";
    });
    return row;
  });
}

const FIELD_MAP: Record<string, string> = {
  hfx_customer_number: "hfx_customer_number",
  hfx_kundennummer: "hfx_customer_number",
  hfx_nr: "hfx_customer_number",
  kundennummer: "hfx_customer_number",
  firma: "company_name",
  unternehmen: "company_name",
  company_name: "company_name",
  praxis: "company_name",
  ansprechpartner: "contact_name",
  contact_name: "contact_name",
  kontakt: "contact_name",
  email: "email",
  "e-mail": "email",
  telefon: "telefon",
  phone: "telefon",
  produkt: "product_name",
  product_name: "product_name",
  notizen: "notes",
  notes: "notes",
  status: "status",
  testende: "test_phase_end",
  test_phase_end: "test_phase_end",
};

export function CsvImportDialog({ open, onOpenChange }: CsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCsv(text);
      setPreview(rows.slice(0, 5));
    };
    reader.readAsText(f, "utf-8");
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const rows = parseCsv(text);

      const mapped = rows.map((row) => {
        const out: Record<string, string | null> = {
          company_name: "Unbekannt",
          hfx_customer_number: null,
          contact_name: null,
          email: null,
          telefon: null,
          product_name: null,
          notes: null,
          status: "testphase",
          test_phase_end: null,
        };
        for (const [csvKey, val] of Object.entries(row)) {
          const target = FIELD_MAP[csvKey];
          if (target && val) out[target] = val;
        }
        return { ...out, created_by: user?.id };
      });

      let success = 0;
      let errors = 0;
      // Batch in chunks of 50
      for (let i = 0; i < mapped.length; i += 50) {
        const chunk = mapped.slice(i, i + 50);
        const { error } = await supabase.from("demo_downloads").insert(chunk as any);
        if (error) {
          errors += chunk.length;
        } else {
          success += chunk.length;
        }
      }

      setResult({ success, errors });
      queryClient.invalidateQueries({ queryKey: ["demo-downloads"] });
      toast({
        title: "CSV-Import abgeschlossen",
        description: `${success} importiert, ${errors} Fehler`,
        variant: errors > 0 ? "destructive" : "default",
      });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview([]);
    setResult(null);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>CSV-Import</DialogTitle>
          <DialogDescription>
            CSV-Datei mit Semikolon-Trennung hochladen. Erkannte Spalten: HFX_Kundennummer, Firma, Ansprechpartner, Email, Telefon, Produkt, Status, Testende.
          </DialogDescription>
        </DialogHeader>

        {!file ? (
          <div
            className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">CSV-Datei auswählen oder hierher ziehen</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        ) : result ? (
          <div className="text-center py-6">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-green-600" />
            <p className="font-medium">{result.success} Einträge importiert</p>
            {result.errors > 0 && <p className="text-sm text-destructive">{result.errors} Fehler</p>}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{file.name}</span>
              <Button variant="ghost" size="sm" onClick={reset}>Ändern</Button>
            </div>
            {preview.length > 0 && (
              <div className="text-xs text-muted-foreground">
                <p className="mb-1">Vorschau (erste {preview.length} Zeilen):</p>
                <div className="overflow-x-auto border rounded p-2 bg-muted/30 max-h-32">
                  <pre>{JSON.stringify(preview, null, 2)}</pre>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 pt-4">
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>
            {result ? "Schließen" : "Abbrechen"}
          </Button>
          {file && !result && (
            <Button onClick={handleImport} disabled={importing}>
              {importing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importiere...</> : "Importieren"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
