import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useRolePreview } from "@/contexts/RolePreviewContext";
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

export function useUserRole(): UseUserRoleResult & { isRegionalLead: boolean; actualRole: AppRole | null } {
  const { user, isLoading: authLoading } = useAuth();
  const [actualRole, setActualRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { previewRole } = useRolePreview();

  useEffect(() => {
    const fetchRole = async () => {
      if (!user) {
        setActualRole(null);
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
          setActualRole(data.role);
        } else {
          setActualRole(null);
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setActualRole(null);
      } finally {
        setIsLoading(false);
      }
    };

    if (!authLoading) {
      fetchRole();
    }
  }, [user, authLoading]);

  // Admins can preview as another role; actual role is always preserved
  const role = (actualRole === "admin" && previewRole) ? previewRole : actualRole;

  return {
    role,
    actualRole,
    isLoading: authLoading || isLoading,
    isAdmin: actualRole === "admin", // always based on real role
    isVertragsabteilung: role === "vertragsabteilung",
    isSalesLead: role === "sales_lead",
    isRegionalLead: role === "regional_lead",
    isSalesPartner: role === "sales_partner",
    isUser: role === "user",
    isTippgeber: role === "tippgeber",
  };
}
