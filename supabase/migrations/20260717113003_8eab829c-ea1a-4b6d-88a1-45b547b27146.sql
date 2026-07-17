-- Bestandskorrektur Kündigungsfrist GOÄ-Verträge (Phase #2).
-- Soll-Wert wird semantisch aus products abgeleitet (MAX über alle
-- modules), spiegelt getCancellationPeriodForProducts() aus Phase 1b.
-- Kein hartkodiertes SET 0: Mehrprodukt-Verträge (z.B. GOÄ+EBM) müssen
-- den höheren Wert behalten und dürfen nicht unter-fristet werden.
-- IS DISTINCT FROM → idempotent, Re-Run ändert 0 Zeilen.
-- AGB §13 delegiert die Frist an den Einzelvertrag; die bisherige 6 war
-- ein hartkodierter Erzeugungsfehler, keine zugesagte Kondition.
-- Änderung ist ausschließlich kundengünstig (kürzere Frist).
UPDATE public.contracts c
   SET cancellation_period_months = sub.soll
  FROM (
    SELECT c2.id,
           COALESCE((SELECT max(p.cancellation_period_months)
                       FROM public.products p
                      WHERE p.name = ANY(c2.modules)), 6) AS soll
      FROM public.contracts c2
     WHERE 'HFX GOÄ - die KI für ihre Privatabrechnung' = ANY(c2.modules)
  ) sub
 WHERE c.id = sub.id
   AND c.cancellation_period_months IS DISTINCT FROM sub.soll;