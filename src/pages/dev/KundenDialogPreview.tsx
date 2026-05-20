/**
 * KundenDialogPreview — temporäre Admin-only Preview-Seite (Etappe 2a).
 *
 * Zweck: visuelle Verifikation des KundenDialog-Grundgerüsts mit Demo-Props
 * für jede der 5 Phasen.
 *
 * TODO Etappe 6: Diese Route + Datei wieder entfernen (samt App.tsx-Eintrag).
 */

import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import {
  KundenDialog,
  type KundenDialogProps,
  type KundenPhase,
} from "@/components/kunden/KundenDialog";

type DemoCase = {
  label: string;
  props: Omit<KundenDialogProps, "open" | "onClose">;
};

const BASE = {
  hfxNumber: "HFX-I01101",
  praxisName: "Orthopädie und Unfallchirurgie Waiblingen",
  personName: "Dr. Andreas Hegelmaier",
  email: "hegelmaier@ortho-wn.de",
  phone: "01712027274",
  ort: "Waiblingen",
};

const DEMOS: DemoCase[] = [
  {
    label: "Lead-Phase",
    props: {
      ...BASE,
      currentPhase: "lead" as KundenPhase,
      currentStatusLabel: "Neu — Vertriebler hat noch nicht reagiert.",
    },
  },
  {
    label: "Qualifiziert-Phase",
    props: {
      ...BASE,
      currentPhase: "qualifiziert" as KundenPhase,
      currentStatusLabel:
        "Qualifiziert — bereit für Vertragsanlage.",
    },
  },
  {
    label: "Vertrag-Phase",
    props: {
      ...BASE,
      currentPhase: "vertrag" as KundenPhase,
      currentStatusLabel:
        "Eingegangen — wartet auf Mandat-Erteilung durch den Kunden.",
    },
  },
  {
    label: "Aktiv-Phase",
    props: {
      ...BASE,
      currentPhase: "aktiv" as KundenPhase,
      currentStatusLabel: "Aktiv — Abrechnung läuft.",
    },
  },
  {
    label: "Service-Phase",
    props: {
      ...BASE,
      currentPhase: "service" as KundenPhase,
      currentStatusLabel: "Service — laufende Betreuung.",
    },
  },
  {
    label: "Ohne Status-Label",
    props: {
      ...BASE,
      currentPhase: "vertrag" as KundenPhase,
    },
  },
];

export default function KundenDialogPreview() {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  return (
    <MainLayout
      title="KundenDialog — Preview (Etappe 2a)"
      subtitle="Temporäre Verifikations-Seite. Wird in Etappe 6 wieder entfernt."
    >
      <div className="space-y-6">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Klicke einen Button, um den Dialog mit den entsprechenden Demo-Props
          zu öffnen. Diese Seite ist nicht in der Sidebar verlinkt und nur
          direkt über <code>/dev/kunden-dialog-preview</code> erreichbar.
        </div>

        <div className="flex flex-wrap gap-2">
          {DEMOS.map((demo, idx) => (
            <Button
              key={demo.label}
              variant="outline"
              onClick={() => setActiveIdx(idx)}
            >
              {demo.label}
            </Button>
          ))}
        </div>

        {activeIdx !== null && (
          <KundenDialog
            open={activeIdx !== null}
            onClose={() => setActiveIdx(null)}
            {...DEMOS[activeIdx].props}
          />
        )}
      </div>
    </MainLayout>
  );
}
