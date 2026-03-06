import { useState, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Upload, FileText, Loader2, CheckCircle2 } from "lucide-react";
const PRODUCT_OPTIONS = [
  "HFX EBM",
  "HFX GOÄ - die KI für ihre Privatabrechnung",
  "HFX GOÄ/GOZ Live-Check",
  "HFX Doku",
  "HFX Wingmann",
  "HFX GOÄ/GOZ Permanent-Check",
  "HFX Praxismanagement Zahnmedizin",
];

interface Lead {
  id: string;
  hfx_customer_number: string;
  praxis_name: string;
  vorname: string;
  nachname: string;
  email: string;
  plz: string;
  ort?: string;
  adresse?: string;
  mobilnummer: string;
  mp_nummer?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
}

export function UploadPaperContractDialog({ open, onOpenChange, lead }: Props) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [productName, setProductName] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [durationMonths, setDurationMonths] = useState("12");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const resetForm = () => {
    setProductName("");
    setMonthlyPrice("");
    setStartDate(new Date().toISOString().split("T")[0]);
    setDurationMonths("12");
    setFile(null);
    setDone(false);
  };

  const handleClose = (open: boolean) => {
    if (!loading) {
      onOpenChange(open);
      if (!open) resetForm();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && f.type === "application/pdf") {
      setFile(f);
    } else if (f) {
      toast({ title: "Nur PDF erlaubt", variant: "destructive" });
      e.target.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!lead || !user?.id) return;
    if (!productName) {
      toast({ title: "Bitte Produkt auswählen", variant: "destructive" });
      return;
    }
    if (!file) {
      toast({ title: "Bitte PDF hochladen", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const endDate = addMonths(new Date(startDate), parseInt(durationMonths));

      // 1. Insert contract record first to get the ID
      const { data: contractData, error: contractError } = await supabase
        .from("contracts")
        .insert({
          customer_name: `${lead.vorname} ${lead.nachname}`.trim() || lead.praxis_name,
          product_name: productName,
          status: "eingegangen",
          email: lead.email,
          vorname: lead.vorname,
          nachname: lead.nachname,
          praxis: lead.praxis_name,
          plz: lead.plz,
          ort: lead.ort || null,
          adresse: lead.adresse || null,
          telefon: lead.mobilnummer,
          mp_nr: lead.mp_nummer || null,
          hfx_customer_number: lead.hfx_customer_number,
          monthly_price: parseFloat(monthlyPrice) || 0,
          start_date: startDate,
          end_date: endDate.toISOString().split("T")[0],
          duration_months: parseInt(durationMonths),
          created_by: user.id,
          sales_partner_id: user.id,
          sales_partner_name: profile?.full_name || "",
          notes: "[Papier] Vertrag per Upload eingereicht",
        })
        .select("id, customer_confirmation_token")
        .single();

      if (contractError) throw contractError;

      // 2. Upload PDF to storage
      const filePath = `paper-contracts/${contractData.id}/vertrag.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("contracts")
        .upload(filePath, file, { contentType: "application/pdf", upsert: true });

      if (uploadError) throw uploadError;

      // 3. Update contract with PDF path
      await supabase
        .from("contracts")
        .update({ paper_contract_pdf_path: filePath, document_name: file.name })
        .eq("id", contractData.id);

      // 4. Update lead status to "vertrag"
      await supabase
        .from("leads")
        .update({ status: "vertrag" })
        .eq("id", lead.id);

      // 5. Send confirmation email to customer
      await supabase.functions.invoke("send-contract-confirmation", {
        body: { contract_id: contractData.id },
      });

      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });

      setDone(true);
      toast({
        title: "Vertrag eingereicht",
        description: `Bestätigungs-E-Mail wurde an ${lead.email} gesendet.`,
      });
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({
        title: "Fehler beim Einreichen",
        description: err.message || "Unbekannter Fehler",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            Papiervertrag einreichen
          </DialogTitle>
          {lead && (
            <DialogDescription>
              {lead.praxis_name} – {lead.vorname} {lead.nachname} ({lead.hfx_customer_number})
            </DialogDescription>
          )}
        </DialogHeader>

        {done ? (
          <div className="py-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="bg-success/10 rounded-full p-4">
                <CheckCircle2 className="h-12 w-12 text-success" />
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold text-foreground">Vertrag eingereicht!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Der Interessent erscheint jetzt unter Verträge (Status: Eingegangen).
                Die Bestätigungs-E-Mail wurde an <strong>{lead?.email}</strong> gesendet.
              </p>
            </div>
            <Button onClick={() => handleClose(false)} className="w-full">
              Schließen
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {/* Product */}
              <div className="space-y-1.5">
                <Label htmlFor="product">Produkt *</Label>
                <Select value={productName} onValueChange={setProductName}>
                  <SelectTrigger id="product">
                    <SelectValue placeholder="Produkt auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PRODUCT_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Price */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="price">Monatspreis (€)</Label>
                  <Input
                    id="price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="z.B. 179"
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="duration">Laufzeit (Monate)</Label>
                  <Select value={durationMonths} onValueChange={setDurationMonths}>
                    <SelectTrigger id="duration">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="6">6 Monate</SelectItem>
                      <SelectItem value="12">12 Monate</SelectItem>
                      <SelectItem value="24">24 Monate</SelectItem>
                      <SelectItem value="36">36 Monate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Start date */}
              <div className="space-y-1.5">
                <Label htmlFor="start">Startdatum</Label>
                <Input
                  id="start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              {/* PDF Upload */}
              <div className="space-y-1.5">
                <Label>Unterzeichneter Vertrag (PDF) *</Label>
                <div
                  className={`border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors ${
                    file
                      ? "border-success bg-success/5"
                      : "border-input hover:border-primary/50 hover:bg-muted/50"
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {file ? (
                    <div className="flex items-center justify-center gap-2 text-success">
                      <FileText className="h-5 w-5" />
                      <span className="text-sm font-medium">{file.name}</span>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                      <p className="text-sm text-muted-foreground">
                        PDF-Datei auswählen oder hierher ziehen
                      </p>
                      <p className="text-xs text-muted-foreground">Nur PDF-Dateien erlaubt</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                Abbrechen
              </Button>
              <Button onClick={handleSubmit} disabled={loading || !productName || !file}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Wird eingereicht…
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Vertrag einreichen
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
