
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS praxis text,
  ADD COLUMN IF NOT EXISTS fachrichtung text,
  ADD COLUMN IF NOT EXISTS vorname text,
  ADD COLUMN IF NOT EXISTS nachname text,
  ADD COLUMN IF NOT EXISTS adresse text,
  ADD COLUMN IF NOT EXISTS telefon text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS signature_data text;
