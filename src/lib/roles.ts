/**
 * Zentrale Rollen-Utilities (UI-Anzeige).
 *
 * ROLE_PRIORITY spiegelt die Anzeige-/Privilegien-Priorität, die auch in
 * useUserRole/useAuditLog verwendet wird — höchste Rolle zuerst. Für rein
 * fachliche Motor-Prioritäten (z. B. Signup-Bonus-Zuständigkeit in
 * Provisionen.tsx) NICHT verwenden — die haben absichtlich eine eigene
 * Ordnung und werden nicht mit dieser UI-Priorität verschmolzen.
 */
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];

/** Höchste Rolle zuerst. */
export const ROLE_PRIORITY: readonly AppRole[] = [
  "admin",
  "sales_lead",
  "regional_lead",
  "vertragsabteilung",
  "sales_partner",
  "user",
  "tippgeber",
] as const;

/** Menschlich lesbare Labels für Rollen-Badges. */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Administrator",
  sales_lead: "Vertriebsleitung",
  regional_lead: "Regionalleiter",
  vertragsabteilung: "Vertragsabteilung",
  sales_partner: "Vertriebspartner",
  user: "Gebietsleiter",
  tippgeber: "Tippgeber",
};

/**
 * Wählt die "primäre" Rolle einer Person nach ROLE_PRIORITY.
 * Unbekannte Rollen werden ans Ende gestellt. Gibt null zurück, wenn
 * die Liste leer ist.
 */
export function pickPrimaryRole<T extends string>(roles: readonly T[]): T | null {
  if (!roles || roles.length === 0) return null;
  for (const r of ROLE_PRIORITY) {
    if ((roles as readonly string[]).includes(r)) return r as T;
  }
  // Fallback: erste unbekannte Rolle
  return roles[0] ?? null;
}

/**
 * Sortiert Rollen nach ROLE_PRIORITY (höchste zuerst). Unbekannte
 * Rollen landen stabil am Ende.
 */
export function sortRolesByPriority<T extends string>(roles: readonly T[]): T[] {
  const idx = (r: string) => {
    const i = (ROLE_PRIORITY as readonly string[]).indexOf(r);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...roles].sort((a, b) => idx(a) - idx(b));
}

/**
 * Aggregiert Rollen-Zeilen zu einem Record<user_id, roles[]> — mit
 * dedupliziertem, priorisiert sortiertem Array je Person.
 *
 * Nutzt keine `is_active`-Filterung; das muss die Query selbst tun
 * (oder vorab filtern), damit die Ergebnismenge deterministisch ist.
 */
export function groupRolesByUser<T extends string>(
  rows: ReadonlyArray<{ user_id: string; role: T }>,
): Record<string, T[]> {
  const acc: Record<string, T[]> = {};
  for (const r of rows ?? []) {
    if (!r?.user_id || !r?.role) continue;
    const list = (acc[r.user_id] ??= []);
    if (!list.includes(r.role)) list.push(r.role);
  }
  for (const uid of Object.keys(acc)) {
    acc[uid] = sortRolesByPriority(acc[uid]);
  }
  return acc;
}
