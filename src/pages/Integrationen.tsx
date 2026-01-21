import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Download,
  Upload,
  RefreshCw,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Clock,
  FileSpreadsheet,
  Building2,
  Euro,
  Calendar,
  Loader2,
  Eye,
  FileCheck,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLexwareIntegration } from "@/hooks/useLexwareIntegration";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface PreviewRevenue {
  id: string;
  customer_name: string;
  invoice_number: string;
  invoice_date: string;
  product_name: string;
  quantity: number;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
}

export default function Integrationen() {
  const {
    settings,
    syncLogs,
    isLoading,
    isConnecting,
    isExporting,
    connect,
    disconnect,
    exportData,
    updateSettings,
    refresh,
  } = useLexwareIntegration();

  // Lexware Settings
  const [lexwareApiKey, setLexwareApiKey] = useState("");
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(false);
  const [syncInterval, setSyncInterval] = useState("daily");
  const [syncTime, setSyncTime] = useState("14:00");

  // Export Settings
  const [exportDateFrom, setExportDateFrom] = useState("");
  const [exportDateTo, setExportDateTo] = useState("");
  const [exportType, setExportType] = useState<"umsaetze" | "rechnungen" | "provisionen">("umsaetze");

  // Preview Dialog
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewRevenue[]>([]);

  // Sync local state with settings from backend
  useEffect(() => {
    if (settings) {
      setAutoSyncEnabled(settings.auto_sync_enabled);
      setSyncInterval(settings.sync_interval);
      setSyncTime(settings.sync_time);
    }
  }, [settings]);

  const handleConnect = async () => {
    const success = await connect(lexwareApiKey);
    if (success) {
      setLexwareApiKey("");
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
  };

  const handleShowPreview = async () => {
    setPreviewLoading(true);
    setPreviewOpen(true);

    try {
      let query = supabase
        .from("customer_revenues")
        .select("id, customer_name, invoice_number, invoice_date, product_name, quantity, net_amount, tax_amount, gross_amount")
        .eq("exported_to_lexware", false)
        .order("invoice_date", { ascending: true });

      if (exportDateFrom) {
        query = query.gte("invoice_date", exportDateFrom);
      }
      if (exportDateTo) {
        query = query.lte("invoice_date", exportDateTo);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPreviewData((data as PreviewRevenue[]) || []);
    } catch (error) {
      console.error("Error loading preview:", error);
      setPreviewData([]);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleExport = async () => {
    setPreviewOpen(false);
    await exportData(exportType, exportDateFrom, exportDateTo);
  };

  const handleSaveAutoSync = async () => {
    await updateSettings(autoSyncEnabled, syncInterval, syncTime);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "success":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      case "pending":
        return <Clock className="h-4 w-4 text-warning" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Erfolgreich</Badge>;
      case "error":
        return <Badge variant="destructive">Fehler</Badge>;
      case "pending":
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Ausstehend</Badge>;
      default:
        return <Badge variant="outline">Unbekannt</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd.MM.yyyy HH:mm", { locale: de });
    } catch {
      return dateString;
    }
  };

  const formatShortDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd.MM.yyyy", { locale: de });
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  // Calculate preview totals
  const previewTotals = {
    count: previewData.length,
    netTotal: previewData.reduce((sum, r) => sum + Number(r.net_amount), 0),
    taxTotal: previewData.reduce((sum, r) => sum + Number(r.tax_amount), 0),
    grossTotal: previewData.reduce((sum, r) => sum + Number(r.gross_amount), 0),
  };

  if (isLoading) {
    return (
      <MainLayout title="Buchhaltungs-Integrationen" subtitle="Laden...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  const isConnected = settings?.is_connected ?? false;

  return (
    <MainLayout 
      title="Buchhaltungs-Integrationen" 
      subtitle="Lexware und DATEV Schnittstellen für automatische Umsatzübertragung"
    >
      {/* Export Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Export-Vorschau
            </DialogTitle>
            <DialogDescription>
              Diese Umsätze werden nach Lexware übertragen. Überprüfen Sie die Daten vor dem Export.
            </DialogDescription>
          </DialogHeader>

          {previewLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : previewData.length === 0 ? (
            <div className="text-center py-12">
              <FileCheck className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="text-lg font-medium text-foreground">Keine Daten zum Exportieren</p>
              <p className="text-sm text-muted-foreground mt-1">
                Alle Umsätze wurden bereits exportiert oder es gibt keine Umsätze im gewählten Zeitraum.
              </p>
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-4 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Anzahl</p>
                  <p className="text-lg font-semibold">{previewTotals.count} Positionen</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Netto</p>
                  <p className="text-lg font-semibold">{formatCurrency(previewTotals.netTotal)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">MwSt.</p>
                  <p className="text-lg font-semibold">{formatCurrency(previewTotals.taxTotal)}</p>
                </div>
                <div className="p-3 rounded-lg bg-primary/10">
                  <p className="text-xs text-muted-foreground">Brutto</p>
                  <p className="text-lg font-semibold text-primary">{formatCurrency(previewTotals.grossTotal)}</p>
                </div>
              </div>

              {/* Data Table */}
              <ScrollArea className="h-[400px] rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead>Rechnungsnr.</TableHead>
                      <TableHead>Kunde</TableHead>
                      <TableHead>Produkt</TableHead>
                      <TableHead>Datum</TableHead>
                      <TableHead className="text-right">Menge</TableHead>
                      <TableHead className="text-right">Netto</TableHead>
                      <TableHead className="text-right">Brutto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewData.map((revenue) => (
                      <TableRow key={revenue.id}>
                        <TableCell className="font-medium">{revenue.invoice_number}</TableCell>
                        <TableCell>{revenue.customer_name}</TableCell>
                        <TableCell>{revenue.product_name}</TableCell>
                        <TableCell>{formatShortDate(revenue.invoice_date)}</TableCell>
                        <TableCell className="text-right">{revenue.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(Number(revenue.net_amount))}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(Number(revenue.gross_amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Abbrechen
            </Button>
            <Button 
              onClick={handleExport} 
              disabled={previewData.length === 0 || isExporting}
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exportiere...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  {previewTotals.count} Positionen exportieren
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="lexware" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="lexware" className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4" />
            Lexware
          </TabsTrigger>
          <TabsTrigger value="datev" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            DATEV
          </TabsTrigger>
        </TabsList>

        {/* Lexware Tab */}
        <TabsContent value="lexware" className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Connection Settings */}
            <div className="lg:col-span-1 space-y-6">
              <div className="card-elevated p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Verbindung</h2>
                  {isConnected ? (
                    <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Verbunden
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground">
                      Nicht verbunden
                    </Badge>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <Label htmlFor="lexware-api-key">API-Key</Label>
                    <Input
                      id="lexware-api-key"
                      type="password"
                      placeholder={isConnected ? "****" : "Ihr Lexware API-Key"}
                      value={lexwareApiKey}
                      onChange={(e) => setLexwareApiKey(e.target.value)}
                      disabled={isConnected || isConnecting}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Generieren Sie Ihren API-Key unter app.lexware.de/addons/public-api
                    </p>
                  </div>

                  {isConnected ? (
                    <Button 
                      variant="outline" 
                      onClick={handleDisconnect}
                      className="w-full"
                    >
                      Verbindung trennen
                    </Button>
                  ) : (
                    <Button 
                      onClick={handleConnect} 
                      className="w-full"
                      disabled={isConnecting || !lexwareApiKey}
                    >
                      {isConnecting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Verbinde...
                        </>
                      ) : (
                        "Verbinden"
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Auto-Sync Settings */}
              <div className="card-elevated p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">Auto-Sync</h2>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label>Automatische Synchronisierung</Label>
                      <p className="text-xs text-muted-foreground">
                        Umsätze automatisch übertragen
                      </p>
                    </div>
                    <Switch
                      checked={autoSyncEnabled}
                      onCheckedChange={setAutoSyncEnabled}
                      disabled={!isConnected}
                    />
                  </div>

                  {autoSyncEnabled && (
                    <>
                      <div>
                        <Label>Intervall</Label>
                        <Select value={syncInterval} onValueChange={setSyncInterval}>
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Täglich</SelectItem>
                            <SelectItem value="weekly">Wöchentlich</SelectItem>
                            <SelectItem value="monthly">Monatlich</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label>Uhrzeit</Label>
                        <Input
                          type="time"
                          value={syncTime}
                          onChange={(e) => setSyncTime(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </>
                  )}

                  <Button 
                    variant="outline" 
                    onClick={handleSaveAutoSync}
                    disabled={!isConnected}
                    className="w-full"
                  >
                    Einstellungen speichern
                  </Button>

                  {settings?.last_sync_at && (
                    <p className="text-xs text-muted-foreground text-center">
                      Letzter Sync: {formatDate(settings.last_sync_at)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Manual Export & History */}
            <div className="lg:col-span-2 space-y-6">
              {/* Manual Export */}
              <div className="card-elevated p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Upload className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-lg font-semibold text-foreground">Manueller Export</h2>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label>Datentyp</Label>
                    <Select value={exportType} onValueChange={(v) => setExportType(v as typeof exportType)}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="umsaetze">
                          <div className="flex items-center gap-2">
                            <Euro className="h-4 w-4" />
                            Umsätze pro Kunde
                          </div>
                        </SelectItem>
                        <SelectItem value="rechnungen">
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-4 w-4" />
                            Rechnungen
                          </div>
                        </SelectItem>
                        <SelectItem value="provisionen">
                          <div className="flex items-center gap-2">
                            <Euro className="h-4 w-4" />
                            Provisionen
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Von</Label>
                    <div className="relative mt-1">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={exportDateFrom}
                        onChange={(e) => setExportDateFrom(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div>
                    <Label>Bis</Label>
                    <div className="relative mt-1">
                      <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        type="date"
                        value={exportDateTo}
                        onChange={(e) => setExportDateTo(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  <div className="flex items-end gap-2">
                    <Button 
                      variant="outline"
                      onClick={handleShowPreview} 
                      disabled={!isConnected}
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Vorschau
                    </Button>
                  </div>
                </div>

                <div className="mt-4 flex gap-3">
                  <Button 
                    onClick={handleShowPreview} 
                    disabled={!isConnected || isExporting}
                    className="flex-1"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Übertrage...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Vorschau & Export nach Lexware
                      </>
                    )}
                  </Button>
                </div>

                <div className="mt-4 p-3 rounded-lg bg-muted/50 flex items-start gap-2">
                  <Download className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="text-sm text-muted-foreground">
                    <p className="font-medium text-foreground">Lokaler Download</p>
                    <p>Alternativ können Sie die Daten auch als Lexware-kompatible Datei herunterladen.</p>
                    <Button variant="link" size="sm" className="px-0 h-auto mt-1">
                      Als Datei herunterladen
                    </Button>
                  </div>
                </div>
              </div>

              {/* Sync History */}
              <div className="card-elevated p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-foreground">Übertragungshistorie</h2>
                  <Button variant="ghost" size="sm" onClick={refresh}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Aktualisieren
                  </Button>
                </div>

                <div className="space-y-3">
                  {syncLogs.map((log) => (
                    <div
                      key={log.id}
                      className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      {getStatusIcon(log.status)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {log.message}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(log.created_at)}
                        </p>
                      </div>
                      {getStatusBadge(log.status)}
                    </div>
                  ))}
                </div>

                {syncLogs.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>Noch keine Übertragungen durchgeführt</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* DATEV Tab */}
        <TabsContent value="datev" className="space-y-6">
          <div className="card-elevated p-8 text-center">
            <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              DATEV-Integration
            </h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-4">
              Die DATEV-Schnittstelle befindet sich in Entwicklung. 
              DATEV verwendet ein komplexeres Authentifizierungsverfahren (OAuth 2.0 mit SmartCard) 
              und Batch-basierte Datenübertragung im DATEV-ASCII-Format.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                <Clock className="h-3 w-3 mr-1" />
                In Entwicklung
              </Badge>
              <Badge variant="outline">
                Geplant: Q2 2024
              </Badge>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-muted/50 text-left max-w-lg mx-auto">
              <p className="text-sm font-medium text-foreground mb-2">Geplante Features:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Export im DATEV-ASCII-Format (EXTF)</li>
                <li>• OAuth 2.0 Authentifizierung</li>
                <li>• Automatischer Upload zu DATEV Unternehmen Online</li>
                <li>• Mandanten-Zuordnung</li>
              </ul>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
