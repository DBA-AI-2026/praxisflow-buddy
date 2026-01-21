import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface IntegrationSettings {
  id: string;
  is_connected: boolean;
  auto_sync_enabled: boolean;
  sync_interval: string;
  sync_time: string;
  last_sync_at: string | null;
}

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  records_count: number;
  message: string;
  created_at: string;
}

export function useLexwareIntegration() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<IntegrationSettings | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Fetch settings and logs
  const fetchData = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Fetch settings via edge function
      const settingsResponse = await supabase.functions.invoke("lexware-integration", {
        body: { action: "get-settings" },
      });

      if (settingsResponse.data?.settings) {
        setSettings(settingsResponse.data.settings);
      }

      // Fetch sync logs directly
      const { data: logs } = await supabase
        .from("integration_sync_logs")
        .select("*")
        .eq("integration_type", "lexware")
        .order("created_at", { ascending: false })
        .limit(10);

      if (logs) {
        setSyncLogs(logs as SyncLog[]);
      }
    } catch (error) {
      console.error("Error fetching Lexware data:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Connect to Lexware
  const connect = async (apiKey: string) => {
    setIsConnecting(true);
    try {
      const response = await supabase.functions.invoke("lexware-integration", {
        body: { action: "connect", apiKey },
      });

      if (response.error) {
        throw new Error(response.error.message || "Verbindungsfehler");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast({
        title: "Verbindung hergestellt",
        description: "Lexware wurde erfolgreich verbunden.",
      });

      await fetchData();
      return true;
    } catch (error) {
      toast({
        title: "Verbindungsfehler",
        description: error instanceof Error ? error.message : "Verbindung fehlgeschlagen",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect from Lexware
  const disconnect = async () => {
    try {
      const response = await supabase.functions.invoke("lexware-integration", {
        body: { action: "disconnect" },
      });

      if (response.error || response.data?.error) {
        throw new Error("Trennen fehlgeschlagen");
      }

      toast({
        title: "Verbindung getrennt",
        description: "Lexware-Verbindung wurde getrennt.",
      });

      setSettings(null);
      return true;
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Verbindung konnte nicht getrennt werden.",
        variant: "destructive",
      });
      return false;
    }
  };

  // Export data to Lexware
  const exportData = async (
    exportType: "umsaetze" | "rechnungen" | "provisionen",
    dateFrom?: string,
    dateTo?: string
  ) => {
    setIsExporting(true);
    try {
      toast({
        title: "Export gestartet",
        description: "Daten werden nach Lexware übertragen...",
      });

      const response = await supabase.functions.invoke("lexware-integration", {
        body: { action: "export", exportType, dateFrom, dateTo },
      });

      if (response.error || response.data?.error) {
        throw new Error(response.data?.error || "Export fehlgeschlagen");
      }

      toast({
        title: "Export abgeschlossen",
        description: response.data?.message || "Daten erfolgreich übertragen",
      });

      await fetchData();
      return true;
    } catch (error) {
      toast({
        title: "Export fehlgeschlagen",
        description: error instanceof Error ? error.message : "Unbekannter Fehler",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsExporting(false);
    }
  };

  // Update auto-sync settings
  const updateSettings = async (
    autoSyncEnabled: boolean,
    syncInterval: string,
    syncTime: string
  ) => {
    try {
      const response = await supabase.functions.invoke("lexware-integration", {
        body: { 
          action: "update-settings", 
          autoSyncEnabled, 
          syncInterval, 
          syncTime 
        },
      });

      if (response.error || response.data?.error) {
        throw new Error("Speichern fehlgeschlagen");
      }

      toast({
        title: "Einstellungen gespeichert",
        description: autoSyncEnabled
          ? `Auto-Sync aktiviert: ${syncInterval === "daily" ? "Täglich" : syncInterval === "weekly" ? "Wöchentlich" : "Monatlich"} um ${syncTime} Uhr`
          : "Auto-Sync deaktiviert",
      });

      await fetchData();
      return true;
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Einstellungen konnten nicht gespeichert werden.",
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    settings,
    syncLogs,
    isLoading,
    isConnecting,
    isExporting,
    connect,
    disconnect,
    exportData,
    updateSettings,
    refresh: fetchData,
  };
}
