/**
 * KundenDialogPreview — temporäre Admin-only Preview-Seite (Etappe 2b-ii).
 *
 * Zweck:
 *  - Etappe 2a: visuelle Verifikation des Grundgerüsts via statische Demos.
 *  - Etappe 2b-i: Live-Lookup über HFX-Nummer + Debug-Anzeige.
 *  - Etappe 2b-ii: Hook-Modus (Union-Input, derivedPhase, Header aus Hook).
 *
 * TODO Etappe 6: Diese Route + Datei wieder entfernen (samt App.tsx-Eintrag).
 */

import { useEffect, useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabaseClient";
import {
  KundenDialog,
  type KundenPhase,
} from "@/components/kunden/KundenDialog";
import { useKundenDialogData } from "@/hooks/useKundenDialogData";

type DemoCase = {
  label: string;
  phase: KundenPhase;
  statusLabel: string;
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
  { label: "Lead-Phase", phase: "lead", statusLabel: "Neu — Vertriebler hat noch nicht reagiert." },
  { label: "Qualifiziert-Phase", phase: "qualifiziert", statusLabel: "Qualifiziert — bereit für Vertragsanlage." },
  { label: "Vertrag-Phase", phase: "vertrag", statusLabel: "Versendet, wartet auf Mandat." },
  { label: "Aktiv-Phase", phase: "aktiv", statusLabel: "Aktiv — Abrechnung läuft." },
  { label: "Service-Phase", phase: "service", statusLabel: "Service — laufende Betreuung." },
];

const PHASE_OPTIONS: KundenPhase[] = ["lead", "qualifiziert", "vertrag", "aktiv", "service"];

interface SearchResult {
  hfx_customer_number: string;
  praxis_name: string;
  vorname: string | null;
  nachname: string | null;
  source: "lead" | "customer";
}

export default function KundenDialogPreview() {
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [hfxInput, setHfxInput] = useState("");
  const [livePhase, setLivePhase] = useState<KundenPhase>("vertrag");
  const [liveOpen, setLiveOpen] = useState(false);
  const [liveHfx, setLiveHfx] = useState<string | null>(null);
  const [nameSearch, setNameSearch] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Debounced Name-/Praxis-Suche über leads + customers
  useEffect(() => {
    if (nameSearch.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const handler = setTimeout(async () => {
      setIsSearching(true);
      const q = nameSearch.trim().replace(/[%,]/g, "");
      const filter = `praxis_name.ilike.%${q}%,nachname.ilike.%${q}%,vorname.ilike.%${q}%,email.ilike.%${q}%`;

      const [leadsRes, customersRes] = await Promise.all([
        supabase
          .from("leads")
          .select("hfx_customer_number, praxis_name, vorname, nachname")
          .or(filter)
          .not("hfx_customer_number", "is", null)
          .limit(10),
        supabase
          .from("customers")
          .select("hfx_customer_number, praxis_name, vorname, nachname")
          .or(filter)
          .limit(10),
      ]);

      const merged = new Map<string, SearchResult>();
      (leadsRes.data ?? []).forEach((l: any) => {
        if (l.hfx_customer_number) {
          merged.set(l.hfx_customer_number, {
            hfx_customer_number: l.hfx_customer_number,
            praxis_name: l.praxis_name ?? "(unbekannt)",
            vorname: l.vorname,
            nachname: l.nachname,
            source: "lead",
          });
        }
      });
      (customersRes.data ?? []).forEach((c: any) => {
        if (c.hfx_customer_number) {
          merged.set(c.hfx_customer_number, {
            hfx_customer_number: c.hfx_customer_number,
            praxis_name: c.praxis_name ?? "(unbekannt)",
            vorname: c.vorname,
            nachname: c.nachname,
            source: "customer",
          });
        }
      });

      setSearchResults(Array.from(merged.values()).slice(0, 10));
      setIsSearching(false);
    }, 300);

    return () => clearTimeout(handler);
  }, [nameSearch]);

  return (
    <MainLayout
      title="KundenDialog — Preview (Etappe 2b-ii)"
      subtitle="Temporäre Verifikations-Seite. Wird in Etappe 6 wieder entfernt."
    >
      <div className="space-y-8">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          Nur über <code>/dev/kunden-dialog-preview</code> erreichbar.
        </div>

        {/* Name-/Praxis-Suche */}
        <section className="rounded-lg border p-4 space-y-3">
          <div className="font-medium">Suche per Name oder Praxis</div>
          <Input
            placeholder="z.B. 'Hegelmaier' oder 'Orthopädie Waiblingen'"
            value={nameSearch}
            onChange={(e) => setNameSearch(e.target.value)}
          />
          {searchResults.length > 0 && (
            <div className="border rounded-md divide-y max-h-72 overflow-y-auto">
              {searchResults.map((r) => (
                <button
                  key={r.hfx_customer_number}
                  onClick={() => {
                    setHfxInput(r.hfx_customer_number);
                    setNameSearch("");
                    setSearchResults([]);
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-muted/40 text-sm space-y-0.5"
                >
                  <div className="font-medium">{r.praxis_name}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.vorname} {r.nachname}
                    <span className="ml-2 font-mono">{r.hfx_customer_number}</span>
                    <span className="ml-2 text-muted-foreground/70">
                      {r.source === "lead" ? "Lead" : "Customer"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
          {nameSearch.trim().length >= 2 && searchResults.length === 0 && !isSearching && (
            <div className="text-xs text-muted-foreground">Keine Treffer.</div>
          )}
          {isSearching && <div className="text-xs text-muted-foreground">Suche…</div>}
        </section>

        {/* Live-Lookup (Hook-Mode) */}
        <section className="rounded-lg border p-4 space-y-4">
          <div className="font-medium">Live-Lookup (Hook-Mode, echte HFX-Nummer)</div>
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
              <Label htmlFor="phase">Phase-Override (optional)</Label>
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

        {/* Demo-Buttons (Static-Mode) */}
        <section className="space-y-3">
          <div className="font-medium">Demo-Varianten (Static-Mode, forced phase)</div>
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
            hfxNumber={BASE.hfxNumber}
            praxisName={BASE.praxisName}
            personName={BASE.personName}
            email={BASE.email}
            phone={BASE.phone}
            ort={BASE.ort}
            currentPhase={DEMOS[activeIdx].phase}
            currentStatusLabel={DEMOS[activeIdx].statusLabel}
          />
        )}

        {liveOpen && liveHfx && (
          <KundenDialog
            open={liveOpen}
            onClose={() => setLiveOpen(false)}
            input={{ type: "hfx", hfxNumber: liveHfx, forcePhase: livePhase }}
          />
        )}
      </div>
    </MainLayout>
  );
}

/* Debug-Anzeige: zeigt SSOT, derivedPhase, Header und canEdit-Status */
function DebugPanel({ hfxNumber, phase }: { hfxNumber: string; phase: KundenPhase }) {
  const data = useKundenDialogData(
    { type: "hfx", hfxNumber, forcePhase: phase },
    true,
  );
  return (
    <div className="rounded-md bg-muted/40 p-3 text-xs font-mono space-y-1">
      <div>isLoading: {String(data.isLoading)}</div>
      <div>hfxNumber: {data.hfxNumber ?? "—"}</div>
      <div>ssot: {data.ssot}</div>
      <div>derivedPhase: {data.derivedPhase}</div>
      <div>statusLabel: {data.currentStatusLabel ?? "—"}</div>
      <div>header.person: {data.header?.personName ?? "—"}</div>
      <div>header.praxis: {data.header?.praxisName ?? "—"}</div>
      <div>lead: {data.lead ? `id=${data.lead.id.slice(0, 8)}… status=${data.lead.status ?? "—"} assigned_to=${data.lead.assigned_to ?? "—"}` : "—"}</div>
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
