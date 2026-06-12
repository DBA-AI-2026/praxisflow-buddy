ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS iban_masked text;

COMMENT ON COLUMN public.contracts.iban_masked IS
  'Maskierte SEPA-IBAN aus Stripe (Format: DE** **** **** **** **XX XX). Wird vom stripe-webhook bei SEPA-Mandat-Erteilung automatisch befüllt. Vorrang vor contracts.iban beim PDF-Rendering. Volle IBAN ist über Stripe-API nicht verfügbar (PCI/SEPA-Regulation).';