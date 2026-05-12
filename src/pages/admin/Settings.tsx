import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useSalesforceConnection } from "@/hooks/useSalesforceConnection";
import { useUserRole } from "@/hooks/useUserRole";
import { useActivityThresholds } from "@/hooks/useAppSettings";
import { useQueryClient } from "@tanstack/react-query";
import { Save, Bell, Database, CheckCircle2, XCircle, Loader2, ExternalLink, Unplug, ShieldCheck, ShieldOff, Shield, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabaseClient";
import { MfaSetup } from "@/pages/MfaSetup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function AdminSettings() {
  const [notifications, setNotifications] = useState({
    newTicket: true,
    ticketAssigned: true,
    newPraxis: true,
    lizenzAblauf: true,
  });
  const [syncInterval, setSyncInterval] = useState("daily");
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const qc = useQueryClient();
  const { data: thresholds } = useActivityThresholds();
  const [yellowDays, setYellowDays] = useState<number>(30);
  const [redDays, setRedDays] = useState<number>(60);
  const [savingThresholds, setSavingThresholds] = useState(false);

  useEffect(() => {
    if (thresholds) {
      setYellowDays(thresholds.yellow_days);
      setRedDays(thresholds.red_days);
    }
  }, [thresholds]);

  // MFA state
  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [disablingMfa, setDisablingMfa] = useState(false);

  const {
    connection: salesforce,
    isLoading: sfLoading,
    isConnecting: sfConnecting,
    connect: connectSalesforce,
    disconnect: disconnectSalesforce,
  } = useSalesforceConnection();

  useEffect(() => {
    loadMfaStatus();
  }, []);

  const loadMfaStatus = async () => {
    setMfaLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.filter(f => f.status === "verified") ?? [];
      setMfaEnabled(verified.length > 0);
      setMfaFactorId(verified[0]?.id ?? null);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaFactorId) return;
    setDisablingMfa(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
      if (error) throw error;
      setMfaEnabled(false);
      setMfaFactorId(null);
      toast({ title: "2FA deaktiviert", description: "Zwei-Faktor-Authentifizierung wurde deaktiviert." });
    } catch (err: unknown) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "2FA konnte nicht deaktiviert werden.",
        variant: "destructive",
      });
    } finally {
      setDisablingMfa(false);
    }
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

  const saveThresholds = async () => {
    if (!Number.isFinite(yellowDays) || !Number.isFinite(redDays) || yellowDays <= 0 || redDays <= 0) {
      toast({ title: "Ungültige Werte", description: "Beide Werte müssen größer als 0 sein.", variant: "destructive" });
      return;
    }
    if (redDays <= yellowDays) {
      toast({ title: "Ungültige Werte", description: "„Rot ab Tagen" muss größer als „Gelb ab Tagen" sein.", variant: "destructive" });
      return;
    }
    setSavingThresholds(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("app_settings").upsert({
        key: "activity_thresholds",
        value: { yellow_days: yellowDays, red_days: redDays },
        updated_by: userData.user?.id ?? null,
      }, { onConflict: "key" });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["app-settings", "activity_thresholds"] });
      toast({ title: "Schwellen aktualisiert" });
    } catch (err: any) {
      toast({ title: "Fehler", description: err?.message ?? "Speichern fehlgeschlagen", variant: "destructive" });
    } finally {
      setSavingThresholds(false);
    }
  };

  return (
    <MainLayout title="Einstellungen" subtitle="System- und Sicherheitseinstellungen">
      <Tabs defaultValue="benachrichtigungen" className="space-y-6">
        <TabsList>
          <TabsTrigger value="benachrichtigungen" className="gap-2">
            <Bell className="h-4 w-4" />
            Benachrichtigungen
          </TabsTrigger>
          <TabsTrigger value="sicherheit" className="gap-2">
            <Shield className="h-4 w-4" />
            Sicherheit
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="aktivitaet" className="gap-2">
              <Activity className="h-4 w-4" />
              Aktivität
            </TabsTrigger>
          )}
          <TabsTrigger value="salesforce" className="gap-2">
            <Database className="h-4 w-4" />
            Salesforce
          </TabsTrigger>
        </TabsList>

        {isAdmin && (
          <TabsContent value="aktivitaet">
            <div className="card-elevated p-6 max-w-xl space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Aktivitäts-Schwellen für Qodia-Kunden</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Ab wie vielen Tagen ohne neue Rechnung wird ein Kunde gelb bzw. rot markiert?
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="yellow-days">Gelb ab Tagen</Label>
                  <Input
                    id="yellow-days"
                    type="number"
                    min={1}
                    value={yellowDays}
                    onChange={(e) => setYellowDays(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="red-days">Rot ab Tagen</Label>
                  <Input
                    id="red-days"
                    type="number"
                    min={1}
                    value={redDays}
                    onChange={(e) => setRedDays(parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
              <Button onClick={saveThresholds} disabled={savingThresholds}>
                {savingThresholds ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Schwellen speichern
              </Button>
            </div>
          </TabsContent>
        )}

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

        {/* Security / 2FA Tab */}
        <TabsContent value="sicherheit">
          <div className="card-elevated p-6 max-w-xl space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Zwei-Faktor-Authentifizierung</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Schützen Sie Ihr Konto mit einer zusätzlichen Sicherheitsebene. Nach der Aktivierung
                wird bei jeder Anmeldung ein Code aus Ihrer Authenticator-App verlangt.
              </p>
            </div>

            {mfaLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm">Status wird geladen...</span>
              </div>
            ) : (
              <div className="flex items-start justify-between p-4 border rounded-xl bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${mfaEnabled ? "bg-primary/10" : "bg-muted"}`}>
                    {mfaEnabled
                      ? <ShieldCheck className="h-5 w-5 text-primary" />
                      : <ShieldOff className="h-5 w-5 text-muted-foreground" />
                    }
                  </div>
                  <div>
                    <p className="font-medium text-foreground text-sm">Authenticator-App (TOTP)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {mfaEnabled ? "Aktiv – Ihr Konto ist zusätzlich geschützt." : "Nicht aktiviert"}
                    </p>
                  </div>
                </div>
                <Badge variant="secondary" className={mfaEnabled ? "bg-primary/10 text-primary" : ""}>
                  {mfaEnabled ? "Aktiv" : "Inaktiv"}
                </Badge>
              </div>
            )}

            <div className="flex gap-3">
              {!mfaEnabled ? (
                <Button onClick={() => setShowMfaSetup(true)}>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  2FA aktivieren
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleDisableMfa}
                  disabled={disablingMfa}
                  className="text-destructive hover:text-destructive"
                >
                  {disablingMfa
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <ShieldOff className="h-4 w-4 mr-2" />
                  }
                  2FA deaktivieren
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground border-t pt-4">
              Unterstützte Apps: Google Authenticator, Authy, Microsoft Authenticator, 1Password u.v.m.
            </p>
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
                  <Badge variant="default" className="bg-primary/10 text-primary border-primary/20">
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

      {/* MFA Setup Dialog */}
      <Dialog open={showMfaSetup} onOpenChange={setShowMfaSetup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>2FA einrichten</DialogTitle>
            <DialogDescription>
              Verbinden Sie Ihren Account mit einer Authenticator-App.
            </DialogDescription>
          </DialogHeader>
          <MfaSetup
            onComplete={() => {
              setShowMfaSetup(false);
              loadMfaStatus();
            }}
            onCancel={() => setShowMfaSetup(false)}
          />
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
