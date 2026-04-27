import type { Database } from "@/integrations/supabase/types";

export type Reservation = Database["public"]["Tables"]["praxis_reservations"]["Row"];

export type ReservationStatus =
  | "reserviert"
  | "in_bearbeitung"
  | "konvertiert"
  | "abgelaufen"
  | "freigegeben";

export const RESERVATION_STATUS_VALUES: ReservationStatus[] = [
  "reserviert",
  "in_bearbeitung",
  "konvertiert",
  "abgelaufen",
  "freigegeben",
];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  reserviert: "Reserviert",
  in_bearbeitung: "In Bearbeitung",
  konvertiert: "Konvertiert",
  abgelaufen: "Abgelaufen",
  freigegeben: "Freigegeben",
};

export function getEffectiveStatus(reservation: Reservation): ReservationStatus {
  const raw = (reservation.status ?? "reserviert") as ReservationStatus;
  if (raw === "reserviert" && new Date(reservation.reserved_until) < new Date()) {
    return "abgelaufen";
  }
  return raw;
}

export function getDaysLeft(reservedUntil: string): number {
  const end = new Date(reservedUntil).getTime();
  return Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
}
