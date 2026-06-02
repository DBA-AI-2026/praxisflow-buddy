/**
 * Zentrales Status-Mapping für Verträge und Leads.
 *
 * Bisher dupliziert in Vertraege.tsx und LeadDetailDialog.tsx — jetzt SSOT,
 * damit VertragTab / LeadStatusPill dieselben Labels/Icons benutzen können.
 */
import type { LucideIcon } from "lucide-react";
import {
  FilePen,
  Upload,
  FileSignature,
  CircleCheck,
  CircleOff,
  ArchiveX,
  ShieldBan,
} from "lucide-react";

export type ContractStatus =
  | "entwurf"
  | "eingegangen"
  | "gezeichnet"
  | "aktiv"
  | "gekuendigt"
  | "beendet"
  | "gesperrt";

export const CONTRACT_STATUS_ORDER: ContractStatus[] = [
  "entwurf",
  "eingegangen",
  "gezeichnet",
  "aktiv",
  "gekuendigt",
  "beendet",
  "gesperrt",
];

export const CONTRACT_STATUS_CONFIG: Record<
  ContractStatus,
  { label: string; class: string; icon: LucideIcon }
> = {
  entwurf:     { label: "Entwurf",     class: "bg-muted text-muted-foreground",   icon: FilePen },
  eingegangen: { label: "Versendet, wartet auf Mandat", class: "bg-warning/10 text-warning", icon: Upload },
  gezeichnet:  { label: "Gebucht",     class: "bg-primary/10 text-primary",       icon: FileSignature },
  aktiv:       { label: "Aktiv",       class: "bg-success/10 text-success",       icon: CircleCheck },
  gekuendigt:  { label: "Gekündigt",   class: "bg-warning/10 text-warning",       icon: CircleOff },
  beendet:     { label: "Beendet",     class: "bg-destructive/10 text-destructive", icon: ArchiveX },
  gesperrt:    { label: "Gesperrt",    class: "bg-destructive/20 text-destructive", icon: ShieldBan },
};

export type LeadStatus =
  | "neu"
  | "kontaktiert"
  | "qualifiziert"
  | "vertrag"
  | "kein_abschluss"
  | "abgelehnt"
  | "kunde";

/**
 * Reihenfolge der Statuswerte, die der User im UI wechseln darf.
 * `kunde` wird systemseitig durch Vertragsabschluss gesetzt und ist
 * daher kein User-Aktionsziel (siehe LeadDetailDialog Z. 477 Filter).
 */
export const LEAD_STATUS_ORDER: LeadStatus[] = [
  "neu",
  "kontaktiert",
  "qualifiziert",
  "vertrag",
  "kein_abschluss",
  "abgelehnt",
];

export const LEAD_STATUS_CONFIG: Record<
  LeadStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  neu:            { label: "Neu",                 variant: "default" },
  kontaktiert:    { label: "Kontaktiert",         variant: "secondary" },
  qualifiziert:   { label: "Qualifiziert",        variant: "outline" },
  vertrag:        { label: "In Vertragserstellung", variant: "outline" },
  kein_abschluss: { label: "Kein Abschluss",      variant: "destructive" },
  abgelehnt:      { label: "Abgelehnt",           variant: "destructive" },
  kunde:          { label: "Kunde",               variant: "default" },
};
