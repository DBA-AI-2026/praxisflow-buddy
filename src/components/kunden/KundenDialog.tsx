/**
 * KundenDialog — Einheits-Dialog (Etappe 2b-ii).
 *
 * Zwei Modi:
 *  - Static-Mode: alle Header-/Phase-Werte als Props (Preview-Demos).
 *  - Hook-Mode: `input` (HFX/Lead-ID/Customer-ID) → Hook lädt Header + Phase.
 *
 * Struktur:
 *  - Identifikations-Kopf (HFX-Nummer, Person, Praxis, Kontakt)
 *  - Phasen-Stufenleiste (5 Stufen)
 *  - optionale Status-Pille mit Mini-Hinweis
 *  - 3 Tabs (Stammdaten / Vertrag & Aktionen / Verlauf) — Tab 2/3 Platzhalter
 */

import { Check } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  useKundenDialogData,
  type KundenDialogInput,
  type UseKundenDialogDataResult,
} from "@/hooks/useKundenDialogData";
import { StammdatenTab } from "@/components/kunden/StammdatenTab";
import { VertragTab } from "@/components/kunden/VertragTab";
import { VerlaufTab } from "@/components/kunden/VerlaufTab";

export type KundenPhase =
  | "lead"
  | "qualifiziert"
  | "vertrag"
  | "aktiv"
  | "service";

interface CommonProps {
  open: boolean;
  onClose: () => void;
}

interface StaticProps extends CommonProps {
  input?: undefined;
  hfxNumber: string;
  praxisName: string;
  personName: string;
  email?: string;
  phone?: string;
  ort?: string;
  currentPhase: KundenPhase;
  currentStatusLabel?: string;
}

interface HookProps extends CommonProps {
  input: KundenDialogInput;
}

export type KundenDialogProps = StaticProps | HookProps;

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

export function KundenDialog(props: KundenDialogProps) {
  if ("input" in props && props.input) {
    return <KundenDialogHookMode open={props.open} onClose={props.onClose} input={props.input} />;
  }
  return <KundenDialogStaticMode {...(props as StaticProps)} />;
}

/* ---------------------------- Hook-Mode ---------------------------- */

function KundenDialogHookMode({ open, onClose, input }: HookProps) {
  const data = useKundenDialogData(input, open);
  const header = data.header;
  const phase = data.derivedPhase;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {!header || data.isLoading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Lade Daten…
          </div>
        ) : (
          <DialogShell
            hfxNumber={header.hfxNumber}
            praxisName={header.praxisName}
            personName={header.personName}
            email={header.email}
            phone={header.phone}
            ort={header.ort}
            currentPhase={phase}
            currentStatusLabel={data.currentStatusLabel ?? undefined}
            data={data}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- Static-Mode -------------------------- */

function KundenDialogStaticMode({
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
}: StaticProps) {
  const data = useKundenDialogData(
    open && hfxNumber ? { type: "hfx", hfxNumber, forcePhase: currentPhase } : null,
    open,
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogShell
          hfxNumber={hfxNumber}
          praxisName={praxisName}
          personName={personName}
          email={email}
          phone={phone}
          ort={ort}
          currentPhase={currentPhase}
          currentStatusLabel={currentStatusLabel}
          data={data}
        />
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- Shared shell ------------------------- */

function DialogShell({
  hfxNumber,
  praxisName,
  personName,
  email,
  phone,
  ort,
  currentPhase,
  currentStatusLabel,
  data,
}: {
  hfxNumber: string;
  praxisName: string;
  personName: string;
  email?: string;
  phone?: string;
  ort?: string;
  currentPhase: KundenPhase;
  currentStatusLabel?: string;
  data: UseKundenDialogDataResult;
}) {
  return (
    <>
      <DialogHeader>
        <div className="space-y-2">
          <DialogTitle className="flex items-baseline gap-3 flex-wrap">
            <span className="font-mono text-primary text-base">{hfxNumber}</span>
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

      <div className="pt-2">
        <PhasenStufenleiste currentPhase={currentPhase} />
      </div>

      {currentStatusLabel && (
        <div className="flex justify-center">
          <span className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
            {currentStatusLabel}
          </span>
        </div>
      )}

      <Tabs defaultValue="stammdaten" className="mt-2">
        <TabsList className="w-full">
          <TabsTrigger value="stammdaten" className="flex-1">Stammdaten</TabsTrigger>
          <TabsTrigger value="vertrag" className="flex-1">Vertrag & Aktionen</TabsTrigger>
          <TabsTrigger value="verlauf" className="flex-1">Verlauf</TabsTrigger>
        </TabsList>

        <TabsContent value="stammdaten" className="mt-4">
          <StammdatenTab data={data} />
        </TabsContent>
        <TabsContent value="vertrag" className="mt-4">
          <VertragTab data={data} />
        </TabsContent>
        <TabsContent value="verlauf" className="mt-4">
          <TabPlaceholder
            label="Verlauf"
            hint="Inhalt folgt in Etappe 4 — chronologische customer_events-Liste."
          />
        </TabsContent>
      </Tabs>
    </>
  );
}

/* ----------------------------- Sub-Components ----------------------------- */

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
            <li key={phase} className="flex-1 flex flex-col items-center relative">
              {!isLast && (
                <div
                  className={cn(
                    "absolute top-3 left-1/2 w-full h-0.5",
                    idx < currentIdx ? "bg-primary" : "bg-border",
                  )}
                  aria-hidden
                />
              )}
              <div
                className={cn(
                  "relative z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors",
                  isActive && "border-primary bg-primary text-primary-foreground",
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

function TabPlaceholder({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-muted/30 p-8 text-center">
      <div className="text-sm font-medium text-foreground">{label}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
