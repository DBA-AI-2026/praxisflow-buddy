import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, X, Loader2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Props {
  productId: string;
  currentPath: string | null;
  onUploaded: () => void;
}

export function AgbUploadSection({ productId, currentPath, onUploaded }: Props) {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Nur PDF-Dateien erlaubt", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const path = `agb/${productId}.pdf`;

      // Upload to contracts bucket (private)
      const { error: uploadError } = await supabase.storage
        .from("contracts")
        .upload(path, file, { upsert: true, contentType: "application/pdf" });
      if (uploadError) throw uploadError;

      // Save path to product
      const { error: updateError } = await supabase
        .from("products")
        .update({ agb_pdf_path: path } as any)
        .eq("id", productId);
      if (updateError) throw updateError;

      toast({ title: "AGB-PDF hochgeladen" });
      onUploaded();
    } catch (err: any) {
      toast({ title: "Upload fehlgeschlagen", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setUploading(true);
    try {
      if (currentPath) {
        await supabase.storage.from("contracts").remove([currentPath]);
      }
      const { error } = await supabase
        .from("products")
        .update({ agb_pdf_path: null } as any)
        .eq("id", productId);
      if (error) throw error;
      toast({ title: "AGB-PDF entfernt" });
      onUploaded();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleView = async () => {
    if (!currentPath) return;
    const { data } = await supabase.storage
      .from("contracts")
      .createSignedUrl(currentPath, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank");
    }
  };

  return (
    <div className="rounded-md border p-3 bg-background">
      <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        AGB-PDF
      </h4>
      <input
        ref={fileRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleUpload}
      />
      {currentPath ? (
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground truncate flex-1">{currentPath.split("/").pop()}</span>
          <Button variant="ghost" size="sm" onClick={handleView} disabled={uploading}>
            <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ansehen
          </Button>
          <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
            Ersetzen
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={handleRemove} disabled={uploading}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
          AGB-PDF hochladen
        </Button>
      )}
    </div>
  );
}
