/**
 * Liest globale App-Einstellungen aus public.app_settings.
 * Defaults werden zurückgegeben, wenn der Key fehlt.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";

export interface ActivityThresholds {
  yellow_days: number;
  red_days: number;
}

const DEFAULT_THRESHOLDS: ActivityThresholds = { yellow_days: 30, red_days: 60 };

export function useActivityThresholds() {
  return useQuery({
    queryKey: ["app-settings", "activity_thresholds"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ActivityThresholds> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "activity_thresholds")
        .maybeSingle();
      if (error || !data) return DEFAULT_THRESHOLDS;
      const v = (data.value ?? {}) as Partial<ActivityThresholds>;
      return {
        yellow_days: typeof v.yellow_days === "number" ? v.yellow_days : DEFAULT_THRESHOLDS.yellow_days,
        red_days: typeof v.red_days === "number" ? v.red_days : DEFAULT_THRESHOLDS.red_days,
      };
    },
  });
}
