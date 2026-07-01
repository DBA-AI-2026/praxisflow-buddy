INSERT INTO public.free_quota_grants (hfx_customer_number, grant_type, menge, quelle, created_by)
SELECT DISTINCT l.hfx_customer_number, 'trial', 200, 'backfill_trial_2026-07', NULL::uuid
FROM public.leads l
WHERE l.qodia_synced = true
  AND l.hfx_customer_number IS NOT NULL
  AND NOT (l.hfx_customer_number ~* '^HFX-[A-Z0-9]+-\d{2}$')
  AND l.hfx_customer_number NOT LIKE 'HFX-I01070%'
  AND l.hfx_customer_number NOT IN ('HFX-I01101', 'HFX-I01030')
  AND NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.customer_number = l.hfx_customer_number
      AND i.status <> 'storniert'
      AND i.gross_amount > 0
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.free_quota_grants g
    WHERE g.hfx_customer_number = l.hfx_customer_number
      AND g.grant_type = 'trial'
  )
ON CONFLICT DO NOTHING;