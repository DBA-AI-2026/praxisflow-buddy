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
/** Interessenten in Testphase: enger getaktet (Seed 7/14, Key lead_activity_thresholds). */
const DEFAULT_LEAD_THRESHOLDS: ActivityThresholds = { yellow_days: 7, red_days: 14 };

function useThresholdsForKey(key: string, defaults: ActivityThresholds) {
  return useQuery({
    queryKey: ["app-settings", key],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ActivityThresholds> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error || !data) return defaults;
      const v = (data.value ?? {}) as Partial<ActivityThresholds>;
      return {
        yellow_days: typeof v.yellow_days === "number" ? v.yellow_days : defaults.yellow_days,
        red_days: typeof v.red_days === "number" ? v.red_days : defaults.red_days,
      };
    },
  });
}

/** Schwellen für Qodia-Kunden (Key: activity_thresholds). */
export function useActivityThresholds() {
  return useThresholdsForKey("activity_thresholds", DEFAULT_THRESHOLDS);
}

/** Schwellen für Interessenten in Testphase (Key: lead_activity_thresholds). */
export function useLeadActivityThresholds() {
  return useThresholdsForKey("lead_activity_thresholds", DEFAULT_LEAD_THRESHOLDS);
}
