
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

COMMENT ON COLUMN public.contracts.stripe_subscription_id IS 'Stripe Subscription ID – wird bei Vertragsaktivierung automatisch erstellt';
COMMENT ON COLUMN public.contracts.stripe_customer_id IS 'Stripe Customer ID des Kunden';
