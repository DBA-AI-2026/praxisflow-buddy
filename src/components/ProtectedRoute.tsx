import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { canAccessRoute } from "@/config/routePermissions";
import { logAuditEvent } from "@/hooks/useAuditLog";
import { Loader2, ShieldX, ShieldOff, RefreshCw, AlertTriangle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
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
  const { role, actualRole, isLoading: roleLoading, roleError, retryRoleFetch } = useUserRole();
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
            setMfaState("required");
            setMfaFactorId(null);
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
  const roleHasAccess = (r: AppRole | null) =>
    requiredRoles ? !!(r && requiredRoles.includes(r)) : canAccessRoute(location.pathname, r);

  const hasAccess = isPreviewActive && actualRole === "admin"
    ? roleHasAccess(role) || roleHasAccess(actualRole)
    : roleHasAccess(role);

  // Log failed access attempts (skip during admin role preview)
  useEffect(() => {
    if (!authLoading && !roleLoading && !roleError && session && user && !hasAccess && !hasLoggedRef.current && !isPreviewActive) {
      hasLoggedRef.current = true;
      logAuditEvent({
        action: "ACCESS_DENIED",
        resourcePath: location.pathname,
        success: false,
        details: `User with role '${role || "none"}' attempted to access ${location.pathname}`,
      });
    }
  }, [authLoading, roleLoading, roleError, session, user, hasAccess, role, location.pathname, isPreviewActive]);

  // Reset the log flag when path changes
  useEffect(() => {
    hasLoggedRef.current = false;
  }, [location.pathname]);

  // Show loading state
  if (authLoading || roleLoading || mfaState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Anmeldung wird geprüft…</p>
        </div>
      </div>
    );
  }

  // No session – redirect to login
  if (!session || !user) {
    console.log("ProtectedRoute: No session, redirecting to /auth");
    return <Navigate to="/auth" replace />;
  }

  // Role fetch failed after retries – show recoverable error, NOT "Access Denied"
  if (roleError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md px-4 space-y-4">
          <div className="mx-auto w-16 h-16 bg-accent rounded-full flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-accent-foreground" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Berechtigungen konnten nicht geladen werden</h1>
          <p className="text-sm text-muted-foreground">
            Ihre Anmeldung war erfolgreich, aber Ihre Rollenzuordnung konnte nicht abgerufen werden.
            Dies kann an einer vorübergehenden Verbindungsstörung liegen.
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={retryRoleFetch} variant="default" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Erneut versuchen
            </Button>
            <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); }}>
              Abmelden
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Falls das Problem bestehen bleibt, wenden Sie sich bitte an den Administrator.
          </p>
        </div>
      </div>
    );
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

  // MFA not enrolled but REQUIRED for this privileged role
  const PRIVILEGED_ROLES: (AppRole | null)[] = ["admin", "sales_lead"];
  if (mfaState === "required" && !mfaFactorId && PRIVILEGED_ROLES.includes(role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center">
            <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
              <ShieldOff className="h-8 w-8 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">2FA Pflicht</h1>
            <p className="text-sm text-muted-foreground mt-2">
              Ihr Konto benötigt eine aktive Zwei-Faktor-Authentifizierung, um auf das Portal zugreifen zu können.
              Bitte richten Sie 2FA jetzt ein.
            </p>
          </div>
          <div className="card-elevated p-6">
            <MfaSetup onComplete={() => setMfaState("checking")} />
          </div>
          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={async () => { await supabase.auth.signOut(); }}>
              Abmelden
            </Button>
          </div>
        </div>
      </div>
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
