import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SignaturePad } from "./SignaturePad";
import { fillPdfTemplate, type PdfFillData } from "./pdfAutoFill";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { PDFDocument } from "pdf-lib";
import { FileText, Loader2, ExternalLink, Upload, CheckCircle2 } from "lucide-react";

const TEMPLATE_PDF_PATH = "/templates/vertrag-honorarfuchs.pdf";

export interface ContractForSigning {
  id: string;
  customer_name: string;
  product_name: string;
  document_url?: string | null;
  document_name?: string | null;
  // Additional fields for auto-fill
  monthly_price?: number;
  one_time_fee?: number;
  start_date?: string;
  end_date?: string;
  duration_months?: number;
  modules?: string[] | null;
  sales_partner_name?: string | null;
  mp_nr?: string | null;
  notes?: string | null;
}

interface ContractSigningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: ContractForSigning;
}

export function ContractSigningDialog({ open, onOpenChange, contract }: ContractSigningDialogProps) {
  const [ort, setOrt] = useState("");
  const [datum, setDatum] = useState(new Date().toISOString().split("T")[0]);
  // Extra fields for PDF auto-fill
  const [arztName, setArztName] = useState("");
  const [strasseHausnummer, setStrasseHausnummer] = useState("");
  const [plzOrt, setPlzOrt] = useState("");
  const [email, setEmail] = useState("");
  const [fachrichtung, setFachrichtung] = useState("");
  // SEPA Lastschrift
  const [kontoinhaber, setKontoinhaber] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  
  const [partnerSig, setPartnerSig] = useState<string | null>(null);
  const [kundenSig, setKundenSig] = useState<string | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const isValidIban = (value: string): boolean => {
    const cleaned = value.replace(/\s/g, "").toUpperCase();
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleaned)) return false;
    const rearranged = cleaned.slice(4) + cleaned.slice(0, 4);
    const numeric = rearranged.replace(/[A-Z]/g, (ch) => (ch.charCodeAt(0) - 55).toString());
    let remainder = numeric;
    while (remainder.length > 2) {
      const block = remainder.slice(0, 9);
      remainder = (parseInt(block, 10) % 97).toString() + remainder.slice(block.length);
    }
    return parseInt(remainder, 10) % 97 === 1;
  };

  const ibanValid = isValidIban(iban);
  const canSign = partnerSig && kundenSig && ort && datum && arztName && ibanValid;

  const embedSignaturesInPdf = async (pdfBytes: ArrayBuffer): Promise<Uint8Array> => {
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();
    const lastPage = pages[pages.length - 1];
    const { width } = lastPage.getSize();

    // Embed signatures on page 2 (index 1) if available, otherwise last page
    const sigPage = pages.length > 1 ? pages[1] : lastPage;
    const sigPageSize = sigPage.getSize();

    if (partnerSig) {
      const pngBytes = await fetch(partnerSig).then((r) => r.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngBytes);
      const sigDims = pngImage.scale(0.35);
      sigPage.drawImage(pngImage, {
        x: 50,
        y: 60,
        width: Math.min(sigDims.width, sigPageSize.width * 0.3),
        height: Math.min(sigDims.height, 50),
      });
    }

    if (kundenSig) {
      const pngBytes = await fetch(kundenSig).then((r) => r.arrayBuffer());
      const pngImage = await pdfDoc.embedPng(pngBytes);
      const sigDims = pngImage.scale(0.35);
      sigPage.drawImage(pngImage, {
        x: sigPageSize.width / 2 + 30,
        y: 60,
        width: Math.min(sigDims.width, sigPageSize.width * 0.3),
        height: Math.min(sigDims.height, 50),
      });
    }

    // Also add signatures on page 4 (contract terms) if it exists
    if (pages.length > 3) {
      const contractPage = pages[3];
      const cpSize = contractPage.getSize();
      
      if (partnerSig) {
        const pngBytes = await fetch(partnerSig).then((r) => r.arrayBuffer());
        const pngImage = await pdfDoc.embedPng(pngBytes);
        const sigDims = pngImage.scale(0.3);
        contractPage.drawImage(pngImage, {
          x: 120,
          y: 55,
          width: Math.min(sigDims.width, cpSize.width * 0.25),
          height: Math.min(sigDims.height, 45),
        });
      }

      if (kundenSig) {
        const pngBytes = await fetch(kundenSig).then((r) => r.arrayBuffer());
        const pngImage = await pdfDoc.embedPng(pngBytes);
        const sigDims = pngImage.scale(0.3);
        contractPage.drawImage(pngImage, {
          x: cpSize.width / 2 + 30,
          y: 55,
          width: Math.min(sigDims.width, cpSize.width * 0.25),
          height: Math.min(sigDims.height, 45),
        });
      }
    }

    return pdfDoc.save();
  };

  const handleSign = async () => {
    if (!canSign || !user) return;
    setIsSigning(true);

    try {
      // 1. Load template PDF
      const templateResponse = await fetch(TEMPLATE_PDF_PATH);
      if (!templateResponse.ok) throw new Error("PDF-Vorlage konnte nicht geladen werden");
      const templateBytes = await templateResponse.arrayBuffer();

      // 2. Auto-fill contract data into PDF
      const fillData: PdfFillData = {
        praxisName: contract.customer_name,
        fachrichtung: fachrichtung || undefined,
        kontoinhaber: kontoinhaber || undefined,
        iban: iban || undefined,
        bic: bic || undefined,
        strasseHausnummer: strasseHausnummer || undefined,
        plzOrt: plzOrt || undefined,
        arztName,
        email: email || undefined,
        productName: contract.product_name,
        modules: contract.modules || undefined,
        monthlyPrice: contract.monthly_price || 0,
        oneTimeFee: contract.one_time_fee || 0,
        startDate: contract.start_date || new Date().toISOString(),
        endDate: contract.end_date || new Date().toISOString(),
        durationMonths: contract.duration_months || 12,
        salesPartnerName: contract.sales_partner_name || undefined,
        ort,
        datum,
      };

      const filledPdfBytes = await fillPdfTemplate(templateBytes, fillData);

      // 3. Embed signatures into the filled PDF
      const signedPdfBytes = await embedSignaturesInPdf(filledPdfBytes.buffer as ArrayBuffer);

      // 4. Upload signed PDF
      const signedFileName = `vertrag_${contract.customer_name.replace(/\s+/g, "_")}_signed.pdf`;
      const filePath = `${user.id}/signed/${crypto.randomUUID()}-${signedFileName}`;

      const { error: uploadError } = await supabase.storage
        .from("contracts")
        .upload(filePath, signedPdfBytes, { contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("contracts")
        .getPublicUrl(filePath);

      // 5. Update contract record
      const { error: updateError } = await supabase
        .from("contracts")
        .update({
          document_url: urlData.publicUrl,
          document_name: signedFileName,
          status: "aktiv",
          iban: iban || null,
          bic: bic || null,
          kontoinhaber: kontoinhaber || null,
        } as any)
        .eq("id", contract.id);
      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      toast({
        title: "Vertrag unterschrieben",
        description: "Das PDF wurde mit allen Daten ausgefüllt, unterschrieben und gespeichert.",
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
      <DialogContent className="sm:max-w-[650px] max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Vertrag ausfüllen & unterschreiben
          </DialogTitle>
          <DialogDescription>
            {contract.customer_name} – {contract.product_name}
            <br />
            <span className="text-xs">Die eingegebenen Daten werden automatisch in die PDF-Vorlage übernommen.</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Template info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Honorarfuchs Vertragsvorlage</p>
              <p className="text-xs text-muted-foreground">PDF wird automatisch mit Ihren Angaben ausgefüllt</p>
            </div>
          </div>

          {/* Praxis-Stammdaten */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Praxis-Stammdaten</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="arzt-name">Name des Arztes *</Label>
                <Input
                  id="arzt-name"
                  value={arztName}
                  onChange={(e) => setArztName(e.target.value)}
                  placeholder="Dr. Max Mustermann"
                  required
                />
              </div>
              <div>
                <Label htmlFor="fachrichtung">Fachrichtung</Label>
                <Input
                  id="fachrichtung"
                  value={fachrichtung}
                  onChange={(e) => setFachrichtung(e.target.value)}
                  placeholder="z.B. Allgemeinmedizin"
                />
              </div>
              <div>
                <Label htmlFor="strasse">Straße / Hausnummer</Label>
                <Input
                  id="strasse"
                  value={strasseHausnummer}
                  onChange={(e) => setStrasseHausnummer(e.target.value)}
                  placeholder="Musterstr. 1"
                />
              </div>
              <div>
                <Label htmlFor="plz-ort">PLZ / Ort</Label>
                <Input
                  id="plz-ort"
                  value={plzOrt}
                  onChange={(e) => setPlzOrt(e.target.value)}
                  placeholder="12345 Musterstadt"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="praxis-email">E-Mail-Adresse</Label>
                <Input
                  id="praxis-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="praxis@beispiel.de"
                />
              </div>
            </div>
          </div>

          {/* SEPA Lastschrifteinzug */}
          <div className="space-y-3">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">SEPA-Lastschrifteinzug</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <Label htmlFor="kontoinhaber">Kontoinhaber</Label>
                <Input
                  id="kontoinhaber"
                  value={kontoinhaber}
                  onChange={(e) => setKontoinhaber(e.target.value)}
                  placeholder="Vor- und Nachname des Kontoinhabers"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="iban">IBAN *</Label>
                <Input
                  id="iban"
                  value={iban}
                  onChange={(e) => setIban(e.target.value.toUpperCase().replace(/\s/g, ""))}
                  placeholder="DE89 3704 0044 0532 0130 00"
                  required
                  className={iban && !ibanValid ? "border-destructive" : ""}
                />
                {iban && !ibanValid && (
                  <p className="text-xs text-destructive mt-1">Ungültiges IBAN-Format</p>
                )}
              </div>
              <div>
                <Label htmlFor="bic">BIC</Label>
                <Input
                  id="bic"
                  value={bic}
                  onChange={(e) => setBic(e.target.value.toUpperCase())}
                  placeholder="COBADEFFXXX"
                />
              </div>
            </div>
          </div>

          {/* Vertragsdaten (read-only, from contract) */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Vertragsdaten (aus Erfassung)</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-muted/50 rounded-lg text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Produkt</span>
                <p className="font-medium">{contract.product_name}</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Monatspreis</span>
                <p className="font-medium">{(contract.monthly_price || 0).toLocaleString("de-DE")} €</p>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Laufzeit</span>
                <p className="font-medium">{contract.duration_months || 12} Monate</p>
              </div>
              {contract.start_date && (
                <div>
                  <span className="text-muted-foreground text-xs">Beginn</span>
                  <p className="font-medium">{new Date(contract.start_date).toLocaleDateString("de-DE")}</p>
                </div>
              )}
              {contract.sales_partner_name && (
                <div>
                  <span className="text-muted-foreground text-xs">Vertriebspartner</span>
                  <p className="font-medium">{contract.sales_partner_name}</p>
                </div>
              )}
              {contract.modules && contract.modules.length > 0 && (
                <div>
                  <span className="text-muted-foreground text-xs">Module</span>
                  <p className="font-medium">{contract.modules.join(", ")}</p>
                </div>
              )}
            </div>
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
                Wird erstellt...
              </>
            ) : (
              "PDF ausfüllen & unterschreiben"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
