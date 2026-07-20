import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { UserPlus, FileSignature, AlertTriangle, CheckCircle2, Lightbulb } from "lucide-react";

interface AnleitungDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AnleitungDialog({ open, onOpenChange }: AnleitungDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-xl flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Anleitung für Außendienstmitarbeiter
          </DialogTitle>
          <DialogDescription>
            HFX GOÄ – Vertriebsportal: Interessenten und Verträge anlegen
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="interessent" className="flex flex-col flex-1 min-h-0">
          <TabsList className="mx-6 mt-4 grid grid-cols-3">
            <TabsTrigger value="interessent" className="gap-1.5">
              <UserPlus className="h-4 w-4" /> Interessent
            </TabsTrigger>
            <TabsTrigger value="vertrag" className="gap-1.5">
              <FileSignature className="h-4 w-4" /> Vertrag
            </TabsTrigger>
            <TabsTrigger value="fehler" className="gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Fehler & Tipps
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="flex-1 max-h-[60vh]">
            <div className="px-6 py-5">
              {/* === INTERESSENT === */}
              <TabsContent value="interessent" className="mt-0 space-y-5">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Ein <strong>Interessent</strong> ist eine Praxis oder ein Arzt, der Interesse an HFX-Produkten gezeigt
                  hat, aber noch keinen Vertrag abgeschlossen hat. Im System wird dies als <strong>Lead</strong> geführt
                  und erhält automatisch eine <Badge variant="outline">HFX-I-Nummer</Badge>.
                </p>

                <Step n={1} title="Pipeline öffnen">
                  In der linken Seitenleiste unter <strong>„Vertrieb"</strong> → <strong>„Pipeline"</strong> klicken
                  und den Tab <strong>„Interessenten"</strong> auswählen.
                </Step>

                <Step n={2} title="Neuen Interessenten erstellen">
                  Oben rechts auf <strong>„Neuer Interessent"</strong> (Plus-Symbol) klicken. Es öffnet sich der
                  Dialog <em>„Interessent anlegen"</em>.
                </Step>

                <Step n={3} title="Pflichtfelder ausfüllen">
                  <ul className="mt-2 space-y-1.5 text-sm">
                    <li><strong>Praxisname</strong> — offizieller Name (mind. 2 Zeichen)</li>
                    <li><strong>Vorname / Nachname</strong> — Hauptansprechpartner (i. d. R. der Arzt)</li>
                    <li><strong>E-Mail</strong> — gültige Adresse, wird für die Bestätigung verwendet</li>
                    <li><strong>PLZ</strong> — mindestens 4 Stellen, steuert die automatische Gebietszuweisung</li>
                  </ul>
                </Step>

                <Step n={4} title="Empfohlene Felder">
                  Mobilnummer, Adresse/Ort, Abrechnungszentrum (PVS, DZR, „keins"), MP-Nummer (5-stellig),
                  Produktinteresse (z. B. HFX GOÄ, HFX EBM, HFX Doku — Mehrfachauswahl), Notiz/Nachricht.
                </Step>

                <Step n={5} title="Zuordnung">
                  <strong>Zugewiesen an</strong>: Standard ist die automatische PLZ-Zuweisung.<br />
                  <strong>Tippgeber</strong>: bei Bedarf verknüpfen (relevant für die Provision).
                </Step>

                <Step n={6} title="Speichern">
                  Auf <strong>„Interessent anlegen"</strong> klicken. Das System erzeugt automatisch:
                  <ul className="mt-2 space-y-1 text-sm list-disc list-inside">
                    <li>eine HFX-I-Nummer (z. B. <code className="text-xs bg-muted px-1 rounded">HFX-I-01234</code>)</li>
                    <li>ein 12-stelliges Initialpasswort für den Interessentenzugang</li>
                    <li>eine Bestätigungs-E-Mail mit Zugangsdaten</li>
                    <li>bei aktiver Verbindung: einen Salesforce-Sync</li>
                  </ul>
                </Step>

                <Step n={7} title="Folgeaktionen">
                  Status pflegen: <code className="text-xs bg-muted px-1 rounded">neu</code> →{" "}
                  <code className="text-xs bg-muted px-1 rounded">kontaktiert</code> →{" "}
                  <code className="text-xs bg-muted px-1 rounded">qualifiziert</code> → Vertrag oder{" "}
                  <code className="text-xs bg-muted px-1 rounded">abgelehnt</code>.
                </Step>

                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                  💡 <strong>Tipp:</strong> Wenn aus einer <em>Reservierung</em> ein Interessent wird, übernimmt das
                  System Produktinteressen automatisch.
                </div>
              </TabsContent>

              {/* === VERTRAG === */}
              <TabsContent value="vertrag" className="mt-0 space-y-5">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Diesen Workflow nutzt der AD, wenn aus einem qualifizierten Interessenten ein neuer Vertrag entsteht
                  oder ein bestehender Altvertrag im System nachgepflegt werden soll.
                </p>

                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  ⚠️ <strong>Hinweis:</strong> Papierverträge im klassischen Sinn werden nicht mehr ausgestellt — der
                  Workflow ist strikt digital.
                </div>

                <Step n={1} title="Einstieg über das Dashboard">
                  <ul className="mt-1 space-y-1 text-sm list-disc list-inside">
                    <li>Kachel <strong>„Verträge"</strong> → Vertragsübersicht</li>
                    <li>Schnellaktion <strong>„Neuer Vertrag"</strong></li>
                    <li>Alternativ: Seitenleiste → <strong>Vertrieb → Verträge → Neuer Vertrag</strong></li>
                  </ul>
                </Step>

                <Step n={2} title="Kunde / Interessent auswählen">
                  Suche per HFX-I-Nummer, Praxisname oder Nachname. Falls noch nicht vorhanden, zuerst Interessent
                  anlegen, dann Vertrag erzeugen.
                </Step>

                <Step n={3} title="Produkt & Konditionen wählen">
                  <ul className="mt-2 space-y-1.5 text-sm">
                    <li><strong>Produkt</strong> — z. B. HFX GOÄ, HFX EBM, HFX Praxismanagement</li>
                    <li><strong>Module/Add-ons</strong> — je nach Produkt</li>
                    <li><strong>Laufzeit</strong> — Standard 24 Monate</li>
                    <li><strong>Vertragsbeginn</strong> — auch rückwirkend möglich (Bestandsverträge)</li>
                    <li><strong>Preis/Konditionen</strong> — aus Produktkatalog, anpassbar</li>
                    <li><strong>Vertriebspartner/AD</strong> — automatisch befüllt (Provisionsrelevant)</li>
                  </ul>
                </Step>

                <Step n={4} title="Bonitätsprüfung (optional)">
                  Bei Neuverträgen kann eine Creditreform-Prüfung ausgelöst werden. Bei reinen Nachpflegungen meist
                  nicht nötig.
                </Step>

                <Step n={5} title="Status setzen">
                  <div className="mt-2 space-y-3">
                    <div className="rounded-md border border-border p-3">
                      <p className="font-semibold text-sm mb-1.5">A) Neuer Vertrag (digital)</p>
                      <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                        <li>Vertrag als <em>Entwurf</em> speichern</li>
                        <li>Digitale Unterschrift Vertriebler (Tablet/Gerät)</li>
                        <li>Digitale Unterschrift Kunde vor Ort</li>
                        <li>PDF wird automatisch generiert + Audit-Log</li>
                        <li>Status: <em>Versendet, wartet auf Mandat</em> → Admin-Prüfung → <em>Aktiv</em></li>
                        <li>Vertrag + Begrüßungsmail gehen automatisch raus</li>
                      </ol>
                    </div>
                    <div className="rounded-md border border-border p-3">
                      <p className="font-semibold text-sm mb-1.5">B) Bestandsvertrag nachpflegen</p>
                      <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                        <li>Direkt mit Status <em>Aktiv/Gebucht</em> anlegen (Berechtigung nötig)</li>
                        <li>Vorhandenes Vertrags-PDF als Anhang hochladen</li>
                        <li>Vertragsbeginn + Konditionen exakt aus Original übernehmen</li>
                        <li>Stripe-Mandat / SEPA-Daten ergänzen</li>
                      </ol>
                    </div>
                  </div>
                </Step>

                <Step n={6} title="Zahlung einrichten">
                  Zahlungsweg ist <strong>immer Stripe</strong> (SEPA-Lastschrift oder Kreditkarte). Manuelle
                  Banküberweisungen sind nicht vorgesehen — die IBAN dient nur zur Dokumentation. Fehlt das Mandat,
                  generiert das System am 1. des Folgemonats automatisch eine Setup-Session.
                </Step>

                <Step n={7} title="Kontrolle im Dashboard">
                  <ul className="mt-1 space-y-1 text-sm list-disc list-inside">
                    <li><strong>Verträge in Arbeit</strong> — offene Entwürfe und Genehmigungen</li>
                    <li><strong>Alerts</strong> — „Vertrag ohne SEPA-Mandat-Versand" oder „wartet auf Mandat-Erteilung" sofort behandeln</li>
                    <li><strong>Pipeline-Tab Verträge</strong> — Vertrag im Vertriebsfluss</li>
                  </ul>
                </Step>
              </TabsContent>

              {/* === FEHLER === */}
              <TabsContent value="fehler" className="mt-0 space-y-5">
                <h3 className="font-semibold text-sm flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" /> Häufige Fehler vermeiden
                </h3>
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Problem</th>
                        <th className="text-left px-3 py-2 font-medium">Lösung</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <Row p="Lead erscheint doppelt" l="Vor dem Anlegen Suche nutzen (E-Mail/MP-Nr. existiert bereits)" />
                      <Row p="Falsche Gebietszuweisung" l="PLZ korrigieren – Zuweisung läuft automatisch neu" />
                      <Row p="Vertrag bleibt im Entwurf" l="Vertrag öffnen, fehlende Pflichtfelder/Unterschrift ergänzen" />
                      <Row p="Keine Provision sichtbar" l="Tippgeber/Vertriebspartner im Vertrag nachpflegen" />
                      <Row p="Kunde erhält keine Rechnung" l="Stripe-Mandat fehlt – Setup-Link erneut versenden" />
                    </tbody>
                  </table>
                </div>

                <h3 className="font-semibold text-sm flex items-center gap-2 pt-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Kurz-Checkliste
                </h3>

                <div className="grid sm:grid-cols-2 gap-3">
                  <Checklist
                    title="Interessent anlegen"
                    items={[
                      `Pipeline → Tab „Interessenten" → „Neuer Interessent"`,
                      "Praxis, Name, E-Mail, PLZ ausfüllen",
                      "Produktinteresse markieren",
                      "Tippgeber / AD zuweisen",
                      "Speichern → HFX-I-Nummer wird vergeben",
                    ]}
                  />
                  <Checklist
                    title="Vertrag anlegen"
                    items={[
                      `Dashboard → „Neuer Vertrag"`,
                      "Kunden / Interessenten auswählen",
                      "Produkt, Laufzeit, Konditionen setzen",
                      "Unterschriften (digital) oder Bestands-PDF hochladen",
                      "Stripe-Mandat einrichten",
                      "Status prüfen → Aktiv",
                    ]}
                  />
                </div>

                <p className="text-xs text-muted-foreground pt-2">
                  Bei Fragen: <a href="mailto:info@hfx-honorarfuchs.de" className="text-primary hover:underline">info@hfx-honorarfuchs.de</a>
                </p>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="shrink-0 w-7 h-7 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-semibold flex items-center justify-center">
        {n}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="font-semibold text-sm text-foreground mb-1">{title}</p>
        <div className="text-sm text-muted-foreground leading-relaxed">{children}</div>
      </div>
    </div>
  );
}

function Row({ p, l }: { p: string; l: string }) {
  return (
    <tr>
      <td className="px-3 py-2 align-top font-medium">{p}</td>
      <td className="px-3 py-2 align-top text-muted-foreground">{l}</td>
    </tr>
  );
}

function Checklist({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="font-semibold text-sm mb-2">{title}</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
