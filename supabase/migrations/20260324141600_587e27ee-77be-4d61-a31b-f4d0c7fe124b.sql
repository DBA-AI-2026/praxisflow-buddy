-- Backfill customers from praxen table (practices with mp_nr not yet in customers)
INSERT INTO public.customers (
  hfx_customer_number,
  praxis_name,
  email,
  telefon,
  adresse,
  plz,
  ort,
  created_at,
  updated_at
)
SELECT
  p.mp_nr AS hfx_customer_number,
  p.name AS praxis_name,
  p.email,
  p.telefon,
  p.adresse,
  p.plz,
  p.ort,
  p.created_at,
  p.updated_at
FROM public.praxen p
WHERE
  p.mp_nr IS NOT NULL
  AND p.mp_nr <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.hfx_customer_number = p.mp_nr
  )
ON CONFLICT DO NOTHING;

-- Backfill customers from leads with hfx_customer_number
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
  created_at,
  updated_at
)
SELECT
  l.hfx_customer_number,
  l.praxis_name,
  l.vorname,
  l.nachname,
  l.email,
  l.mobilnummer,
  l.adresse,
  l.plz,
  l.ort,
  l.created_at,
  l.updated_at
FROM public.leads l
WHERE
  l.hfx_customer_number IS NOT NULL
  AND l.hfx_customer_number <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.customers c WHERE c.hfx_customer_number = l.hfx_customer_number
  )
ON CONFLICT DO NOTHING;

-- Update customer_id on contracts that have hfx_customer_number but no customer_id
UPDATE public.contracts co
SET customer_id = c.id
FROM public.customers c
WHERE co.hfx_customer_number = c.hfx_customer_number
  AND co.customer_id IS NULL
  AND co.hfx_customer_number IS NOT NULL;

-- Generate contract_number for contracts that have customer_id but no contract_number
UPDATE public.contracts co
SET contract_number = sub.new_number
FROM (
  SELECT
    id,
    customer_id || '-V' || LPAD(ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at)::text, 3, '0') AS new_number
  FROM public.contracts
  WHERE customer_id IS NOT NULL AND (contract_number IS NULL OR contract_number = '')
) sub
WHERE co.id = sub.id;