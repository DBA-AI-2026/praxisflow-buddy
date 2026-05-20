/**
 * KundenDialog — Einheits-Dialog Grundgerüst (Etappe 2a).
 *
 * Rein deklarativ: alle Daten kommen über Props vom Aufrufer.
 * Kein Daten-Laden, kein Permission-Check, keine Edge-Cases (Lost/Beendet)
 * — das kommt in Etappe 2b und später.
 *
 * Struktur:
 *  - Identifikations-Kopf (HFX-Nummer, Person, Praxis, Kontakt)
 *  - Phasen-Stufenleiste (5 Stufen)
 *  - optionale Status-Pille mit Mini-Hinweis
 *  - 3 Tabs (Stammdaten / Vertrag & Aktionen / Verlauf) als Platzhalter
 */

import { Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useKundenDialogData } from "@/hooks/useKundenDialogData";
import { StammdatenTab } from "@/components/kunden/StammdatenTab";

export type KundenPhase =
  | "lead"
  | "qualifiziert"
  | "vertrag"
  | "aktiv"
  | "service";

export interface KundenDialogProps {
  open: boolean;
  onClose: () => void;

  // Identifikations-Block (in 2a vom Aufrufer geliefert; in 2b aus Hook)
  hfxNumber: string;
  praxisName: string;
  personName: string;
  email?: string;
  phone?: string;
  ort?: string;

  // Phasen-Stufenleiste
  currentPhase: KundenPhase;
  currentStatusLabel?: string;
}

const PHASE_ORDER: KundenPhase[] = [
  "lead",
  "qualifiziert",
  "vertrag",
  "aktiv",
  "service",
];

const PHASE_LABELS: Record<KundenPhase, string> = {
  lead: "Lead",
  qualifiziert: "Qualifiziert",
  vertrag: "Vertrag",
  aktiv: "Aktiv",
  service: "Service",
};

export function KundenDialog({
  open,
  onClose,
  hfxNumber,
  praxisName,
  personName,
  email,
  phone,
  ort,
  currentPhase,
  currentStatusLabel,
}: KundenDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          {/* Identifikations-Block */}
          <div className="space-y-2">
            <DialogTitle className="flex items-baseline gap-3 flex-wrap">
              <span className="font-mono text-primary text-base">
                {hfxNumber}
              </span>
              <span className="text-foreground">{personName}</span>
              <span className="text-muted-foreground font-normal text-sm">
                · {praxisName}
              </span>
            </DialogTitle>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {email && <span>{email}</span>}
              {phone && (
                <>
                  <span>·</span>
                  <span>{phone}</span>
                </>
              )}
              {ort && (
                <>
                  <span>·</span>
                  <span>{ort}</span>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Phasen-Stufenleiste */}
        <div className="pt-2">
          <PhasenStufenleiste currentPhase={currentPhase} />
        </div>

        {/* Optional: Status-Pille mit Mini-Erklärung */}
        {currentStatusLabel && (
          <div className="flex justify-center">
            <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
              {currentStatusLabel}
            </span>
          </div>
        )}

        {/* Tabs */}
        <Tabs defaultValue="stammdaten" className="mt-2">
          <TabsList className="w-full">
            <TabsTrigger value="stammdaten" className="flex-1">
              Stammdaten
            </TabsTrigger>
            <TabsTrigger value="vertrag" className="flex-1">
              Vertrag & Aktionen
            </TabsTrigger>
            <TabsTrigger value="verlauf" className="flex-1">
              Verlauf
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stammdaten" className="mt-4">
            <TabPlaceholder
              label="Stammdaten"
              hint="Inhalt folgt in Etappe 2b — Praxis-, Person- und Kontaktdaten zum Bearbeiten."
            />
          </TabsContent>
          <TabsContent value="vertrag" className="mt-4">
            <TabPlaceholder
              label="Vertrag & Aktionen"
              hint="Inhalt folgt in Etappe 3 — Vertragsdetails, Status-Aktionen, Buchungslink, SEPA-Mandat."
            />
          </TabsContent>
          <TabsContent value="verlauf" className="mt-4">
            <TabPlaceholder
              label="Verlauf"
              hint="Inhalt folgt in Etappe 4 — chronologische customer_events-Liste."
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

/* ----------------------------- Sub-Components ----------------------------- */

/**
 * PhasenStufenleiste — horizontale 5-Stufen-Anzeige mit Verbindungslinien.
 * Visuelle Zustände: erfüllt (vorher), aktiv (current), leer (folgend).
 * Auf schmalen Screens horizontal scrollbar.
 */
function PhasenStufenleiste({ currentPhase }: { currentPhase: KundenPhase }) {
  const currentIdx = PHASE_ORDER.indexOf(currentPhase);

  return (
    <div className="w-full overflow-x-auto">
      <ol className="flex items-start min-w-[480px] px-2">
        {PHASE_ORDER.map((phase, idx) => {
          const isActive = idx === currentIdx;
          const isDone = idx < currentIdx;
          const isLast = idx === PHASE_ORDER.length - 1;

          return (
            <li
              key={phase}
              className="flex-1 flex flex-col items-center relative"
            >
              {/* Verbindungslinie zur nächsten Stufe */}
              {!isLast && (
                <div
                  className={cn(
                    "absolute top-3 left-1/2 w-full h-0.5",
                    idx < currentIdx ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              )}

              {/* Kreissymbol */}
              <div
                className={cn(
                  "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                  isActive &&
                    "border-primary bg-primary text-primary-foreground",
                  isDone && "border-primary bg-primary/70 text-primary-foreground",
                  !isActive && !isDone && "border-border bg-background",
                )}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <span
                    className={cn(
                      "h-2 w-2 rounded-full",
                      isActive ? "bg-primary-foreground" : "bg-transparent",
                    )}
                  />
                )}
              </div>

              {/* Label */}
              <span
                className={cn(
                  "mt-2 text-xs text-center px-1",
                  isActive && "font-semibold text-foreground",
                  isDone && "text-muted-foreground",
                  !isActive && !isDone && "text-muted-foreground",
                )}
              >
                {PHASE_LABELS[phase]}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * TabPlaceholder — neutraler Platzhalter für noch nicht implementierte Tabs.
 */
function TabPlaceholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
