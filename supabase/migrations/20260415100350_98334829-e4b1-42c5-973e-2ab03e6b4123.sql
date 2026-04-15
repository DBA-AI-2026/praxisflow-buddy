UPDATE public.usage_charges
SET status = 'invoiced',
    notes = 'Automatisch abgerufen für März 2026 – 0,00 € (nicht abrechnungsrelevant, nachträglich bereinigt)'
WHERE hfx_customer_number = 'HFX-I01030'
  AND period_from = DATE '2026-03-01'
  AND period_to = DATE '2026-03-31'
  AND quantity > 0
  AND unit_price = 0
  AND net_amount = 0
  AND status = 'pending';