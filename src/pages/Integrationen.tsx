import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLexwareIntegration } from "@/hooks/useLexwareIntegration";
import { format } from "date-fns";
import { de } from "date-fns/locale";

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

  const handleExport = async () => {
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

                  <div className="flex items-end">
                    <Button 
                      onClick={handleExport} 
                      disabled={!isConnected || isExporting}
                      className="w-full"
                    >
                      {isExporting ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Übertrage...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4 mr-2" />
                          Nach Lexware
                        </>
                      )}
                    </Button>
                  </div>
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
