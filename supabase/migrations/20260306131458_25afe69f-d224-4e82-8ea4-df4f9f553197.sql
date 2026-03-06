ALTER TABLE public.contracts 
  ADD COLUMN IF NOT EXISTS paper_contract_pdf_path text,
  ADD COLUMN IF NOT EXISTS customer_confirmation_token uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS customer_confirmed_at timestamptz;