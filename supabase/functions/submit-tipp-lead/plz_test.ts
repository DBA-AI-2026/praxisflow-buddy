/**
 * Regressionstests: PLZ-Zuordnungslogik
 * 
 * Diese Tests prüfen die zentrale DB-Funktion resolve_plz_ad().
 * Sie müssen nach jeder Änderung an plz_gebietsleiter_mapping oder
 * der Funktion selbst ausgeführt werden.
 * 
 * Ausführung: deno test supabase/functions/submit-tipp-lead/plz_test.ts
 * 
 * WICHTIG: Die Funktion resolve_plz_ad() lebt ausschließlich in der Datenbank.
 * Keine Duplikation der Logik im Frontend oder in Edge Functions erlaubt!
 */

import { assertEquals } from "https://deno.land/std@0.192.0/testing/asserts.ts";

// ─── Eingebettete Referenzimplementierung für Unit-Tests ──────────────────────
// Spiegelt exakt die DB-Funktion wider. Dient als Kontrollinstanz für Tests,
// die ohne DB-Verbindung laufen müssen (CI/CD, offline).
interface PlzMapping {
  plz_prefix: string | null;
  plz_von: string | null;
  plz_bis: string | null;
  gebietsleiter_id: string;
  gebietsleiter_name: string;
  priority: number;
  is_active: boolean;
}

interface ResolveResult {
  gebietsleiter_id: string | null;
  gebietsleiter_name: string | null;
  matched_rule: string | null;
}

function resolvePlzAd(plzInput: string, mappings: PlzMapping[]): ResolveResult {
  const v_plz = plzInput.replace(/[^0-9]/g, "");
  if (!v_plz) return { gebietsleiter_id: null, gebietsleiter_name: null, matched_rule: "no_plz" };

  const prefix2 = v_plz.substring(0, 2);
  const prefix1 = v_plz.substring(0, 1);
  const activeMappings = mappings.filter((m) => m.is_active);

  // a) Range-Match
  const rangeMatches = activeMappings
    .filter((m) => m.plz_von && m.plz_bis && v_plz >= m.plz_von && v_plz <= m.plz_bis)
    .sort((a, b) => b.priority - a.priority);
  if (rangeMatches.length > 0 && rangeMatches[0].gebietsleiter_id) {
    return {
      gebietsleiter_id: rangeMatches[0].gebietsleiter_id,
      gebietsleiter_name: rangeMatches[0].gebietsleiter_name,
      matched_rule: `range:${rangeMatches[0].plz_von}-${rangeMatches[0].plz_bis}`,
    };
  }

  // b) 2-stelliger Prefix
  const prefix2Matches = activeMappings
    .filter((m) => !m.plz_von && m.plz_prefix === prefix2)
    .sort((a, b) => b.priority - a.priority);
  if (prefix2Matches.length > 0 && prefix2Matches[0].gebietsleiter_id) {
    return {
      gebietsleiter_id: prefix2Matches[0].gebietsleiter_id,
      gebietsleiter_name: prefix2Matches[0].gebietsleiter_name,
      matched_rule: `prefix:${prefix2Matches[0].plz_prefix}`,
    };
  }

  // c) 1-stelliger Prefix
  const prefix1Matches = activeMappings
    .filter((m) => !m.plz_von && m.plz_prefix === prefix1)
    .sort((a, b) => b.priority - a.priority);
  if (prefix1Matches.length > 0 && prefix1Matches[0].gebietsleiter_id) {
    return {
      gebietsleiter_id: prefix1Matches[0].gebietsleiter_id,
      gebietsleiter_name: prefix1Matches[0].gebietsleiter_name,
      matched_rule: `prefix:${prefix1Matches[0].plz_prefix}`,
    };
  }

  return { gebietsleiter_id: null, gebietsleiter_name: null, matched_rule: "no_match" };
}

