import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

interface UseUserRoleResult {
  role: AppRole | null;
  isLoading: boolean;
  isAdmin: boolean;
  isVertragsabteilung: boolean;
  isSalesLead: boolean;
  isRegionalLead: boolean;
  isSalesPartner: boolean;
  isUser: boolean;
  isTippgeber: boolean;
}

export function useUserRole(): UseUserRoleResult & { isRegionalLead: boolean } {
  const { user, isLoading: authLoading } = useAuth();
  const [role, setRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchRole = async () => {
      if (!user) {
        setRole(null);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (data && !error) {
          setRole(data.role);
        } else {
          setRole(null);
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setRole(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading) {
      fetchRole();
    }
  }, [user, authLoading]);

  return {
    role,
    isLoading: authLoading || isLoading,
    isAdmin: role === "admin",
    isVertragsabteilung: role === "vertragsabteilung",
    isSalesLead: role === "sales_lead",
    isRegionalLead: role === "regional_lead",
  isSalesPartner: role === "sales_partner",
  isUser: role === "user",
  isTippgeber: role === "tippgeber",
  };
}
