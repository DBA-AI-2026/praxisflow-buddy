// SYNCHRONIZE: identischer Wert in supabase/functions/auto-invoice/index.ts
// (Konstante PLAUSIBILITAET_SCHWELLE). Wird der Wert hier geändert, muss er
// dort mitgeändert werden — und umgekehrt.
//
// Feste Mengen-Schwelle pro Abrechnungsmonat, ab der die automatische
// Fakturierung angehalten wird. Der zusätzliche 5×-Durchschnitt-Teil der
// Bremse existiert NUR im Motor (auto-invoice) und wird bewusst nicht im
// Dashboard nachgebildet.
export const PLAUSIBILITAET_SCHWELLE = 500;
