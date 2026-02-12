
ALTER TABLE public.contracts
  ADD COLUMN iban text,
  ADD COLUMN bic text,
  ADD COLUMN kontoinhaber text;
