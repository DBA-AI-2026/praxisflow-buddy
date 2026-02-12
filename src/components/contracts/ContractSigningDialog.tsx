import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "./SignaturePad";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { PDFDocument } from "pdf-lib";
import { FileText, Loader2, ExternalLink, Upload } from "lucide-react";

interface ContractSigningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: {
    id: string;
    customer_name: string;
    product_name: string;
    document_url?: string | null;
    document_name?: string | null;
  };
}

export function ContractSigningDialog({ open, onOpenChange, contract }: ContractSigningDialogProps) {
  const [ort, setOrt] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().split("T")[0]);
  const [partnerSig, setPartnerSig] = useState<string | null>(null);
  const [kundenSig, setKundenSig] = useState<string | null>(null);
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const hasTemplate = !!contract.document_url || !!templateFile;
  const canSign = partnerSig && kundenSig && ort && datum && hasTemplate;

  const embedSignaturesInPdf = async (pdfBytes: ArrayBuffer): Promise<Uint8Array> => {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width, height } = lastPage.getSize();

    // Embed partner signature
    if (partnerSig) {
      const pngBytes = await fetch(partnerSig).then((r) => r.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngBytes);
      const sigDims = pngImage.scale(0.4);
      lastPage.drawImage(pngImage, {
        x: 50,
        y: 80,
        width: Math.min(sigDims.width, width * 0.35),
        height: Math.min(sigDims.height, 60),
      });
    }

    // Embed customer signature
    if (kundenSig) {
      const pngBytes = await fetch(kundenSig).then((r) => r.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngBytes);
      const sigDims = pngImage.scale(0.4);
      lastPage.drawImage(pngImage, {
        x: width / 2 + 20,
        y: 80,
        width: Math.min(sigDims.width, width * 0.35),
        height: Math.min(sigDims.height, 60),
      });
    }

    // Add location and date text
    const font = await pdfDoc.embedFont("Helvetica" as any);
    lastPage.drawText(`Ort: ${ort}    Datum: ${new Date(datum).toLocaleDateString("de-DE")}`, {
      x: 50,
      y: 150,
      size: 10,
      font,
    });
    lastPage.drawText("Vertriebspartner", {
      x: 50,
      y: 65,
      size: 8,
      font,
    });
    lastPage.drawText("Kunde", {
      x: width / 2 + 20,
      y: 65,
      size: 8,
      font,
    });

    return pdfDoc.save();
  };

  const handleSign = async () => {
    if (!canSign || !user) return;
    setIsSigning(true);

    try {
      let pdfBytes: ArrayBuffer;

      if (templateFile) {
        // Use newly uploaded template
        pdfBytes = await templateFile.arrayBuffer();
      } else if (contract.document_url) {
        // Fetch existing template
        const response = await fetch(contract.document_url);
        if (!response.ok) throw new Error("PDF konnte nicht geladen werden");
        pdfBytes = await response.arrayBuffer();
      } else {
        throw new Error("Keine PDF-Vorlage vorhanden");
      }

      // Embed signatures
      const signedPdfBytes = await embedSignaturesInPdf(pdfBytes);

      // Upload signed PDF
      const signedFileName = `vertrag_${contract.customer_name.replace(/\s+/g, "_")}_signed.pdf`;
      const filePath = `${user.id}/signed/${crypto.randomUUID()}-${signedFileName}`;
      
      const { error: uploadError } = await supabase.storage
        .from("contracts")
        .upload(filePath, signedPdfBytes, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("contracts")
        .getPublicUrl(filePath);

      // Also upload template if it was a new file
      let templateUrl = contract.document_url;
      let templateName = contract.document_name;
      if (templateFile && !contract.document_url) {
        const templatePath = `${user.id}/templates/${crypto.randomUUID()}-${templateFile.name}`;
        await supabase.storage.from("contracts").upload(templatePath, templateFile);
        const { data: tmplUrl } = supabase.storage.from("contracts").getPublicUrl(templatePath);
        templateUrl = tmplUrl.publicUrl;
        templateName = templateFile.name;
      }

      // Update contract with signed document
      const { error: updateError } = await supabase
        .from("contracts")
        .update({
          document_url: templateUrl,
          document_name: templateName,
          status: "aktiv",
        })
        .eq("id", contract.id);
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({
        title: "Vertrag unterschrieben",
        description: "Das unterschriebene PDF wurde gespeichert und der Vertrag auf 'Aktiv' gesetzt.",
      });
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Fehler beim Unterschreiben", description: err.message, variant: "destructive" });
    } finally {
      setIsSigning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Vertrag unterschreiben
          </DialogTitle>
          <DialogDescription>
            {contract.customer_name} – {contract.product_name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* PDF Template */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Vertragsvorlage (PDF)</Label>
            {contract.document_url ? (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <FileText className="h-5 w-5 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{contract.document_name || "Vertrag.pdf"}</p>
                  <p className="text-xs text-muted-foreground">PDF-Vorlage hinterlegt</p>
                </div>
                <a href={contract.document_url} target="_blank" rel="noreferrer">
                  <Button variant="outline" size="sm" className="gap-1">
                    <ExternalLink className="h-3 w-3" />
                    Öffnen
                  </Button>
                </a>
              </div>
            ) : (
              <div className="space-y-2">
                <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {templateFile ? templateFile.name : "PDF-Vorlage hochladen"}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
                  />
                </label>
                {templateFile && (
                  <p className="text-xs text-green-600">✓ {templateFile.name} ausgewählt</p>
                )}
              </div>
            )}
          </div>

          {/* Ort & Datum */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Ort & Datum</Label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="sign-ort">Ort *</Label>
                <Input
                  id="sign-ort"
                  value={ort}
                  onChange={(e) => setOrt(e.target.value)}
                  placeholder="z.B. München"
                  required
                />
              </div>
              <div>
                <Label htmlFor="sign-datum">Datum *</Label>
                <Input
                  id="sign-datum"
                  type="date"
                  value={datum}
                  onChange={(e) => setDatum(e.target.value)}
                  required
                />
              </div>
            </div>
          </div>

          {/* Signatures */}
          <div className="space-y-4">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Unterschriften</Label>
            <SignaturePad
              label="Vertriebspartner"
              onSignatureChange={setPartnerSig}
              height={140}
            />
            <SignaturePad
              label="Kunde"
              onSignatureChange={setKundenSig}
              height={140}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={handleSign}
            disabled={!canSign || isSigning}
          >
            {isSigning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird unterschrieben...
              </>
            ) : (
              "Vertrag unterschreiben"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
