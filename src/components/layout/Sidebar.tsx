import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Ticket,
  Key,
  Settings,
  Users,
  FileDown,
  UserPlus,
  Calendar,
  LogOut,
  Menu,
  BookMarked,
  TrendingUp,
  Link2,
  Lock,
  FileText,
  Package,
  FlaskConical,
  BarChart3,
  ClipboardList,
} from "lucide-react";
import logo from "@/assets/fox-logo.jpeg";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const allRoles: AppRole[] = ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "admin"];

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: AppRole[];
  adminOnly?: boolean;
}

const dashboardNav: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: allRoles },
];

const kundenNavigation: NavItem[] = [
  { name: "Interessenten", href: "/interessenten", icon: UserPlus, roles: ["sales_partner", "sales_lead", "regional_lead", "admin"] },
  { name: "Kunden", href: "/praxen", icon: Building2, roles: allRoles },
  { name: "Verträge", href: "/vertrieb/vertraege", icon: FileText, roles: allRoles },
  { name: "Reservierungen", href: "/reservierungen", icon: BookMarked, roles: ["sales_partner", "regional_lead", "admin"] },
  { name: "Demo-Tracking", href: "/demo-tracking", icon: FlaskConical, roles: ["sales_partner", "sales_lead", "regional_lead", "admin"] },
];

const vertriebNavigation: NavItem[] = [
  { name: "Umsätze", href: "/umsaetze", icon: TrendingUp, roles: allRoles },
  { name: "Vertriebler", href: "/vertrieb/vertriebler", icon: Users, roles: ["sales_lead", "regional_lead", "admin"] },
  { name: "Provisionen", href: "/vertrieb/provisionen", icon: BarChart3, roles: ["sales_lead", "regional_lead", "admin"] },
];

const allgemeinNavigation: NavItem[] = [
  { name: "Tickets", href: "/tickets", icon: Ticket, roles: allRoles },
  { name: "HFX EBM Lizenzen", href: "/lizenzen", icon: Key, roles: allRoles },
  { name: "Kalender", href: "/kalender", icon: Calendar, roles: ["sales_lead", "regional_lead", "admin"] },
  { name: "E-Mail-Vorschau", href: "/tools/email-preview", icon: FileText, roles: allRoles },
];

const adminNavigation: NavItem[] = [
  { name: "Zugangsanfragen", href: "/admin/access-requests", icon: UserPlus, roles: ["admin"], adminOnly: true },
  { name: "Benutzerverwaltung", href: "/admin/users", icon: Users, roles: ["admin"], adminOnly: true },
  { name: "Produktverwaltung", href: "/admin/products", icon: Package, roles: ["admin"], adminOnly: true },
  { name: "Datenexport", href: "/export", icon: FileDown, roles: ["admin"], adminOnly: true },
  { name: "Buchhaltung", href: "/integrationen", icon: Link2, roles: ["admin"], adminOnly: true },
  { name: "Audit-Protokoll", href: "/admin/audit-logs", icon: ClipboardList, roles: ["admin"], adminOnly: true },
  { name: "Einstellungen", href: "/admin/settings", icon: Settings, roles: ["admin"], adminOnly: true },
];

interface NavSectionProps {
  label: string;
  items: NavItem[];
  userRole: AppRole | null;
  isAdmin: boolean;
  currentPath: string;
  onNavigate?: () => void;
}

function NavSection({ label, items, userRole, isAdmin, currentPath, onNavigate }: NavSectionProps) {
  const visibleItems = items.filter(
    (item) => (userRole && item.roles.includes(userRole)) || item.adminOnly
  );

  if (visibleItems.length === 0) return null;

  return (
    <>
      <div className="mt-6 first:mt-0 mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
        {label}
      </div>
      {visibleItems.map((item) => {
        const hasAccess = userRole && item.roles.includes(userRole);
        const isActive = currentPath === item.href;
        const isLocked = item.adminOnly && !isAdmin;

        if (isLocked) {
          return (
            <Tooltip key={item.name}>
              <TooltipTrigger asChild>
                <div
                  className="sidebar-link opacity-40 cursor-not-allowed pointer-events-auto"
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  <span className="truncate flex-1">{item.name}</span>
                  <Lock className="h-3.5 w-3.5 flex-shrink-0 text-sidebar-foreground/40" />
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>Nur für Administratoren</p>
              </TooltipContent>
            </Tooltip>
          );
        }

        if (!hasAccess) return null;

        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={onNavigate}
            className={`sidebar-link ${isActive ? "active" : ""}`}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            <span className="truncate">{item.name}</span>
          </Link>
        );
      })}
    </>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { role: userRole, isAdmin } = useUserRole();

  const handleLogout = async () => {
    await signOut();
    navigate("/auth");
  };

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Benutzer";
  const initials = displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const sectionProps = {
    userRole,
    isAdmin,
    currentPath: location.pathname,
    onNavigate,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6 border-b border-sidebar-border">
        <img src={logo} alt="Honorarfuchs Logo" className="h-11 w-11 lg:h-12 lg:w-12 rounded-full object-cover" />
        <div>
          <span className="text-base lg:text-lg font-semibold text-sidebar-foreground">HFX Sales</span>
          <span className="text-xs block text-sidebar-foreground/60">das Portal für den Vertrieb</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 lg:px-3 py-4 overflow-y-auto">
        <NavSection label="Übersicht" items={dashboardNav} {...sectionProps} />
        <NavSection label="Kunden" items={kundenNavigation} {...sectionProps} />
        <NavSection label="Vertrieb" items={vertriebNavigation} {...sectionProps} />
        <NavSection label="Allgemein" items={allgemeinNavigation} {...sectionProps} />
        <NavSection label="Administration" items={adminNavigation} {...sectionProps} />
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-3 lg:p-4">
        <div className="flex items-center gap-2 lg:gap-3 rounded-lg bg-sidebar-accent p-2 lg:p-3">
          <div className="flex h-8 w-8 lg:h-9 lg:w-9 items-center justify-center rounded-full bg-sidebar-primary text-xs lg:text-sm font-medium text-sidebar-primary-foreground flex-shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {displayName}
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              {user?.email || ""}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="p-1.5 rounded-md hover:bg-sidebar-border/50 transition-colors flex-shrink-0"
            title="Abmelden"
          >
            <LogOut className="h-4 w-4 text-sidebar-foreground/60" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile Menu Button */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="fixed top-3 left-3 z-50 lg:hidden bg-background/80 backdrop-blur-sm border border-border shadow-sm"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border hidden lg:block">
        <SidebarContent />
      </aside>
    </>
  );
}