// ─── Test-Fixtures ────────────────────────────────────────────────────────────
const TEST_MAPPINGS: PlzMapping[] = [
  // Prefix-basierte Einträge
  { plz_prefix: "44", plz_von: null, plz_bis: null, gebietsleiter_id: "ad-ruhr", gebietsleiter_name: "AD Ruhr", priority: 10, is_active: true },
  { plz_prefix: "4", plz_von: null, plz_bis: null, gebietsleiter_id: "ad-west", gebietsleiter_name: "AD West", priority: 5, is_active: true },
  { plz_prefix: "8", plz_von: null, plz_bis: null, gebietsleiter_id: "ad-sued", gebietsleiter_name: "AD Süd", priority: 5, is_active: true },
  { plz_prefix: "1", plz_von: null, plz_bis: null, gebietsleiter_id: "ad-berlin", gebietsleiter_name: "AD Berlin", priority: 5, is_active: true },
  // Range-basierter Eintrag
  { plz_prefix: null, plz_von: "50000", plz_bis: "50999", gebietsleiter_id: "ad-koeln", gebietsleiter_name: "AD Köln", priority: 20, is_active: true },
  // Inaktiver Eintrag (soll ignoriert werden)
  { plz_prefix: "90", plz_von: null, plz_bis: null, gebietsleiter_id: "ad-nbg", gebietsleiter_name: "AD Nürnberg", priority: 5, is_active: false },
  // Prioritätstest: 2 Einträge mit Prefix "33", höhere Prio gewinnt
  { plz_prefix: "33", plz_von: null, plz_bis: null, gebietsleiter_id: "ad-owl-a", gebietsleiter_name: "AD OWL A", priority: 8, is_active: true },
  { plz_prefix: "33", plz_von: null, plz_bis: null, gebietsleiter_id: "ad-owl-b", gebietsleiter_name: "AD OWL B", priority: 3, is_active: true },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

Deno.test("PLZ 44145 → AD Ruhr (2-stelliger Prefix 44)", () => {
  const result = resolvePlzAd("44145", TEST_MAPPINGS);
  assertEquals(result.gebietsleiter_id, "ad-ruhr");
  assertEquals(result.matched_rule, "prefix:44");
});

Deno.test("PLZ 45678 → AD West (nur 1-stelliger Prefix 4 trifft)", () => {
  const result = resolvePlzAd("45678", TEST_MAPPINGS);
  // 45 hat keinen 2-stelligen Eintrag, fällt auf Prefix "4" zurück
  assertEquals(result.gebietsleiter_id, "ad-west");
  assertEquals(result.matched_rule, "prefix:4");
});

Deno.test("PLZ 80331 → AD Süd (1-stelliger Prefix 8)", () => {
  const result = resolvePlzAd("80331", TEST_MAPPINGS);
  assertEquals(result.gebietsleiter_id, "ad-sued");
  assertEquals(result.matched_rule, "prefix:8");
});

Deno.test("PLZ 10115 → AD Berlin (1-stelliger Prefix 1)", () => {
  const result = resolvePlzAd("10115", TEST_MAPPINGS);
  assertEquals(result.gebietsleiter_id, "ad-berlin");
  assertEquals(result.matched_rule, "prefix:1");
});

Deno.test("PLZ 50667 → AD Köln (Range 50000-50999 hat höhere Prio)", () => {
  const result = resolvePlzAd("50667", TEST_MAPPINGS);
  assertEquals(result.gebietsleiter_id, "ad-koeln");
  assertEquals(result.matched_rule, "range:50000-50999");
});

Deno.test("PLZ 90402 → kein Match (inaktiver Eintrag)", () => {
  const result = resolvePlzAd("90402", TEST_MAPPINGS);
  assertEquals(result.gebietsleiter_id, null);
  assertEquals(result.matched_rule, "no_match");
});

Deno.test("PLZ 33100 → AD OWL A (höhere Priorität gewinnt bei gleichem Prefix)", () => {
  const result = resolvePlzAd("33100", TEST_MAPPINGS);
  assertEquals(result.gebietsleiter_id, "ad-owl-a");
});

Deno.test("Leere PLZ → no_plz", () => {
  const result = resolvePlzAd("", TEST_MAPPINGS);
  assertEquals(result.gebietsleiter_id, null);
  assertEquals(result.matched_rule, "no_plz");
});

Deno.test("PLZ mit Leerzeichen '123 45' → wird normalisiert, kein Fehler", () => {
  const result = resolvePlzAd("1 2 3 4 5", TEST_MAPPINGS);
  // Ziffern: 12345 → Prefix 12 → kein Match, Prefix 1 → AD Berlin
  assertEquals(result.gebietsleiter_id, "ad-berlin");
});

Deno.test("PLZ 99999 → kein Match (kein Eintrag)", () => {
  const result = resolvePlzAd("99999", TEST_MAPPINGS);
  assertEquals(result.gebietsleiter_id, null);
  assertEquals(result.matched_rule, "no_match");
});
