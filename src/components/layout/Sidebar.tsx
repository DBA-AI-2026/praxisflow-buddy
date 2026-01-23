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
  Euro,
  Link2,
  Lock,
} from "lucide-react";
import logo from "@/assets/fox-logo.jpeg";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, AppRole } from "@/hooks/useUserRole";

// Navigation items with role-based visibility
const baseNavigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard, roles: ["user", "sales_partner", "sales_lead", "admin"] as AppRole[] },
  { name: "Reservierungen", href: "/reservierungen", icon: BookMarked, roles: ["sales_partner", "admin"] as AppRole[] },
  { name: "Praxen", href: "/praxen", icon: Building2, roles: ["user", "sales_partner", "sales_lead", "admin"] as AppRole[] },
  { name: "Tickets", href: "/tickets", icon: Ticket, roles: ["user", "sales_partner", "sales_lead", "admin"] as AppRole[] },
  { name: "Kalender", href: "/kalender", icon: Calendar, roles: ["sales_lead", "admin"] as AppRole[] },
  { name: "Lizenzen", href: "/lizenzen", icon: Key, roles: ["user", "sales_partner", "sales_lead", "admin"] as AppRole[] },
  { name: "Umsätze", href: "/umsaetze", icon: Euro, roles: ["user", "sales_partner", "sales_lead", "admin"] as AppRole[] },
  { name: "Datenexport", href: "/export", icon: FileDown, roles: ["sales_lead", "admin"] as AppRole[] },
  { name: "Integrationen", href: "/integrationen", icon: Link2, roles: ["sales_lead", "admin"] as AppRole[] },
];

const vertriebNavigation = [
  { name: "Vertriebler", href: "/vertrieb/vertriebler", icon: Users, roles: ["sales_lead", "admin"] as AppRole[] },
  { name: "Provisionen", href: "/vertrieb/provisionen", icon: Euro, roles: ["sales_lead", "admin"] as AppRole[] },
];

const adminNavigation = [
  { name: "Zugangsanfragen", href: "/admin/access-requests", icon: UserPlus },
  { name: "Benutzerverwaltung", href: "/admin/users", icon: Users },
  { name: "Audit-Protokoll", href: "/admin/audit-logs", icon: Lock },
  { name: "Einstellungen", href: "/admin/settings", icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { role: userRole, isAdmin } = useUserRole();
  
  // Filter navigation items based on user role
  const filteredNavigation = baseNavigation.filter(
    (item) => userRole && item.roles.includes(userRole)
  );
  
  const filteredVertriebNavigation = vertriebNavigation.filter(
    (item) => userRole && item.roles.includes(userRole)
  );

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

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 md:px-6 border-b border-sidebar-border">
        <img src={logo} alt="Honorarfuchs Logo" className="h-11 w-11 md:h-12 md:w-12 rounded-full object-cover" />
        <div>
          <span className="text-base md:text-lg font-semibold text-sidebar-foreground">HFX Sales</span>
          <span className="text-xs block text-sidebar-foreground/60">das Portal für den Vertrieb</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 md:px-3 py-4 overflow-y-auto">
        <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Hauptmenü
        </div>
        {filteredNavigation.map((item) => {
          const isActive = location.pathname === item.href;
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

        {filteredVertriebNavigation.length > 0 && (
          <>
            <div className="mt-8 mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
              Vertrieb
            </div>
            {filteredVertriebNavigation.map((item) => {
              const isActive = location.pathname === item.href;
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
        )}

        {isAdmin && (
          <>
            <div className="mt-8 mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
              Administration
            </div>
            {adminNavigation.map((item) => {
              const isActive = location.pathname === item.href;
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
        )}
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-3 md:p-4">
        <div className="flex items-center gap-2 md:gap-3 rounded-lg bg-sidebar-accent p-2 md:p-3">
          <div className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-sidebar-primary text-xs md:text-sm font-medium text-sidebar-primary-foreground flex-shrink-0">
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
            className="fixed top-3 left-3 z-50 md:hidden bg-background/80 backdrop-blur-sm border border-border shadow-sm"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border">
          <SidebarContent onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 bg-sidebar border-r border-sidebar-border hidden md:block">
        <SidebarContent />
      </aside>
    </>
  );
}
