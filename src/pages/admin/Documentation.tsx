import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Users, Lightbulb, FileText, Receipt, UserCheck, Link2, Shield,
  ChevronDown, ChevronRight
} from "lucide-react";

interface FlowStep {
  id: string;
  label: string;
  description: string;
  type: "start" | "process" | "decision" | "end" | "action" | "external";
  next?: string[];
}

interface Flow {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  steps: FlowStep[];
  edges: Array<{ from: string; to: string; label?: string }>;
}

const flows: Flow[] = [
  {
    id: "lead",
    title: "Interessenten-Flow",
    subtitle: "Von der Anfrage bis zum Kunden",
    icon: UserCheck,
    color: "bg-primary/10 text-primary border-primary/20",
    steps: [
      { id: "s1", label: "Externe Anfrage", description: "Lead füllt Formular auf der Website aus (WordPress CF7 Webhook)", type: "start" },
      { id: "s2", label: "Edge Function: capture-lead", description: "HFX-I Nummer generiert, 12-stelliges Passwort erstellt", type: "action" },
      { id: "s3", label: "Datenbank: leads", description: "Eintrag angelegt mit Status 'new'", type: "process" },
      { id: "s4", label: "Bestätigungs-E-Mail", description: "HFX-Nummer + Passwort an Interessenten versandt", type: "action" },
      { id: "s5", label: "Salesforce-Sync", description: "Lead automatisch nach Salesforce übertragen", type: "external" },
      { id: "s6", label: "Qualifizierung", description: "Admin/Sales setzt Status: new → contacted → qualified / rejected", type: "decision" },
      { id: "s7", label: "Status: qualified", description: "Lead ist bereit für Vertragsabschluss", type: "process" },
      { id: "s8", label: "Status: rejected", description: "Lead wird archiviert", type: "end" },
      { id: "s9", label: "Vertrag erstellen", description: "Aus qualifiziertem Lead wird Vertrag erzeugt", type: "process" },
      { id: "s10", label: "Kunde angelegt", description: "Eintrag in 'praxen'-Tabelle, Status 'Kunde'", type: "end" },
    ],
    edges: [
      { from: "s1", to: "s2" }, { from: "s2", to: "s3" }, { from: "s3", to: "s4" },
      { from: "s3", to: "s5" }, { from: "s4", to: "s6" }, { from: "s6", to: "s7", label: "qualified" },
      { from: "s6", to: "s8", label: "rejected" }, { from: "s7", to: "s9" }, { from: "s9", to: "s10" },
    ],
  },
  {
    id: "tippgeber",
    title: "Tippgeber-Flow",
    subtitle: "Lead-Einreichung und Statusverfolgung",
    icon: Lightbulb,
    color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    steps: [
      { id: "t1", label: "Tippgeber eingeloggt", description: "Rolle: tippgeber – sieht nur eigene Daten (RLS)", type: "start" },
      { id: "t2", label: "Lead einreichen", description: "Formular: Arzt, Praxis, PLZ, Geschäftsbereich, Leistung", type: "process" },
      { id: "t3", label: "Datenbank: tipp_leads", description: "Status 'neu', 30-Tage Reservierungs-Timer startet", type: "action" },
      { id: "t4", label: "Bestätigungs-E-Mail", description: "Tippgeber erhält E-Mail mit AD-Kontaktdaten", type: "action" },
      { id: "t5", label: "Salesforce-Sync", description: "Lead automatisch zu Salesforce übertragen", type: "external" },
      { id: "t6", label: "Admin/Sales Lead prüft", description: "Zentrale Verwaltung unter /admin/tipp-leads", type: "decision" },
      { id: "t7", label: "Status geändert", description: "in_bearbeitung / abgeschlossen / abgelehnt", type: "process" },
      { id: "t8", label: "Benachrichtigungs-E-Mail", description: "Edge Function: notify-tipp-status sendet E-Mail an Tippgeber", type: "action" },
      { id: "t9", label: "Tippgeber informiert", description: "Kennt den aktuellen Bearbeitungsstand", type: "end" },
    ],
    edges: [
      { from: "t1", to: "t2" }, { from: "t2", to: "t3" }, { from: "t3", to: "t4" },
      { from: "t3", to: "t5" }, { from: "t4", to: "t6" }, { from: "t6", to: "t7" },
      { from: "t7", to: "t8" }, { from: "t8", to: "t9" },
    ],
  },
  {
    id: "vertrag",
    title: "Vertrags-Flow",
    subtitle: "Erstellung, Unterschrift und Genehmigung",
    icon: FileText,
    color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    steps: [
      { id: "v1", label: "Vertrag erstellen", description: "Sales befüllt Vertragsformular (Produkt, Laufzeit, Module, Preis)", type: "start" },
      { id: "v2", label: "Creditreform-Prüfung", description: "Bonitätsprüfung optional über Edge Function creditreform-check", type: "decision" },
      { id: "v3", label: "Vertrag gespeichert", description: "Status: 'draft', PDF-Template befüllt", type: "process" },
      { id: "v4", label: "Unterschrift Vertriebler", description: "Digitale Unterschrift via signature_pad", type: "action" },
      { id: "v5", label: "Unterschrift Kunde", description: "Kundenunterschrift auf dem Gerät", type: "action" },
      { id: "v6", label: "PDF generiert", description: "generateContractPdf() erzeugt finales Dokument", type: "action" },
      { id: "v7", label: "Audit-Log Eintrag", description: "signature_audit_logs: Zeitstempel, IP, Hash gespeichert", type: "process" },
      { id: "v8", label: "Admin-Genehmigung", description: "Status: 'pending_approval' → Admin genehmigt", type: "decision" },
      { id: "v9", label: "Vertragsversand", description: "Edge Function: send-contract-email sendet PDF per E-Mail", type: "action" },
      { id: "v10", label: "Vertrag aktiv", description: "Status: 'approved', auto_renewal konfiguriert", type: "end" },
    ],
    edges: [
      { from: "v1", to: "v2" }, { from: "v2", to: "v3", label: "bestanden / übersprungen" },
      { from: "v3", to: "v4" }, { from: "v4", to: "v5" }, { from: "v5", to: "v6" },
      { from: "v6", to: "v7" }, { from: "v7", to: "v8" },
      { from: "v8", to: "v9", label: "genehmigt" }, { from: "v9", to: "v10" },
    ],
  },
  {
    id: "rechnung",
    title: "Rechnungs-Flow",
    subtitle: "Automatische und manuelle Rechnungsstellung",
    icon: Receipt,
    color: "bg-green-500/10 text-green-600 border-green-500/20",
    steps: [
      { id: "r1", label: "Auslöser", description: "Manuell durch Admin oder automatisch (auto-invoice Edge Function)", type: "start" },
      { id: "r2", label: "Rechnungsdaten", description: "Kundendaten, Positionen, Steuersatz (19%) aus Vertrag", type: "process" },
      { id: "r3", label: "Rechnungsnummer", description: "Fortlaufende Nummer generiert (RG-YYYY-NNNN)", type: "action" },
      { id: "r4", label: "PDF generiert", description: "generateInvoicePdf() mit Logo und Positionen", type: "action" },
      { id: "r5", label: "Datenbank: invoices", description: "Eintrag gespeichert mit Status 'open'", type: "process" },
      { id: "r6", label: "E-Mail-Versand", description: "Edge Function: send-invoice-email mit PDF-Anhang", type: "action" },
      { id: "r7", label: "Lexware-Export", description: "Optional: Buchungssatz zu Lexware exportiert", type: "external" },
      { id: "r8", label: "Zahlung eingegangen", description: "Status auf 'paid' gesetzt, paid_at Timestamp", type: "decision" },
      { id: "r9", label: "Abgeschlossen", description: "Rechnung archiviert, Umsatz in customer_revenues", type: "end" },
    ],
    edges: [
      { from: "r1", to: "r2" }, { from: "r2", to: "r3" }, { from: "r3", to: "r4" },
      { from: "r4", to: "r5" }, { from: "r5", to: "r6" }, { from: "r6", to: "r7" },
      { from: "r6", to: "r8" }, { from: "r8", to: "r9", label: "bezahlt" },
    ],
  },
  {
    id: "auth",
    title: "Authentifizierungs-Flow",
    subtitle: "Anmeldung, 2FA und Zugangsanfragen",
    icon: Shield,
    color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    steps: [
      { id: "a1", label: "Zugangsanfrage", description: "Neuer Benutzer stellt Anfrage mit Name, E-Mail, Firma", type: "start" },
      { id: "a2", label: "Admin benachrichtigt", description: "Edge Function: notify-new-request sendet E-Mail an Admin", type: "action" },
      { id: "a3", label: "Admin prüft Anfrage", description: "Genehmigen oder ablehnen unter /admin/access-requests", type: "decision" },
      { id: "a4", label: "Benutzer erstellt", description: "Edge Function: create-user legt Account an, Rolle zugewiesen", type: "action" },
      { id: "a5", label: "Einladungs-E-Mail", description: "Benutzerdaten und temporäres Passwort per E-Mail", type: "action" },
      { id: "a6", label: "Login", description: "E-Mail + Passwort Eingabe auf /auth", type: "process" },
      { id: "a7", label: "2FA aktiv?", description: "Prüfung ob TOTP-Faktor vorhanden ist", type: "decision" },
      { id: "a8", label: "MFA Challenge", description: "6-stelliger Code aus Authenticator-App /mfa-challenge", type: "action" },
      { id: "a9", label: "Dashboard", description: "Zugang gewährt, rollenbasierte Navigation aktiv", type: "end" },
      { id: "a10", label: "Ablehnung", description: "Benutzer wird per E-Mail informiert", type: "end" },
    ],
    edges: [
      { from: "a1", to: "a2" }, { from: "a2", to: "a3" },
      { from: "a3", to: "a4", label: "genehmigt" }, { from: "a3", to: "a10", label: "abgelehnt" },
      { from: "a4", to: "a5" }, { from: "a5", to: "a6" },
      { from: "a6", to: "a7" }, { from: "a7", to: "a8", label: "ja" },
      { from: "a7", to: "a9", label: "nein" }, { from: "a8", to: "a9" },
    ],
  },
  {
    id: "integration",
    title: "Integrations-Flow",
    subtitle: "Salesforce & Lexware Synchronisation",
    icon: Link2,
    color: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    steps: [
      { id: "i1", label: "Salesforce OAuth", description: "Admin startet OAuth 2.0 PKCE Flow über /admin/settings", type: "start" },
      { id: "i2", label: "salesforce-auth Funktion", description: "PKCE code_verifier generiert, Redirect zu Salesforce", type: "action" },
      { id: "i3", label: "salesforce-callback", description: "Token-Austausch, Tokens in salesforce_connections gespeichert", type: "action" },
      { id: "i4", label: "Verbindung aktiv", description: "is_connected = true, instance_url gespeichert", type: "process" },
      { id: "i5", label: "Preissync", description: "salesforce-sync-price überträgt Produktpreise", type: "action" },
      { id: "i6", label: "Lexware-API Key", description: "API-Schlüssel in integration_settings gespeichert", type: "process" },
      { id: "i7", label: "lexware-integration", description: "Manueller oder automatischer Sync (lexware-auto-sync)", type: "action" },
      { id: "i8", label: "Buchungssätze", description: "Rechnungen als Voucher in Lexware exportiert", type: "external" },
      { id: "i9", label: "Sync-Protokoll", description: "Ergebnis in integration_sync_logs gespeichert", type: "end" },
    ],
    edges: [
      { from: "i1", to: "i2" }, { from: "i2", to: "i3" }, { from: "i3", to: "i4" },
      { from: "i4", to: "i5" }, { from: "i6", to: "i7" }, { from: "i7", to: "i8" },
      { from: "i8", to: "i9" }, { from: "i5", to: "i9" },
    ],
  },
];

