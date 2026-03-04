import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface RoutePermission {
  path: string;
  allowedRoles: AppRole[];
}

// Define which roles can access each route
export const routePermissions: RoutePermission[] = [
  // Base routes - accessible by all authenticated users
  { path: "/", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "tippgeber", "admin"] },
  { path: "/praxen", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "admin"] },
  { path: "/tickets", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "admin"] },
  { path: "/lizenzen", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "admin"] },
  { path: "/umsaetze", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "admin"] },
  
  // Reservierungen
  { path: "/reservierungen", allowedRoles: ["user", "sales_partner", "regional_lead", "admin"] },
  
  // Interessenten
  { path: "/interessenten", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "admin"] },
  
  // Demo-Tracking
  { path: "/demo-tracking", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "admin"] },
  
  // Sales Lead, Regional Lead and Admin routes
  { path: "/kalender", allowedRoles: ["sales_lead", "regional_lead", "admin"] },
  { path: "/export", allowedRoles: ["sales_lead", "admin"] },
  { path: "/integrationen", allowedRoles: ["sales_lead", "admin"] },
  
  // Vertrieb routes
  { path: "/vertrieb/vertriebler", allowedRoles: ["sales_lead", "regional_lead", "admin"] },
  { path: "/vertrieb/vertraege", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "admin"] },
  { path: "/vertrieb/provisionen", allowedRoles: ["user", "sales_lead", "regional_lead", "admin"] },
  
  // Rechnungen - Admin only
  { path: "/rechnungen", allowedRoles: ["admin"] },

  // Admin routes - Admin only
  { path: "/admin/access-requests", allowedRoles: ["admin"] },
  { path: "/admin/users", allowedRoles: ["admin"] },
  { path: "/admin/audit-logs", allowedRoles: ["admin"] },
  { path: "/admin/settings", allowedRoles: ["admin"] },
  { path: "/admin/products", allowedRoles: ["admin"] },
  
  // Tools
  { path: "/tools/pdf-coordinates", allowedRoles: ["admin"] },
  { path: "/tools/email-preview", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "admin"] },
  
  // Sicherheit (2FA) - alle eingeloggten Benutzer
  { path: "/sicherheit", allowedRoles: ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "tippgeber", "admin"] },

  // Tipp-Leads (unified)
  { path: "/tipp-leads", allowedRoles: ["tippgeber", "admin", "sales_lead"] },

  // PLZ-Mapping Verwaltung
  { path: "/admin/plz-mapping", allowedRoles: ["admin", "sales_lead"] },

  // Systemdokumentation
  { path: "/admin/documentation", allowedRoles: ["admin"] },

  // Buchhaltung
  { path: "/buchhaltung", allowedRoles: ["admin"] },

];

export function getRoutePermission(path: string): RoutePermission | undefined {
  return routePermissions.find((route) => route.path === path);
}

export function canAccessRoute(path: string, role: AppRole | null): boolean {
  if (!role) return false;
  
  const permission = getRoutePermission(path);
  
  // If no specific permission is defined, deny access
  if (!permission) return false;
  
  return permission.allowedRoles.includes(role);
}
