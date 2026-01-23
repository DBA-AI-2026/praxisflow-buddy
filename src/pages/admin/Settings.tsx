import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useSalesforceConnection } from "@/hooks/useSalesforceConnection";
import { Save, Euro, Bell, Database, CheckCircle2, XCircle, Loader2, ExternalLink, Unplug } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Pricing {
  hfxGoae: number;
  hfxEbm: number;
  hfxBenchmarkKzv: number;
  hfxDoku: number;
  hfxWingmann: number;
  hfxGoaeLiveCheck: number;
  hfxGozLiveCheck: number;
  hfxPraxismanagementZahn: number;
}

export default function AdminSettings() {
  const [pricing, setPricing] = useState<Pricing>({
    hfxGoae: 0,
    hfxEbm: 0,
    hfxBenchmarkKzv: 0,
    hfxDoku: 0,
    hfxWingmann: 0,
    hfxGoaeLiveCheck: 0,
    hfxGozLiveCheck: 0,
    hfxPraxismanagementZahn: 0,
  });
  const [notifications, setNotifications] = useState({
    newTicket: true,
    ticketAssigned: true,
    newPraxis: true,
    lizenzAblauf: true,
  });
  const [syncInterval, setSyncInterval] = useState("daily");
  const { toast } = useToast();

  const {
    connection: salesforce,
    isLoading: sfLoading,
    isConnecting: sfConnecting,
    connect: connectSalesforce,
    disconnect: disconnectSalesforce,
  } = useSalesforceConnection();

  const savePricing = () => {
    toast({
      title: "Preise gespeichert",
      description: "Die Preisänderungen wurden erfolgreich übernommen.",
    });
  };

  const saveNotifications = () => {
    toast({
      title: "Benachrichtigungen gespeichert",
      description: "Die Einstellungen wurden aktualisiert.",
    });
  };

  const handleConnectSalesforce = async () => {
    try {
      await connectSalesforce();
      toast({
        title: "Verbindung gestartet",
        description: "Bitte melden Sie sich im Salesforce-Fenster an.",
      });
    } catch {
      toast({
        title: "Fehler",
        description: "Die Verbindung konnte nicht gestartet werden.",
        variant: "destructive",
      });
    }
  };

  const handleDisconnectSalesforce = async () => {
    try {
      await disconnectSalesforce();
      toast({
        title: "Verbindung getrennt",
        description: "Salesforce wurde erfolgreich getrennt.",
      });
    } catch {
      toast({
        title: "Fehler",
        description: "Die Verbindung konnte nicht getrennt werden.",
        variant: "destructive",
      });
    }
  };

  const saveSyncSettings = () => {
    toast({
      title: "Sync-Einstellungen gespeichert",
      description: "Die Synchronisationseinstellungen wurden aktualisiert.",
    });
  };

  return (
    <MainLayout title="Einstellungen" subtitle="System- und Integrationseinstellungen">
      <Tabs defaultValue="preise" className="space-y-6">
        <TabsList>
          <TabsTrigger value="preise" className="gap-2">
            <Euro className="h-4 w-4" />
            Preise
          </TabsTrigger>
          <TabsTrigger value="benachrichtigungen" className="gap-2">
            <Bell className="h-4 w-4" />
            Benachrichtigungen
          </TabsTrigger>
          <TabsTrigger value="salesforce" className="gap-2">
            <Database className="h-4 w-4" />
            Salesforce
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preise">
          <div className="card-elevated p-6 max-w-xl">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Produktpreise
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Ändern Sie hier die monatlichen Preise für die verschiedenen
              Produktpakete.
            </p>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="hfxGoae">HFX GOÄ (€/Monat)</Label>
                <Input
                  id="hfxGoae"
                  type="number"
                  value={pricing.hfxGoae}
                  onChange={(e) =>
                    setPricing({ ...pricing, hfxGoae: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="hfxEbm">HFX EBM (€/Monat)</Label>
                <Input
                  id="hfxEbm"
                  type="number"
                  value={pricing.hfxEbm}
                  onChange={(e) =>
                    setPricing({ ...pricing, hfxEbm: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="hfxBenchmarkKzv">HFX Benchmark KZV (€/Monat)</Label>
                <Input
                  id="hfxBenchmarkKzv"
                  type="number"
                  value={pricing.hfxBenchmarkKzv}
                  onChange={(e) =>
                    setPricing({ ...pricing, hfxBenchmarkKzv: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="hfxDoku">HFX Doku (€/Monat)</Label>
                <Input
                  id="hfxDoku"
                  type="number"
                  value={pricing.hfxDoku}
                  onChange={(e) =>
                    setPricing({ ...pricing, hfxDoku: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="hfxWingmann">HFX Wingmann (€/Monat)</Label>
                <Input
                  id="hfxWingmann"
                  type="number"
                  value={pricing.hfxWingmann}
                  onChange={(e) =>
                    setPricing({ ...pricing, hfxWingmann: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="hfxGoaeLiveCheck">HFX GOÄ Live-Check (€/Monat)</Label>
                <Input
                  id="hfxGoaeLiveCheck"
                  type="number"
                  value={pricing.hfxGoaeLiveCheck}
                  onChange={(e) =>
                    setPricing({ ...pricing, hfxGoaeLiveCheck: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="hfxGozLiveCheck">HFX GOZ Live-Check (€/Monat)</Label>
                <Input
                  id="hfxGozLiveCheck"
                  type="number"
                  value={pricing.hfxGozLiveCheck}
                  onChange={(e) =>
                    setPricing({ ...pricing, hfxGozLiveCheck: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="hfxPraxismanagementZahn">HFX Praxismanagement Zahnmedizin (€/Monat)</Label>
                <Input
                  id="hfxPraxismanagementZahn"
                  type="number"
                  value={pricing.hfxPraxismanagementZahn}
                  onChange={(e) =>
                    setPricing({ ...pricing, hfxPraxismanagementZahn: parseInt(e.target.value) || 0 })
                  }
                  className="mt-1"
                />
              </div>
            </div>

            <Button onClick={savePricing} className="mt-6">
              <Save className="h-4 w-4 mr-2" />
              Preise speichern
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="benachrichtigungen">
          <div className="card-elevated p-6 max-w-xl">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              E-Mail-Benachrichtigungen
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Konfigurieren Sie, welche Benachrichtigungen gesendet werden sollen.
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Neues Ticket</Label>
                  <p className="text-sm text-muted-foreground">
                    Benachrichtigung bei neuem Ticket
                  </p>
                </div>
                <Switch
                  checked={notifications.newTicket}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, newTicket: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ticket zugewiesen</Label>
                  <p className="text-sm text-muted-foreground">
                    Benachrichtigung bei Ticket-Zuweisung
                  </p>
                </div>
                <Switch
                  checked={notifications.ticketAssigned}
                  onCheckedChange={(checked) =>
                    setNotifications({
                      ...notifications,
                      ticketAssigned: checked,
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Neue Praxis</Label>
                  <p className="text-sm text-muted-foreground">
                    Benachrichtigung bei neuer Praxis-Registrierung
                  </p>
                </div>
                <Switch
                  checked={notifications.newPraxis}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, newPraxis: checked })
                  }
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Lizenz-Ablauf</Label>
                  <p className="text-sm text-muted-foreground">
                    Warnung vor ablaufenden Lizenzen
                  </p>
                </div>
                <Switch
                  checked={notifications.lizenzAblauf}
                  onCheckedChange={(checked) =>
                    setNotifications({
                      ...notifications,
                      lizenzAblauf: checked,
                    })
                  }
                />
              </div>
            </div>

            <Button onClick={saveNotifications} className="mt-6">
              <Save className="h-4 w-4 mr-2" />
              Einstellungen speichern
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="salesforce">
          <div className="space-y-6 max-w-xl">
            {/* Connection Status Card */}
            <div className="card-elevated p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-foreground">
                  Salesforce-Verbindung
                </h2>
                {sfLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : salesforce.isConnected ? (
                  <Badge variant="default" className="bg-green-500/10 text-green-600 border-green-500/20">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Verbunden
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="bg-muted text-muted-foreground">
                    <XCircle className="h-3 w-3 mr-1" />
                    Nicht verbunden
                  </Badge>
                )}
              </div>

              {salesforce.isConnected && salesforce.instanceUrl && (
                <div className="mb-4 p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Instanz</p>
                  <p className="text-sm font-medium text-foreground flex items-center gap-1">
                    {salesforce.instanceUrl}
                    <ExternalLink className="h-3 w-3" />
                  </p>
                </div>
              )}

              <p className="text-sm text-muted-foreground mb-4">
                {salesforce.isConnected
                  ? "Ihre Salesforce-Instanz ist verbunden. Sie können Daten automatisch synchronisieren."
                  : "Verbinden Sie Ihr Salesforce-Konto über OAuth 2.0, um Daten automatisch zu synchronisieren."}
              </p>

              {salesforce.isConnected ? (
                <Button
                  variant="outline"
                  onClick={handleDisconnectSalesforce}
                  className="text-destructive hover:text-destructive"
                >
                  <Unplug className="h-4 w-4 mr-2" />
                  Verbindung trennen
                </Button>
              ) : (
                <Button onClick={handleConnectSalesforce} disabled={sfConnecting}>
                  {sfConnecting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Mit Salesforce verbinden
                </Button>
              )}
            </div>

            {/* Sync Settings Card - Only show when connected */}
            {salesforce.isConnected && (
              <div className="card-elevated p-6">
                <h2 className="text-lg font-semibold text-foreground mb-4">
                  Synchronisations-Einstellungen
                </h2>
                <p className="text-sm text-muted-foreground mb-4">
                  Konfigurieren Sie, wie oft Daten mit Salesforce synchronisiert werden sollen.
                </p>

                <div className="space-y-4">
                  <div>
                    <Label>Sync-Intervall</Label>
                    <div className="flex gap-2 mt-2">
                      {["hourly", "daily", "weekly"].map((interval) => (
                        <Button
                          key={interval}
                          variant={syncInterval === interval ? "default" : "outline"}
                          size="sm"
                          onClick={() => setSyncInterval(interval)}
                        >
                          {interval === "hourly"
                            ? "Stündlich"
                            : interval === "daily"
                            ? "Täglich"
                            : "Wöchentlich"}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <Button onClick={saveSyncSettings} className="mt-6">
                  <Save className="h-4 w-4 mr-2" />
                  Einstellungen speichern
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </MainLayout>
  );
}
