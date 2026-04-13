import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

interface SalesforceConnection {
  isConnected: boolean;
  instanceUrl: string | null;
  lastSyncAt: string | null;
}

export function useSalesforceConnection() {
  const [connection, setConnection] = useState<SalesforceConnection>({
    isConnected: false,
    instanceUrl: null,
    lastSyncAt: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const fetchConnection = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("salesforce_connections")
        .select("is_connected, instance_url, updated_at")
        .eq("id", "default")
        .maybeSingle();

      if (error) {
        console.error("Error fetching Salesforce connection:", error);
        return;
      }

      if (data) {
        setConnection({
          isConnected: data.is_connected,
          instanceUrl: data.instance_url,
          lastSyncAt: data.updated_at,
        });
      }
    } catch (err) {
      console.error("Error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnection();

    // Listen for OAuth callback message
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "salesforce-connected") {
        fetchConnection();
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [fetchConnection]);

  const connect = async () => {
    setIsConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("salesforce-auth");

      if (error) {
        console.error("Error getting auth URL:", error);
        throw new Error("Fehler beim Starten der Verbindung");
      }

      if (data?.authUrl) {
        // Open OAuth popup
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;

        window.open(
          data.authUrl,
          "salesforce-oauth",
          `width=${width},height=${height},left=${left},top=${top}`
        );
      }
    } catch (err) {
      console.error("Connection error:", err);
      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnect = async () => {
    try {
      const { error } = await supabase
        .from("salesforce_connections")
        .update({ is_connected: false, access_token: null, refresh_token: null })
        .eq("id", "default");

      if (error) throw error;

      setConnection({
        isConnected: false,
        instanceUrl: null,
        lastSyncAt: null,
      });
    } catch (err) {
      console.error("Disconnect error:", err);
      throw err;
    }
  };

  return {
    connection,
    isLoading,
    isConnecting,
    connect,
    disconnect,
    refresh: fetchConnection,
  };
}
