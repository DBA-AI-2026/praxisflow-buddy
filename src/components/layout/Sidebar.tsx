import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  Ticket,
  Key,
  Settings,
  Users,
  FileDown,
  Calendar,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import logo from "@/assets/logo.jpeg";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const navigation = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Praxen", href: "/praxen", icon: Building2 },
  { name: "Tickets", href: "/tickets", icon: Ticket },
  { name: "Kalender", href: "/kalender", icon: Calendar },
  { name: "Lizenzen", href: "/lizenzen", icon: Key },
  { name: "Datenexport", href: "/export", icon: FileDown },
];

const adminNavigation = [
  { name: "Benutzerverwaltung", href: "/admin/users", icon: Users },
  { name: "Einstellungen", href: "/admin/settings", icon: Settings },
];

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-4 md:px-6 border-b border-sidebar-border">
        <img src={logo} alt="Honorarfuchs Logo" className="h-9 w-9 md:h-10 md:w-10 rounded-lg object-contain" />
        <div>
          <span className="text-base md:text-lg font-semibold text-sidebar-foreground">Honorarfuchs</span>
          <span className="text-xs block text-sidebar-foreground/60">Portal</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 md:px-3 py-4 overflow-y-auto">
        <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Hauptmenü
        </div>
        {navigation.map((item) => {
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
      </nav>

      {/* User */}
      <div className="border-t border-sidebar-border p-3 md:p-4">
        <div className="flex items-center gap-2 md:gap-3 rounded-lg bg-sidebar-accent p-2 md:p-3">
          <div className="flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-sidebar-primary text-xs md:text-sm font-medium text-sidebar-primary-foreground flex-shrink-0">
            AD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              Admin Demo
            </p>
            <p className="text-xs text-sidebar-foreground/60 truncate">
              admin@qodia.de
            </p>
          </div>
          <button className="p-1.5 rounded-md hover:bg-sidebar-border/50 transition-colors flex-shrink-0">
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
