import { differenceInDays } from "date-fns";

/**
 * Bewusst enger als ACTIVE_LEAD_STATUSES (PraxenJourney.tsx): qualifiziert und
 * vertrag haben eigene Signale und gelten nie als überfällig. Kein
 * Synchronize-Paar — neue Status sind per Default NICHT überfällig-relevant.
 */
export const OVERDUE_LEAD_STATUSES = ["neu", "kontaktiert"] as const;

export type LeadOverdueTier = "critical" | "warning";

export interface LeadOverdueInput {
  status: string;
  created_at: string;
}

/**
 * SSOT für Lead-Überfälligkeit nach Verweildauer im System.
 * Grenzen: ≥14 Tage = critical, ≥7 Tage = warning.
 * Nur Status in OVERDUE_LEAD_STATUSES können überfällig werden.
 * Nie inline nachrechnen — alle Zählstellen konsumieren diese Funktion.
 */
export function leadOverdueTier(
  lead: LeadOverdueInput,
  now: Date = new Date(),
): LeadOverdueTier | null {
  if (!OVERDUE_LEAD_STATUSES.includes(lead.status as (typeof OVERDUE_LEAD_STATUSES)[number])) {
    return null;
  }
  const days = differenceInDays(now, new Date(lead.created_at));
  if (days >= 14) return "critical";
  if (days >= 7) return "warning";
  return null;
}
