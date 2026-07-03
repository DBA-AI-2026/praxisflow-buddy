ALTER TABLE public.products
  ADD COLUMN cancellation_period_months integer NOT NULL DEFAULT 6;

COMMENT ON COLUMN public.products.cancellation_period_months IS
  'Ordentliche Kündigungsfrist in Monaten. 0 = monatlich kündbar zum Ende des laufenden Monats. Default 6 erhält bisheriges Erzeugungsverhalten für Nicht-GOÄ-Produkte; pro Produkt via Admin editierbar (SSOT).';

UPDATE public.products
   SET cancellation_period_months = 0
 WHERE name = 'HFX GOÄ - die KI für ihre Privatabrechnung';