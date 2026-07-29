import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "./useAuth";
import { useRolePreview } from "@/contexts/RolePreviewContext";
import { pickPrimaryRole, type AppRole } from "@/lib/roles";

export type { AppRole } from "@/lib/roles";

interface UseUserRoleResult {
  role: AppRole | null;
  roles: AppRole[];
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

export function useUserRole(): UseUserRoleResult & { actualRole: AppRole | null; actualRoles: AppRole[]; roleError: boolean; retryRoleFetch: () => void } {
  const { user, isLoading: authLoading } = useAuth();
  const [actualRoles, setActualRoles] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [roleError, setRoleError] = useState(false);
  const { previewRole } = useRolePreview();

  // Guard against state updates after unmount or stale retry chains
  const mountedRef = useRef(true);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // user.id, für die zuletzt ERFOLGREICH Rollen geladen wurden.
  // Verhindert, dass stilles Nachladen (z. B. Tab-Refokus) das Loading-Gate
  // in ProtectedRoute auslöst und den Seitenbaum unmountet.
  const loadedForUserIdRef = useRef<string | null>(null);

  const cancelPendingRetry = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const fetchRole = useCallback(async (attempt: number = 0) => {
    if (!user) {
      loadedForUserIdRef.current = null;
      setActualRoles([]);
      setIsLoading(false);
      setRoleError(false);
      return;
    }

    const isFirstLoadForThisUser = loadedForUserIdRef.current !== user.id;
    if (isFirstLoadForThisUser) setIsLoading(true);
    setRoleError(false);


    try {
      // Multi-role aware: load ALL active roles for this user.
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("is_active", true);

      if (!mountedRef.current) return;

      if (error) {
        // Only a genuine query error triggers retry / roleError.
        if (attempt < MAX_RETRIES - 1) {
          console.warn(`useUserRole: role fetch attempt ${attempt + 1} errored, retrying…`, error);
          retryTimerRef.current = setTimeout(() => {
            if (mountedRef.current) fetchRole(attempt + 1);
          }, RETRY_DELAY_MS);
        } else {
          console.error("useUserRole: role fetch failed after retries", error);
          setActualRoles([]);
          setIsLoading(false);
          setRoleError(true);
        }
        return;
      }

      const roles = (data ?? []).map((r) => r.role as AppRole);
      setActualRoles(roles);
      setIsLoading(false);
      setRoleError(false);
    } catch (error) {
      if (!mountedRef.current) return;
      console.error("useUserRole: error fetching role:", error);
      if (attempt < MAX_RETRIES - 1) {
        retryTimerRef.current = setTimeout(() => {
          if (mountedRef.current) fetchRole(attempt + 1);
        }, RETRY_DELAY_MS);
      } else {
        setActualRoles([]);
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

  // Derive a single primary role for consumers that still expect one value.
  const actualRole = pickPrimaryRole(actualRoles);
  const isAdmin = actualRoles.includes("admin");

  // Admins can preview as another role; actual roles are always preserved.
  const effectiveRoles: AppRole[] = (isAdmin && previewRole) ? [previewRole] : actualRoles;
  const role = (isAdmin && previewRole) ? previewRole : actualRole;

  return {
    role,
    roles: effectiveRoles,
    actualRole,
    actualRoles,
    roleError,
    retryRoleFetch,
    isLoading: authLoading || isLoading,
    isAdmin,
    isVertragsabteilung: effectiveRoles.includes("vertragsabteilung"),
    isSalesLead: effectiveRoles.includes("sales_lead"),
    isRegionalLead: effectiveRoles.includes("regional_lead"),
    isSalesPartner: effectiveRoles.includes("sales_partner"),
    isUser: effectiveRoles.includes("user"),
    isTippgeber: effectiveRoles.includes("tippgeber"),
  };
}
