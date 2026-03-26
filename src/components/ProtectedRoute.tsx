import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { canAccessRoute } from "@/config/routePermissions";
import { logAuditEvent } from "@/hooks/useAuditLog";
import { Loader2, ShieldX, ShieldOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MfaChallenge } from "@/pages/MfaChallenge";
import { MfaSetup } from "@/pages/MfaSetup";
import { useRolePreview } from "@/contexts/RolePreviewContext";
import { Button } from "@/components/ui/button";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, session, isLoading: authLoading } = useAuth();
  const { role, actualRole, isLoading: roleLoading } = useUserRole();
  const { isPreviewActive } = useRolePreview();
  const location = useLocation();
  const hasLoggedRef = useRef(false);
  const [mfaState, setMfaState] = useState<"checking" | "required" | "verified" | "not_enrolled">("checking");
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);

  // Check MFA status
  useEffect(() => {
    if (authLoading) return;
    if (!session) { setMfaState("not_enrolled"); return; }

    const checkMfa = async () => {
      try {
        const { data: assuranceData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (!assuranceData) { setMfaState("not_enrolled"); return; }

        const { currentLevel, nextLevel } = assuranceData;

        // Check if user has TOTP enrolled
        const { data: factorsData } = await supabase.auth.mfa.listFactors();
        const totpFactors = factorsData?.totp?.filter(f => f.status === "verified") ?? [];

        // Privileged roles (admin, sales_lead) MUST have MFA enrolled
        const PRIVILEGED_ROLES: (AppRole | null)[] = ["admin", "sales_lead"];
        const isPrivileged = PRIVILEGED_ROLES.includes(role);

        if (totpFactors.length === 0) {
          if (isPrivileged) {
            // Force privileged users to /sicherheit to set up MFA
            setMfaState("required");
            setMfaFactorId(null); // null = not enrolled yet → show setup prompt
          } else {
            setMfaState("not_enrolled");
          }
          return;
        }

        // Has enrolled TOTP but hasn't completed the challenge this session
        if (currentLevel === "aal1" && nextLevel === "aal2") {
          setMfaFactorId(totpFactors[0].id);
          setMfaState("required");
          return;
        }

        setMfaState("verified");
      } catch {
        setMfaState("not_enrolled");
      }
    };

    checkMfa();
  }, [session, authLoading, role]);

  // Check role-based access.
  // During role preview: grant access if EITHER the preview role OR the actual
  // admin role has permission. This lets admins navigate role-specific pages
  // without losing access to their own admin-only routes.
  const roleHasAccess = (r: AppRole | null) =>
    requiredRoles ? !!(r && requiredRoles.includes(r)) : canAccessRoute(location.pathname, r);

  const hasAccess = isPreviewActive && actualRole === "admin"
    ? roleHasAccess(role) || roleHasAccess(actualRole)
    : roleHasAccess(role);

  // Log failed access attempts (skip during admin role preview – not a real denial)
  useEffect(() => {
    if (!authLoading && !roleLoading && session && user && !hasAccess && !hasLoggedRef.current && !isPreviewActive) {
      hasLoggedRef.current = true;
      logAuditEvent({
        action: "ACCESS_DENIED",
        resourcePath: location.pathname,
        success: false,
        details: `User with role '${role || "none"}' attempted to access ${location.pathname}`,
      });
    }
  }, [authLoading, roleLoading, session, user, hasAccess, role, location.pathname, isPreviewActive]);

  // Reset the log flag when path changes
  useEffect(() => {
    hasLoggedRef.current = false;
  }, [location.pathname]);

  // Show loading state
  if (authLoading || roleLoading || mfaState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No session – redirect to login
  if (!session || !user) {
    console.log("ProtectedRoute: No session, redirecting to /auth");
    return <Navigate to="/auth" replace />;
  }

  // MFA challenge required
  if (mfaState === "required" && mfaFactorId) {
    return (
      <MfaChallenge
        factorId={mfaFactorId}
        onSuccess={() => setMfaState("verified")}
        onCancel={async () => { await supabase.auth.signOut(); }}
      />
    );
  }

  if (!hasAccess) {
    console.log(`ProtectedRoute: User with role '${role}' denied access to ${location.pathname}`);
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4">
          <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
            <ShieldX className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Zugriff verweigert</h1>
          <p className="text-muted-foreground mb-6">
            Sie haben keine Berechtigung, auf diese Seite zuzugreifen.
          </p>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
          >
            Zurück zum Dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
