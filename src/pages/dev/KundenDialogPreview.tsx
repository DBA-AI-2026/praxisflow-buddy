/**
 * KundenDialogPreview — temporäre Admin-only Preview-Seite (Etappe 2a + 2b-i).
 *
 * Zweck:
 *  - Etappe 2a: visuelle Verifikation des Grundgerüsts via Demo-Props.
 *  - Etappe 2b-i: Live-Lookup über HFX-Nummer + Debug-Anzeige von SSOT/canEdit.
 *
 * TODO Etappe 6: Diese Route + Datei wieder entfernen (samt App.tsx-Eintrag).
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import {
  KundenDialog,
  type KundenDialogProps,
  type KundenPhase,
} from "@/components/kunden/KundenDialog";
import { useKundenDialogData } from "@/hooks/useKundenDialogData";

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
    props: { ...BASE, currentPhase: "lead", currentStatusLabel: "Neu — Vertriebler hat noch nicht reagiert." },
  },
  {
    label: "Qualifiziert-Phase",
    props: { ...BASE, currentPhase: "qualifiziert", currentStatusLabel: "Qualifiziert — bereit für Vertragsanlage." },
  },
  {
    label: "Vertrag-Phase",
    props: { ...BASE, currentPhase: "vertrag", currentStatusLabel: "Eingegangen — wartet auf Mandat." },
  },
  {
    label: "Aktiv-Phase",
    props: { ...BASE, currentPhase: "aktiv", currentStatusLabel: "Aktiv — Abrechnung läuft." },
  },
  {
    label: "Service-Phase",
    props: { ...BASE, currentPhase: "service", currentStatusLabel: "Service — laufende Betreuung." },
  },
];

const PHASE_OPTIONS: KundenPhase[] = ["lead", "qualifiziert", "vertrag", "aktiv", "service"];

export default function KundenDialogPreview() {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [hfxInput, setHfxInput] = useState("");
  const [livePhase, setLivePhase] = useState<KundenPhase>("vertrag");
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveHfx, setLiveHfx] = useState<string | null>(null);

  // Header-Daten für Live-Dialog aus DB ziehen (lead-fallback → customer)
  const headerQ = useQuery({
    queryKey: ["preview-header", liveHfx],
    enabled: !!liveHfx,
    queryFn: async () => {
      const [{ data: lead }, { data: customer }] = await Promise.all([
        supabase
          .from("leads")
          .select("praxis_name,vorname,nachname,email,mobilnummer,ort")
          .eq("hfx_customer_number", liveHfx!)
          .maybeSingle(),
        supabase
          .from("customers")
          .select("praxis_name,vorname,nachname,email,telefon,ort")
          .eq("hfx_customer_number", liveHfx!)
          .maybeSingle(),
      ]);
      const c = customer ?? null;
      const l = lead ?? null;
      return {
        praxisName: c?.praxis_name ?? l?.praxis_name ?? "(unbekannt)",
        personName: `${c?.vorname ?? l?.vorname ?? ""} ${c?.nachname ?? l?.nachname ?? ""}`.trim() || "(unbekannt)",
        email: c?.email ?? l?.email ?? undefined,
        phone: c?.telefon ?? l?.mobilnummer ?? undefined,
        ort: c?.ort ?? l?.ort ?? undefined,
      };
    },
  });

  return (
    <MainLayout
      title="KundenDialog — Preview (Etappe 2b-i)"
      subtitle="Temporäre Verifikations-Seite. Wird in Etappe 6 wieder entfernt."
    >
      <div className="space-y-8">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Nur über <code>/dev/kunden-dialog-preview</code> erreichbar.
        </div>

        {/* Live-Lookup */}
        <section className="rounded-lg border p-4 space-y-4">
          <div className="font-medium">Live-Lookup (echte HFX-Nummer)</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label htmlFor="hfx">HFX-Nummer</Label>
              <Input
                id="hfx"
                value={hfxInput}
                onChange={(e) => setHfxInput(e.target.value.trim())}
                placeholder="HFX-I01101"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="phase">Phase</Label>
              <select
                id="phase"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={livePhase}
                onChange={(e) => setLivePhase(e.target.value as KundenPhase)}
              >
                {PHASE_OPTIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                onClick={() => {
                  setLiveHfx(hfxInput || null);
                  setLiveOpen(!!hfxInput);
                }}
                disabled={!hfxInput}
              >
                Live-Dialog öffnen
              </Button>
            </div>
          </div>

          {liveHfx && <DebugPanel hfxNumber={liveHfx} phase={livePhase} />}
        </section>

        {/* Demo-Buttons */}
        <section className="space-y-3">
          <div className="font-medium">Demo-Varianten (statische Props)</div>
          <div className="flex flex-wrap gap-2">
            {DEMOS.map((demo, idx) => (
              <Button key={demo.label} variant="outline" onClick={() => setActiveIdx(idx)}>
                {demo.label}
              </Button>
            ))}
          </div>
        </section>

        {activeIdx !== null && (
          <KundenDialog
            open={activeIdx !== null}
            onClose={() => setActiveIdx(null)}
            {...DEMOS[activeIdx].props}
          />
        )}

        {liveOpen && liveHfx && headerQ.data && (
          <KundenDialog
            open={liveOpen}
            onClose={() => setLiveOpen(false)}
            hfxNumber={liveHfx}
            praxisName={headerQ.data.praxisName}
            personName={headerQ.data.personName}
            email={headerQ.data.email}
            phone={headerQ.data.phone}
            ort={headerQ.data.ort}
            currentPhase={livePhase}
          />
        )}
      </div>
    </MainLayout>
  );
}

/* Debug-Anzeige: zeigt SSOT, Lead-/Customer-Existenz und canEdit-Status */
function DebugPanel({ hfxNumber, phase }: { hfxNumber: string; phase: KundenPhase }) {
  const data = useKundenDialogData(hfxNumber, phase, true);
  return (
    <div className="rounded-md bg-muted/40 p-3 text-xs font-mono space-y-1">
      <div>isLoading: {String(data.isLoading)}</div>
      <div>ssot: {data.ssot}</div>
      <div>lead: {data.lead ? `id=${data.lead.id.slice(0, 8)}… assigned_to=${data.lead.assigned_to ?? "—"}` : "—"}</div>
      <div>customer: {data.customer ? `id=${data.customer.id.slice(0, 8)}…` : "—"}</div>
      <div>contracts: {data.contracts.length}</div>
      <div>
        canEditStammdaten:{" "}
        <span className={data.canEditStammdaten ? "text-green-700" : "text-red-700"}>
          {String(data.canEditStammdaten)}
        </span>
      </div>
      {data.canEditReason && <div>reason: {data.canEditReason}</div>}
    </div>
  );
}
