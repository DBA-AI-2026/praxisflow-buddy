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
  FileText,
  Package,
  FlaskConical,
  BarChart3,
  ClipboardList,
  ShieldCheck,
  Receipt,
  Lightbulb,
  MapPin,
  Mail,
  Eye,
  EyeOff,
} from "lucide-react";
import logo from "@/assets/fox-logo.jpeg";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, AppRole } from "@/hooks/useUserRole";
import { useRolePreview } from "@/contexts/RolePreviewContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const allRoles: AppRole[] = ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "tippgeber", "admin"];

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

const vertriebNavigation: NavItem[] = [
  { name: "Kunden-Journey", href: "/praxen-journey", icon: Building2, roles: ["user", "sales_partner", "sales_lead", "regional_lead", "vertragsabteilung", "admin"] },
  { name: "Reservierungen", href: "/reservierungen", icon: BookMarked, roles: ["user", "sales_partner", "regional_lead", "admin"] },
  { name: "HFX EBM Lizenzen", href: "/lizenzen", icon: Key, roles: allRoles },
  { name: "Demo-Tracking", href: "/demo-tracking", icon: FlaskConical, roles: ["user", "sales_partner", "sales_lead", "regional_lead", "admin"] },
  { name: "Umsätze", href: "/umsaetze", icon: TrendingUp, roles: allRoles },
];

const allgemeinNavigation: NavItem[] = [
  { name: "Tickets", href: "/tickets", icon: Ticket, roles: allRoles },
  { name: "Kalender", href: "/kalender", icon: Calendar, roles: ["sales_lead", "regional_lead", "admin"] },
  { name: "Sicherheit (2FA)", href: "/sicherheit", icon: ShieldCheck, roles: allRoles },
];

const vertriebsAdminNavigation: NavItem[] = [
  { name: "Vertriebler", href: "/vertrieb/vertriebler", icon: Users, roles: ["sales_lead", "regional_lead", "admin"] },
  { name: "Provisionen", href: "/vertrieb/provisionen", icon: BarChart3, roles: ["user", "sales_lead", "regional_lead", "admin"] },
  { name: "Tipp-Leads", href: "/tipp-leads", icon: Lightbulb, roles: ["tippgeber", "admin", "sales_lead"] },
  { name: "PLZ-Zuordnung", href: "/admin/plz-mapping", icon: MapPin, roles: ["admin", "sales_lead"] },
];

const adminNavigation: NavItem[] = [
  { name: "Zugangsanfragen", href: "/admin/access-requests", icon: UserPlus, roles: ["admin"], adminOnly: true },
  { name: "Benutzerverwaltung", href: "/admin/users", icon: Users, roles: ["admin"], adminOnly: true },
  { name: "Produktverwaltung", href: "/admin/products", icon: Package, roles: ["admin"], adminOnly: true },
  { name: "E-Mail-Vorschau", href: "/admin/email-preview", icon: FileText, roles: ["admin"], adminOnly: true },
  { name: "E-Mail-Einstellungen", href: "/admin/email-settings", icon: Mail, roles: ["admin"], adminOnly: true },
  { name: "Rechnungen", href: "/rechnungen", icon: Receipt, roles: ["admin"], adminOnly: true },
  { name: "Buchhaltung", href: "/buchhaltung", icon: TrendingUp, roles: ["admin"], adminOnly: true },
  { name: "Datenexport", href: "/export", icon: FileDown, roles: ["admin"], adminOnly: true },
  { name: "Audit-Protokoll", href: "/admin/audit-logs", icon: ClipboardList, roles: ["admin"], adminOnly: true },
  { name: "Einstellungen", href: "/admin/settings", icon: Settings, roles: ["admin"], adminOnly: true },
  { name: "Dokumentation", href: "/admin/documentation", icon: FileText, roles: ["admin"], adminOnly: true },
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
    (item) => userRole && item.roles.includes(userRole)
  );

  if (visibleItems.length === 0) return null;

  return (
    <>
      <div className="mt-6 first:mt-0 mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
        {label}
      </div>
      {visibleItems.map((item) => {
        const isActive = currentPath === item.href;
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
  const { role: userRole, isAdmin, actualRole } = useUserRole();
  const { previewRole, setPreviewRole, isPreviewActive } = useRolePreview();

  const roleLabels: Record<AppRole, string> = {
    admin: "Administrator",
    sales_lead: "Vertriebsleitung",
    regional_lead: "Regionalleiter",
    sales_partner: "Vertriebspartner",
    user: "Gebietsleiter",
    vertragsabteilung: "Vertragsabteilung",
    tippgeber: "Tippgeber",
  };

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

      {/* Admin Role Preview Banner */}
      {actualRole === "admin" && (
        <div className={`px-3 py-2 border-b border-sidebar-border ${isPreviewActive ? "bg-warning/10" : "bg-sidebar-accent/50"}`}>
          <div className="flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-warning flex-shrink-0" />
            <span className="text-xs text-sidebar-foreground/70 flex-1 truncate">
              {isPreviewActive ? (
                <span className="font-medium text-warning">{roleLabels[previewRole!]}</span>
              ) : (
                "Rollenvorschau"
              )}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="text-xs px-2 py-0.5 rounded border border-sidebar-border bg-background/50 hover:bg-background/80 text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors flex-shrink-0">
                  {isPreviewActive ? "Ändern" : "Auswählen"}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {(Object.entries(roleLabels) as [AppRole, string][])
                  .filter(([r]) => r !== "admin")
                  .map(([r, label]) => (
                    <DropdownMenuItem
                      key={r}
                      onClick={() => setPreviewRole(r)}
                      className={previewRole === r ? "bg-accent font-medium" : ""}
                    >
                      {label}
                    </DropdownMenuItem>
                  ))}
                {isPreviewActive && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => setPreviewRole(null)} className="text-destructive">
                      <EyeOff className="h-4 w-4 mr-2" />
                      Vorschau beenden
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 lg:px-3 py-4 overflow-y-auto">
        <NavSection label="Übersicht" items={dashboardNav} {...sectionProps} />
        <NavSection label="Vertrieb" items={vertriebNavigation} {...sectionProps} />
        <NavSection label="Allgemein" items={allgemeinNavigation} {...sectionProps} />
        <NavSection label="Vertriebs-Admin" items={vertriebsAdminNavigation} {...sectionProps} />
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
