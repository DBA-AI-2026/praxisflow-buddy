import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { showPdfInViewer } from "@/lib/pdfViewerState";
import { uploadAgbVersion, deactivateCurrentAgb } from "@/lib/agbVersions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, ExternalLink, Upload, X, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useRef } from "react";

interface Product {
  id: string;
  name: string;
  agb_pdf_path: string | null;
  is_active: boolean;
}

export default function AgbManagement() {
  const { toast } = useToast();
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const { data: products, isLoading, refetch } = useQuery({
    queryKey: ["products-agb"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, agb_pdf_path, is_active")
        .order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const handleView = async (path: string, productName: string) => {
    try {
      const { data: blob, error } = await supabase.storage.from("contracts").download(path);
      if (error || !blob) throw error ?? new Error("Datei konnte nicht geladen werden");
      const blobUrl = URL.createObjectURL(blob);
      showPdfInViewer(blobUrl, `AGB - ${productName}.pdf`);
    } catch (err: any) {
      toast({ title: "Fehler beim Öffnen", description: err?.message, variant: "destructive" });
    }
  };

  const handleUpload = async (productId: string, file: File) => {
    if (file.type !== "application/pdf") {
      toast({ title: "Nur PDF-Dateien erlaubt", variant: "destructive" });
      return;
    }
    setUploadingId(productId);
    try {
      const version = await uploadAgbVersion(productId, file);
      toast({ title: `AGB-Version ${version} gespeichert` });
      refetch();
    } catch (err: any) {
      toast({ title: "Upload fehlgeschlagen", description: err.message, variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const handleRemove = async (productId: string, _currentPath: string) => {
    setUploadingId(productId);
    try {
      await deactivateCurrentAgb(productId);
      toast({ title: "AGB deaktiviert" });
      refetch();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setUploadingId(null);
    }
  };

  const activeProducts = products?.filter((p) => p.is_active) ?? [];
  const inactiveProducts = products?.filter((p) => !p.is_active) ?? [];
  const withAgb = activeProducts.filter((p) => p.agb_pdf_path);
  const withoutAgb = activeProducts.filter((p) => !p.agb_pdf_path);

  return (
    <MainLayout title="AGB-Verwaltung" subtitle="Produktspezifische AGB-PDFs verwalten">
      <div className="space-y-6">

        {/* Summary */}
        <div className="flex gap-3 flex-wrap">
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            {withAgb.length} mit AGB
          </Badge>
          <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
            {withoutAgb.length} ohne AGB
          </Badge>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4">
            {[...activeProducts, ...inactiveProducts].map((product) => (
              <ProductAgbRow
                key={product.id}
                product={product}
                uploading={uploadingId === product.id}
                onView={handleView}
                onUpload={handleUpload}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}

function ProductAgbRow({
  product,
  uploading,
  onView,
  onUpload,
  onRemove,
}: {
  product: Product;
  uploading: boolean;
  onView: (path: string, name: string) => void;
  onUpload: (id: string, file: File) => void;
  onRemove: (id: string, path: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Card className={!product.is_active ? "opacity-60" : ""}>
      <CardContent className="flex items-center gap-4 py-4">
        <FileText className="h-5 w-5 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{product.name}</span>
            {!product.is_active && (
              <Badge variant="secondary" className="text-xs">inaktiv</Badge>
            )}
          </div>
          {product.agb_pdf_path ? (
            <span className="text-xs text-muted-foreground">{product.agb_pdf_path}</span>
          ) : (
            <span className="text-xs text-destructive">Kein AGB-PDF hinterlegt</span>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onUpload(product.id, file);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />

        <div className="flex items-center gap-2 flex-shrink-0">
          {product.agb_pdf_path ? (
            <>
              <Button size="sm" variant="outline" onClick={() => onView(product.agb_pdf_path!, product.name)} disabled={uploading}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ansehen
              </Button>
              <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                Ersetzen
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onRemove(product.id, product.agb_pdf_path!)} disabled={uploading}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
              PDF hochladen
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
