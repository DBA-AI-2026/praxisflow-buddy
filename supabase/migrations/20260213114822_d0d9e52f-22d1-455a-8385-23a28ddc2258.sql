
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS rechtsform text,
  ADD COLUMN IF NOT EXISTS bsnr text,
  ADD COLUMN IF NOT EXISTS lanr text,
  ADD COLUMN IF NOT EXISTS weitere_bsnr text,
  ADD COLUMN IF NOT EXISTS weitere_lanr text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS kontoinhaber_strasse text,
  ADD COLUMN IF NOT EXISTS kontoinhaber_plz_ort text,
  ADD COLUMN IF NOT EXISTS ort text;
