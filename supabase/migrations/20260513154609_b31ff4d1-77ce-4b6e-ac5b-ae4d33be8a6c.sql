ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS retry_attempted_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.invoices.retry_attempted_at IS
  'Set when auto-invoice has attempted exactly one Stripe-charge retry for a previously failed invoice. NULL means no retry attempted yet.';

CREATE INDEX IF NOT EXISTS idx_invoices_retry_candidates
  ON public.invoices (email_sent_at)
  WHERE status = 'zahlung_fehlgeschlagen'
    AND stripe_invoice_id IS NULL
    AND retry_attempted_at IS NULL;