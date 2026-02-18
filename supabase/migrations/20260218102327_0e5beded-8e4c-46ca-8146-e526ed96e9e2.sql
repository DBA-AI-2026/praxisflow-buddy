
ALTER TABLE public.contracts
  ADD COLUMN approved_by uuid NULL,
  ADD COLUMN approved_at timestamp with time zone NULL;
