import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Settings,
  Users,
  FileDown,
  UserPlus,
  LogOut,
  Menu,
  BookMarked,
  TrendingUp,
  FileText,
  Package,
  BarChart3,
  ClipboardList,
  ShieldCheck,
  Receipt,
  Lightbulb,
  MapPin,
  Mail,
  Eye,
  EyeOff,
  Plug,
  FileSignature,
  ChevronUp,
  User,
  AlertTriangle,
} from "lucide-react";
import logo from "@/assets/fuchs-bildmarke.png";
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
import { canAccessRoute } from "@/config/routePermissions";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

// ─── BLOCK 1: Operativ ────────────────────────────────────────────────────────
const operativNav: NavItem[] = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Pipeline", href: "/pipeline", icon: Building2 },
  { name: "Verträge", href: "/vertrieb/vertraege", icon: FileText },
  { name: "Provisionen", href: "/vertrieb/provisionen", icon: BarChart3 },
  { name: "Umsätze", href: "/umsaetze", icon: TrendingUp },
  { name: "Tipp-Leads", href: "/tipp-leads", icon: Lightbulb },
];

// ─── BLOCK 2: Vertriebssteuerung ──────────────────────────────────────────────
const vertriebssteuerungNav: NavItem[] = [
  { name: "Vertriebler", href: "/vertrieb/vertriebler", icon: Users },
];

// ─── BLOCK 3: Buchhaltung ─────────────────────────────────────────────────────
const buchhaltungNav: NavItem[] = [
  { name: "Rechnungen", href: "/rechnungen", icon: Receipt },
  { name: "Buchhaltung", href: "/buchhaltung", icon: FileSignature },
  { name: "Qodia-Verbrauch", href: "/qodia-verbrauch", icon: BarChart3 },
];

// ─── BLOCK 4: Verwaltung (Akkordeon, eingeklappt) ─────────────────────────────
const verwaltungNav: NavItem[] = [
  { name: "Benutzer", href: "/admin/users", icon: Users },
  { name: "Zugriffsanfragen", href: "/admin/access-requests", icon: UserPlus },
  { name: "Audit-Logs", href: "/admin/audit-logs", icon: ClipboardList },
  { name: "Rollen-Übersicht", href: "/admin/rollen-uebersicht", icon: ShieldCheck },
  { name: "Produkte", href: "/admin/products", icon: Package },
  { name: "AGB", href: "/admin/agb", icon: FileText },
  { name: "PLZ-Zuordnung", href: "/admin/plz-mapping", icon: MapPin },
  { name: "E-Mail-Einstellungen", href: "/admin/email-settings", icon: Mail },
  { name: "E-Mail-Vorschau", href: "/admin/email-preview", icon: Eye },
  { name: "Integrationen", href: "/integrationen", icon: Plug },
  { name: "Einstellungen", href: "/admin/settings", icon: Settings },
  { name: "FiBu-Reconciliation", href: "/admin/fibu-reconciliation", icon: FileDown },
  { name: "Systemdokumentation", href: "/admin/documentation", icon: BookMarked },
  { name: "Test-Leads aufräumen", href: "/admin/lead-cleanup", icon: AlertTriangle },
  { name: "Campaign Mint", href: "/admin/campaign-mint", icon: FileSignature },
  { name: "GOÄ-Kampagne", href: "/admin/kampagne", icon: Mail },
];

interface NavSectionProps {
  label: string;
  items: NavItem[];
  userRole: AppRole | null;
  currentPath: string;
  onNavigate?: () => void;
}

function NavSection({ label, items, userRole, currentPath, onNavigate }: NavSectionProps) {
  const visibleItems = items.filter((item) => canAccessRoute(item.href, userRole));

  if (visibleItems.length === 0) return null;

  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-1 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
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
    </div>
  );
}

function VerwaltungSection({
  items,
  userRole,
  currentPath,
  onNavigate,
}: Omit<NavSectionProps, "label">) {
  const visibleItems = items.filter((item) => canAccessRoute(item.href, userRole));
  const [open, setOpen] = useState(false);

  if (visibleItems.length === 0) return null;

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-1 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors"
      >
        <span>Verwaltung</span>
        <ChevronUp className={`h-3.5 w-3.5 transition-transform ${open ? "" : "rotate-180"}`} />
      </button>
      {open &&
        visibleItems.map((item) => {
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
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { role: userRole, actualRole } = useUserRole();
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
    currentPath: location.pathname,
    onNavigate,
  };

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 lg:px-6 border-b border-sidebar-border">
        <div className="h-9 w-9 lg:h-10 lg:w-10 rounded-full bg-white flex items-center justify-center flex-shrink-0">
          <img src={logo} alt="Honorarfuchs Logo" className="h-7 w-7 lg:h-8 lg:w-8 object-contain" />
        </div>
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
        <NavSection label="Operativ" items={operativNav} {...sectionProps} />
        <NavSection label="Vertriebssteuerung" items={vertriebssteuerungNav} {...sectionProps} />
        <NavSection label="Buchhaltung" items={buchhaltungNav} {...sectionProps} />
        <VerwaltungSection items={verwaltungNav} {...sectionProps} />
      </nav>

      {/* User / Profil */}
      <div className="border-t border-sidebar-border p-3 lg:p-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2 lg:gap-3 rounded-lg bg-sidebar-accent p-2 lg:p-3 hover:bg-sidebar-accent/80 transition-colors text-left">
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
              <ChevronUp className="h-4 w-4 text-sidebar-foreground/40 flex-shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-56 mb-1">
            <DropdownMenuItem asChild>
              <Link to="/mein-konto" onClick={onNavigate} className="flex items-center gap-2 cursor-pointer">
                <User className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm">Mein Konto</span>
                  <span className="block text-xs text-muted-foreground">Passwort & Profil</span>
                </div>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/sicherheit" onClick={onNavigate} className="flex items-center gap-2 cursor-pointer">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <span className="block text-sm">Sicherheit & 2FA</span>
                  <span className="block text-xs text-muted-foreground">Zwei-Faktor-Authentifizierung</span>
                </div>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="flex items-center gap-2 text-destructive focus:text-destructive cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Abmelden</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
