import { useState, useRef } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { showPdfInViewer } from "@/lib/pdfViewerState";
import {
  uploadAgbVersion,
  deactivateCurrentAgb,
  listAgbVersions,
  setCurrentAgbVersion,
  type AgbVersionRow,
} from "@/lib/agbVersions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ExternalLink,
  Upload,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
  History,
  RotateCcw,
} from "lucide-react";

interface Product {
  id: string;
  name: string;
  agb_pdf_path: string | null;
  is_active: boolean;
}

export default function AgbManagement() {
  const { toast } = useToast();
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const handleView = async (path: string, label: string) => {
    try {
      const { data: blob, error } = await supabase.storage.from("contracts").download(path);
      if (error || !blob) throw error ?? new Error("Datei konnte nicht geladen werden");
      const blobUrl = URL.createObjectURL(blob);
      showPdfInViewer(blobUrl, label);
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
                expanded={expandedId === product.id}
                onToggleExpand={() =>
                  setExpandedId((cur) => (cur === product.id ? null : product.id))
                }
                onView={handleView}
                onUpload={handleUpload}
                onRemove={handleRemove}
                onRefetchProducts={refetch}
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
  expanded,
  onToggleExpand,
  onView,
  onUpload,
  onRemove,
  onRefetchProducts,
}: {
  product: Product;
  uploading: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onView: (path: string, label: string) => void;
  onUpload: (id: string, file: File) => void;
  onRemove: (id: string, path: string) => void;
  onRefetchProducts: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <Card className={!product.is_active ? "opacity-60" : ""}>
      <CardContent className="py-4">
        <div className="flex items-center gap-4">
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
            <Button size="sm" variant="ghost" onClick={onToggleExpand}>
              <History className="h-3.5 w-3.5 mr-1" />
              {expanded ? "Historie schließen" : "Historie"}
            </Button>
            {product.agb_pdf_path ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onView(product.agb_pdf_path!, `AGB - ${product.name}.pdf`)}
                  disabled={uploading}
                >
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Ansehen
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1" />
                  )}
                  Neue Version hochladen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => onRemove(product.id, product.agb_pdf_path!)}
                  disabled={uploading}
                  title="AGB deaktivieren"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1" />
                )}
                Neue Version hochladen
              </Button>
            )}
          </div>
        </div>

        {expanded && (
          <VersionHistory
            productId={product.id}
            productName={product.name}
            onView={onView}
            onRefetchProducts={onRefetchProducts}
          />
        )}
      </CardContent>
    </Card>
  );
}

function VersionHistory({
  productId,
  productName,
  onView,
  onRefetchProducts,
}: {
  productId: string;
  productName: string;
  onView: (path: string, label: string) => void;
  onRefetchProducts: () => void;
}) {
  const { toast } = useToast();
  const [switchingVersion, setSwitchingVersion] = useState<number | null>(null);

  const { data: versions, isLoading, refetch } = useQuery({
    queryKey: ["agb-versions", productId],
    queryFn: () => listAgbVersions(productId),
  });

  const handleActivate = async (version: number) => {
    setSwitchingVersion(version);
    try {
      await setCurrentAgbVersion(productId, version);
      toast({ title: `Version ${version} ist jetzt aktuell` });
      await Promise.all([refetch(), Promise.resolve(onRefetchProducts())]);
    } catch (err: any) {
      toast({
        title: "Umschalten fehlgeschlagen",
        description: err?.message,
        variant: "destructive",
      });
    } finally {
      setSwitchingVersion(null);
    }
  };

  return (
    <div className="mt-4 border-t pt-4">
      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Historie wird geladen…
        </div>
      ) : !versions || versions.length === 0 ? (
        <div className="text-sm text-muted-foreground">Noch keine Versionen vorhanden.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3">Version</th>
                <th className="py-2 pr-3">Dateiname</th>
                <th className="py-2 pr-3">Datum</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3 text-right">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {versions.map((row: AgbVersionRow) => {
                const dateStr = new Date(row.uploaded_at).toLocaleString("de-DE");
                const isSwitching = switchingVersion === row.version;
                return (
                  <tr key={row.version} className="border-b last:border-0">
                    <td className="py-2 pr-3 font-mono">v{row.version}</td>
                    <td className="py-2 pr-3 truncate max-w-[240px]">
                      {row.file_name ?? row.storage_path.split("/").pop()}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{dateStr}</td>
                    <td className="py-2 pr-3">
                      {row.is_current ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Aktuell
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Archiviert</Badge>
                      )}
                    </td>
                    <td className="py-2 pr-0">
                      <div className="flex items-center gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onView(
                              row.storage_path,
                              `AGB - ${productName} v${row.version}.pdf`,
                            )
                          }
                        >
                          <ExternalLink className="h-3.5 w-3.5 mr-1" /> Download
                        </Button>
                        {!row.is_current && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleActivate(row.version)}
                            disabled={isSwitching}
                          >
                            {isSwitching ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : (
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            )}
                            Als aktuell setzen
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
