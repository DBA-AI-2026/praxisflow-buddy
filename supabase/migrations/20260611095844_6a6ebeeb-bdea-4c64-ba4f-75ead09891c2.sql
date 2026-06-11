ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS generated_password text,
  ADD COLUMN IF NOT EXISTS qodia_synced boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS qodia_conflict boolean NOT NULL DEFAULT false;