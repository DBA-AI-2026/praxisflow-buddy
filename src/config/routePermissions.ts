import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

export interface RoutePermission {
  path: string;
  allowedRoles: AppRole[];
}

// Define which roles can access each route
export const routePermissions: RoutePermission[] = [
  // Base routes - accessible by all authenticated users
  { path: "/", allowedRoles: ["user", "sales_partner", "sales_lead", "admin"] },
  { path: "/reservierungen", allowedRoles: ["user", "sales_partner", "sales_lead", "admin"] },
  { path: "/praxen", allowedRoles: ["user", "sales_partner", "sales_lead", "admin"] },
  { path: "/tickets", allowedRoles: ["user", "sales_partner", "sales_lead", "admin"] },
  { path: "/lizenzen", allowedRoles: ["user", "sales_partner", "sales_lead", "admin"] },
  { path: "/umsaetze", allowedRoles: ["user", "sales_partner", "sales_lead", "admin"] },
  
  // Sales Lead and Admin routes
  { path: "/kalender", allowedRoles: ["sales_lead", "admin"] },
  { path: "/export", allowedRoles: ["sales_lead", "admin"] },
  { path: "/integrationen", allowedRoles: ["sales_lead", "admin"] },
  
  // Vertrieb routes - Sales Lead and Admin only
  { path: "/vertrieb/vertriebler", allowedRoles: ["sales_lead", "admin"] },
  { path: "/vertrieb/provisionen", allowedRoles: ["sales_lead", "admin"] },
  
  // Admin routes - Admin only
  { path: "/admin/access-requests", allowedRoles: ["admin"] },
  { path: "/admin/users", allowedRoles: ["admin"] },
  { path: "/admin/audit-logs", allowedRoles: ["admin"] },
  { path: "/admin/settings", allowedRoles: ["admin"] },
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