const stepTypeConfig = {
  start: { bg: "bg-primary text-primary-foreground", label: "Start" },
  end: { bg: "bg-muted text-muted-foreground border border-border", label: "Ende" },
  process: { bg: "bg-card border border-border text-foreground", label: "Prozess" },
  decision: { bg: "bg-amber-500/15 border border-amber-500/30 text-amber-700 dark:text-amber-400", label: "Entscheidung" },
  action: { bg: "bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400", label: "Aktion" },
  external: { bg: "bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400", label: "Extern" },
};

function FlowDiagram({ flow }: { flow: Flow }) {
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 mb-6">
        <div className={`p-2 rounded-lg border ${flow.color}`}>
          <flow.icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{flow.title}</h3>
          <p className="text-sm text-muted-foreground">{flow.subtitle}</p>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 mb-4">
        {Object.entries(stepTypeConfig).map(([type, cfg]) => (
          <span key={type} className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg}`}>
            {cfg.label}
          </span>
        ))}
      </div>

      {/* Flow Steps */}
      <div className="space-y-1">
        {flow.steps.map((step, idx) => {
          const cfg = stepTypeConfig[step.type];
          const isExpanded = expandedStep === step.id;
          const outgoingEdges = flow.edges.filter(e => e.from === step.id);
          const isLast = idx === flow.steps.length - 1;

          return (
            <div key={step.id}>
              <div
                className="flex items-start gap-3 cursor-pointer group"
                onClick={() => setExpandedStep(isExpanded ? null : step.id)}
              >
                {/* Step Number */}
                <div className="flex flex-col items-center flex-shrink-0">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${cfg.bg}`}>
                    {idx + 1}
                  </div>
                  {!isLast && <div className="w-0.5 h-6 bg-border mt-1" />}
                </div>

                {/* Content */}
                <div className={`flex-1 rounded-lg border px-4 py-2.5 mb-1 transition-colors ${cfg.bg} group-hover:opacity-90`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{step.label}</span>
                      <Badge variant="outline" className="text-xs px-1.5 py-0 h-4">
                        {cfg.label}
                      </Badge>
                    </div>
                    {isExpanded
                      ? <ChevronDown className="h-3.5 w-3.5 opacity-60 flex-shrink-0" />
                      : <ChevronRight className="h-3.5 w-3.5 opacity-40 flex-shrink-0" />
                    }
                  </div>
                  {isExpanded && (
                    <p className="text-xs mt-1.5 opacity-80 leading-relaxed">{step.description}</p>
                  )}
                </div>
              </div>

              {/* Edge labels */}
              {isExpanded && outgoingEdges.length > 0 && (
                <div className="ml-10 flex flex-wrap gap-1.5 mb-1">
                  {outgoingEdges.map((edge, ei) => (
                    edge.label && (
                      <span key={ei} className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-dashed border-border">
                        → {edge.label}
                      </span>
                    )
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Documentation() {
  return (
    <MainLayout title="Systemdokumentation" subtitle="Übersicht aller Prozessabläufe und Flows">
      <div className="space-y-4">
        <div className="card-elevated p-4">
          <p className="text-sm text-muted-foreground">
            Diese Seite dokumentiert alle zentralen Systemabläufe. Klicken Sie auf einen Schritt, um Details einzublenden.
            Die Flows decken den gesamten Lebenszyklus von Leads, Verträgen, Rechnungen und Integrationen ab.
          </p>
        </div>

        <Tabs defaultValue="lead" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-1 p-1">
            {flows.map((f) => (
              <TabsTrigger key={f.id} value={f.id} className="gap-1.5 text-xs">
                <f.icon className="h-3.5 w-3.5" />
                {f.title}
              </TabsTrigger>
            ))}
          </TabsList>

          {flows.map((f) => (
            <TabsContent key={f.id} value={f.id}>
              <div className="card-elevated p-6">
                <FlowDiagram flow={f} />
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </MainLayout>
  );
}
