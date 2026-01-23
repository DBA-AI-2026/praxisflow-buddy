import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { canAccessRoute } from "@/config/routePermissions";
import { logAuditEvent } from "@/hooks/useAuditLog";
import { Loader2, ShieldX } from "lucide-react";
import { useEffect, useRef } from "react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: AppRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, session, isLoading: authLoading } = useAuth();
  const { role, isLoading: roleLoading } = useUserRole();
  const location = useLocation();
  const hasLoggedRef = useRef(false);

  // Check role-based access
  const hasAccess = requiredRoles 
    ? role && requiredRoles.includes(role)
    : canAccessRoute(location.pathname, role);

  // Log failed access attempts
  useEffect(() => {
    if (!authLoading && !roleLoading && session && user && !hasAccess && !hasLoggedRef.current) {
      hasLoggedRef.current = true;
      logAuditEvent({
        action: "ACCESS_DENIED",
        resourcePath: location.pathname,
        success: false,
        details: `User with role '${role || "none"}' attempted to access ${location.pathname}`,
      });
    }
  }, [authLoading, roleLoading, session, user, hasAccess, role, location.pathname]);

  // Reset the log flag when path changes
  useEffect(() => {
    hasLoggedRef.current = false;
  }, [location.pathname]);

  // Show loading state while checking authentication and role
  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No session means not authenticated - redirect to login
  if (!session || !user) {
    console.log("ProtectedRoute: No session, redirecting to /auth");
    return <Navigate to="/auth" replace />;
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
