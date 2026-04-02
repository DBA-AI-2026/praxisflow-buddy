import { useEffect, useState, useCallback } from "react";
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

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

export function useUserRole(): UseUserRoleResult & { isRegionalLead: boolean; actualRole: AppRole | null; roleError: boolean; retryRoleFetch: () => void } {
  const { user, isLoading: authLoading } = useAuth();
  const [actualRole, setActualRole] = useState<AppRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [roleError, setRoleError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const { previewRole } = useRolePreview();

  const fetchRole = useCallback(async (attempt: number = 0) => {
    if (!user) {
      setActualRole(null);
      setIsLoading(false);
      setRoleError(false);
      return;
    }

    setIsLoading(true);
    setRoleError(false);

    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data && !error) {
        setActualRole(data.role);
        setIsLoading(false);
        setRoleError(false);
      } else if (attempt < MAX_RETRIES - 1) {
        // Retry after delay – role row might not be provisioned yet
        console.warn(`useUserRole: role fetch attempt ${attempt + 1} returned no data, retrying…`);
        setTimeout(() => fetchRole(attempt + 1), RETRY_DELAY_MS);
      } else {
        console.error("useUserRole: no role found after retries", error);
        setActualRole(null);
        setIsLoading(false);
        setRoleError(true);
      }
    } catch (error) {
      console.error("useUserRole: error fetching role:", error);
      if (attempt < MAX_RETRIES - 1) {
        setTimeout(() => fetchRole(attempt + 1), RETRY_DELAY_MS);
      } else {
        setActualRole(null);
        setIsLoading(false);
        setRoleError(true);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading) {
      fetchRole(0);
    }
  }, [user, authLoading, fetchRole]);

  const retryRoleFetch = useCallback(() => {
    setRetryCount(prev => prev + 1);
    fetchRole(0);
  }, [fetchRole]);

  // Admins can preview as another role; actual role is always preserved
  const role = (actualRole === "admin" && previewRole) ? previewRole : actualRole;

  return {
    role,
    actualRole,
    roleError,
    retryRoleFetch,
    isLoading: authLoading || isLoading,
    isAdmin: actualRole === "admin",
    isVertragsabteilung: role === "vertragsabteilung",
    isSalesLead: role === "sales_lead",
    isRegionalLead: role === "regional_lead",
    isSalesPartner: role === "sales_partner",
    isUser: role === "user",
    isTippgeber: role === "tippgeber",
  };
}
