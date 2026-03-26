import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AppRole } from "@/hooks/useUserRole";

// ─── Datenquellen ─────────────────────────────────────────────────────────────
// Statisch abgeleitet aus Sidebar.tsx (navItems → roles) und routePermissions.ts
// Reihenfolge der Rollen: tippgeber → sales_partner → user → regional_lead → sales_lead → admin

const ROLES: { key: AppRole; label: string }[] = [
  { key: "tippgeber",     label: "Tippgeber" },
  { key: "sales_partner", label: "Vertriebspartner" },
  { key: "user",          label: "Gebietsleiter" },
  { key: "regional_lead", label: "Regionalleiter" },
  { key: "sales_lead",    label: "Vertriebsleitung" },
  { key: "admin",         label: "Administrator" },
];

type AccessSource = "sidebar" | "route" | "both" | "none";

interface ModuleAccess {
  module: string;
  path: string;
  // Per-Rolle: welche Quelle erlaubt Zugriff
  access: Partial<Record<AppRole, AccessSource>>;
}

// Abgeleitet aus Sidebar-navItems + routePermissions
// sidebar: in Sidebar.tsx für diese Rolle gelistet
// route:   in routePermissions.ts für diese Rolle freigegeben
// both:    beides
// none:    kein Zugriff
const MODULES: ModuleAccess[] = [
  {
    module: "Dashboard",
    path: "/",
    access: {
      tippgeber:     "both",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Interessenten",
    path: "/interessenten",
    access: {
      tippgeber:     "none",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Reservierungen",
    path: "/reservierungen",
    access: {
      tippgeber:     "none",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "none",      // ⚠️ Sidebar: nein, route: ja → Inkonsistenz
      admin:         "both",
    },
  },
  {
    module: "Demo-Tracking",
    path: "/demo-tracking",
    access: {
      tippgeber:     "none",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Tipp-Leads",
    path: "/tipp-leads",
    access: {
      tippgeber:     "both",
      sales_partner: "none",
      user:          "none",
      regional_lead: "none",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Kunden-Journey",
    path: "/praxen-journey",
    access: {
      tippgeber:     "none",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Kundenstamm",
    path: "/kunden",
    access: {
      tippgeber:     "none",
      sales_partner: "route",     // route erlaubt, Sidebar nein → Inkonsistenz
      user:          "route",     // route erlaubt, Sidebar nein → Inkonsistenz
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Verträge",
    path: "/vertrieb/vertraege",
    access: {
      tippgeber:     "none",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "HFX EBM Lizenzen",
    path: "/lizenzen",
    access: {
      tippgeber:     "none",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Umsätze",
    path: "/umsaetze",
    access: {
      tippgeber:     "none",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Rechnungen & Usage",
    path: "/rechnungen",
    access: {
      tippgeber:     "none",
      sales_partner: "none",
      user:          "none",
      regional_lead: "none",
      sales_lead:    "none",
      admin:         "both",
    },
  },
  {
    module: "Buchhaltung / FiBu",
    path: "/buchhaltung",
    access: {
      tippgeber:     "none",
      sales_partner: "none",
      user:          "none",
      regional_lead: "none",
      sales_lead:    "none",
      admin:         "both",
    },
  },
  {
    module: "Provisionen",
    path: "/vertrieb/provisionen",
    access: {
      tippgeber:     "both",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Vertriebler",
    path: "/vertrieb/vertriebler",
    access: {
      tippgeber:     "none",
      sales_partner: "none",
      user:          "none",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Datenexport",
    path: "/export",
    access: {
      tippgeber:     "none",
      sales_partner: "none",
      user:          "none",
      regional_lead: "none",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Qodia-Verbrauch",
    path: "/qodia-verbrauch",
    access: {
      tippgeber:     "none",
      sales_partner: "none",
      user:          "none",
      regional_lead: "none",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Tickets",
    path: "/tickets",
    access: {
      tippgeber:     "none",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Kalender",
    path: "/kalender",
    access: {
      tippgeber:     "none",
      sales_partner: "none",
      user:          "none",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Sicherheit (2FA)",
    path: "/sicherheit",
    access: {
      tippgeber:     "both",
      sales_partner: "both",
      user:          "both",
      regional_lead: "both",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "PLZ-Zuordnung",
    path: "/admin/plz-mapping",
    access: {
      tippgeber:     "none",
      sales_partner: "none",
      user:          "none",
      regional_lead: "none",
      sales_lead:    "both",
      admin:         "both",
    },
  },
  {
    module: "Dev-Tools (Vorschau)",
    path: "/admin/email-preview",
    access: {
      tippgeber:     "none",
      sales_partner: "none",
      user:          "none",
      regional_lead: "none",
      sales_lead:    "none",
      admin:         "both",
    },
  },
];

// ─── Zell-Darstellung ──────────────────────────────────────────────────────────
function AccessCell({ source }: { source: AccessSource }) {
  if (source === "both") {
    return (
      <span className="text-xl" title="Zugriff erlaubt (Sidebar + Route)">✅</span>
    );
  }
  if (source === "none") {
    return (
      <span className="text-xl opacity-30" title="Kein Zugriff">❌</span>
    );
  }
  // Inkonsistenz: nur Sidebar ODER nur Route
  const label =
    source === "sidebar"
      ? "Sidebar sichtbar, aber routePermissions verweigert"
      : "Route erlaubt, aber nicht in Sidebar sichtbar";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-xl cursor-help">⚠️</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Inkonsistenz-Zähler ───────────────────────────────────────────────────────
function countInconsistencies(): number {
  let count = 0;
  for (const m of MODULES) {
    for (const r of ROLES) {
      const src = m.access[r.key] ?? "none";
      if (src === "sidebar" || src === "route") count++;
    }
  }
  return count;
}

// ─── Seite ────────────────────────────────────────────────────────────────────
export default function RollenUebersicht() {
  const inconsistencies = countInconsistencies();

  return (
    <MainLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold text-foreground">Rollen &amp; Zugriffe</h1>
          <p className="text-sm text-muted-foreground">
            Übersicht aller Navigationsbereiche und Zugriffsrechte pro Rolle. Abgeleitet aus{" "}
            <code className="bg-muted px-1 rounded text-xs">Sidebar.tsx</code> und{" "}
            <code className="bg-muted px-1 rounded text-xs">routePermissions.ts</code>.
          </p>
        </div>

        {/* Legende + Inkonsistenz-Banner */}
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
            <span><span className="mr-1">✅</span> Zugriff erlaubt (Sidebar + Route)</span>
            <span><span className="mr-1">❌</span> Kein Zugriff</span>
            <span><span className="mr-1">⚠️</span> Inkonsistenz (nur Sidebar oder nur Route)</span>
          </div>
          {inconsistencies > 0 && (
            <Badge variant="destructive" className="whitespace-nowrap">
              {inconsistencies} Inkonsistenz{inconsistencies !== 1 ? "en" : ""} erkannt
            </Badge>
          )}
        </div>

        {/* Matrix */}
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full text-sm">
            {/* Sticky Header */}
            <thead className="bg-muted/80 sticky top-0 z-10">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-foreground whitespace-nowrap min-w-[180px] border-b border-border">
                  Bereich / Modul
                </th>
                <th className="px-3 py-1 font-medium text-xs text-muted-foreground whitespace-nowrap border-b border-border min-w-[24px]">
                  Route
                </th>
                {ROLES.map((r) => (
                  <th
                    key={r.key}
                    className="px-4 py-3 text-center font-semibold text-foreground whitespace-nowrap border-b border-border border-l border-l-border/50"
                  >
                    <span className="text-xs">{r.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MODULES.map((mod, idx) => {
                const hasInconsistency = ROLES.some((r) => {
                  const src = mod.access[r.key] ?? "none";
                  return src === "sidebar" || src === "route";
                });
                return (
                  <tr
                    key={mod.module}
                    className={[
                      idx % 2 === 0 ? "bg-background" : "bg-muted/20",
                      hasInconsistency ? "ring-1 ring-inset ring-warning/40" : "",
                    ].join(" ")}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground whitespace-nowrap">
                      {mod.module}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground font-mono whitespace-nowrap">
                      {mod.path}
                    </td>
                    {ROLES.map((r) => {
                      const src = mod.access[r.key] ?? "none";
                      return (
                        <td
                          key={r.key}
                          className="px-4 py-2.5 text-center border-l border-l-border/30"
                        >
                          <AccessCell source={src} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Fußnote */}
        <p className="text-xs text-muted-foreground">
          Stand: statisch abgeleitet. Zukünftig erweiterbar um Live-Abgleich, CSV-Export und
          direkte Rechteverwaltung.
        </p>
      </div>
    </MainLayout>
  );
}
