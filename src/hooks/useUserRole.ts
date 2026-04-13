import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
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
  const { previewRole } = useRolePreview();

  // Guard against state updates after unmount or stale retry chains
  const mountedRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelPendingRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

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

      if (!mountedRef.current) return;

      if (data && !error) {
        setActualRole(data.role);
        setIsLoading(false);
        setRoleError(false);
      } else if (attempt < MAX_RETRIES - 1) {
        console.warn(`useUserRole: role fetch attempt ${attempt + 1} returned no data, retrying…`);
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) fetchRole(attempt + 1);
        }, RETRY_DELAY_MS);
      } else {
        console.error("useUserRole: no role found after retries", error);
        setActualRole(null);
        setIsLoading(false);
        setRoleError(true);
      }
    } catch (error) {
      if (!mountedRef.current) return;
      console.error("useUserRole: error fetching role:", error);
      if (attempt < MAX_RETRIES - 1) {
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) fetchRole(attempt + 1);
        }, RETRY_DELAY_MS);
      } else {
        setActualRole(null);
        setIsLoading(false);
        setRoleError(true);
      }
    }
  }, [user]);

  useEffect(() => {
    mountedRef.current = true;
    if (!authLoading) {
      cancelPendingRetry();
      fetchRole(0);
    }
    return () => {
      mountedRef.current = false;
      cancelPendingRetry();
    };
  }, [user, authLoading, fetchRole, cancelPendingRetry]);

  const retryRoleFetch = useCallback(() => {
    cancelPendingRetry();
    fetchRole(0);
  }, [fetchRole, cancelPendingRetry]);

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
