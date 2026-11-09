import type { ComponentType } from "react";
import { FileText, Send, CheckCircle2, XCircle } from "lucide-react";

/** Gemeinsame Status-Labels/-Farben für Rechnungen (Rechnungen.tsx, RechnungsUebersicht.tsx). */
export const INVOICE_STATUS_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: ComponentType<any> }
> = {
  entwurf: { label: "Entwurf", variant: "outline", icon: FileText },
  versendet: { label: "Versendet", variant: "secondary", icon: Send },
  bezahlt: { label: "Bezahlt", variant: "default", icon: CheckCircle2 },
  zahlung_fehlgeschlagen: { label: "Zahlung fehlgeschlagen", variant: "destructive", icon: XCircle },
  storniert: { label: "Storniert", variant: "destructive", icon: XCircle },
};
