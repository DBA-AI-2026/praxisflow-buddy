
-- ══════════════════════════════════════════════════════════════════
-- C4 Fix 1: Idempotency guard for contract_cases (Neuabschluss)
-- Prevent duplicate 'neuabschluss' cases on Stripe webhook retries
-- via a unique partial index.
-- ══════════════════════════════════════════════════════════════════
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_cases_neuabschluss_unique
  ON public.contract_cases (contract_id)
  WHERE case_type = 'neuabschluss';

-- ══════════════════════════════════════════════════════════════════
-- C4 Fix 2: Backfill customers for existing active digital contracts
-- Creates a customers record for every active/eingegangen contract
-- that was NOT created via paper flow (paper_contract_pdf_path IS NULL)
-- and has no customer_id yet. Uses ON CONFLICT DO NOTHING so it is
-- safe to re-run.
-- ══════════════════════════════════════════════════════════════════
INSERT INTO public.customers (
  hfx_customer_number,
  praxis_name,
  vorname,
  nachname,
  email,
  telefon,
  adresse,
  plz,
  ort,
  bsnr,
  lanr,
  mp_nr
)
SELECT DISTINCT ON (c.hfx_customer_number)
  c.hfx_customer_number,
  COALESCE(c.praxis, c.customer_name),
  c.vorname,
  c.nachname,
  c.email,
  c.telefon,
  c.adresse,
  c.plz,
  c.ort,
  c.bsnr,
  c.lanr,
  c.mp_nr
FROM public.contracts c
WHERE c.status IN ('aktiv', 'eingegangen')
  AND c.paper_contract_pdf_path IS NULL
  AND c.hfx_customer_number IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.customers cu
    WHERE cu.hfx_customer_number = c.hfx_customer_number
  )
ORDER BY c.hfx_customer_number, c.created_at ASC;

-- ── Link contracts.customer_id to the newly created customers ──────────────
UPDATE public.contracts co
SET customer_id = cu.id
FROM public.customers cu
WHERE cu.hfx_customer_number = co.hfx_customer_number
  AND co.customer_id IS NULL
  AND co.status IN ('aktiv', 'eingegangen')
  AND co.paper_contract_pdf_path IS NULL;

-- ══════════════════════════════════════════════════════════════════
-- C4 Fix 3: Backfill missing neuabschluss contract_cases for
-- already-active digital contracts that were activated before the
-- C4 fix was deployed.
-- ON CONFLICT DO NOTHING because the unique index above prevents dupes.
-- ══════════════════════════════════════════════════════════════════
INSERT INTO public.contract_cases (
  contract_id,
  customer_id,
  case_type,
  status,
  title,
  notes
)
SELECT
  c.id,
  c.customer_id,
  'neuabschluss',
  'abgeschlossen',
  'Neuabschluss – ' || c.product_name,
  '[Backfill] Automatisch nachgezogen – Vertrag war vor C4-Fix aktiv'
FROM public.contracts c
WHERE c.status = 'aktiv'
  AND c.paper_contract_pdf_path IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.contract_cases cc
    WHERE cc.contract_id = c.id
      AND cc.case_type = 'neuabschluss'
  )
ON CONFLICT DO NOTHING;
