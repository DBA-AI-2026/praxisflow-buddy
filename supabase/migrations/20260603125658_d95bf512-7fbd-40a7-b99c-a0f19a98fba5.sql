-- Multi-Standort (Hauptaccount/Subaccount) Fundament
-- Ergänzt customers um zwei kanonische Felder:
--  - stripe_customer_id: geteilte Stripe-Customer-ID des Hauptaccounts (SEPA-Mandat lebt hier)
--  - base_fee_contract_id: Zeiger auf den Träger-Vertrag, der die Grundgebühr und den AD-Signup-Bonus auslöst

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS base_fee_contract_id uuid;

-- FK auf contracts (SET NULL bei Löschung des Trägers, damit Self-Heal beim nächsten Aktivieren greifen kann)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_base_fee_contract_id_fkey'
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_base_fee_contract_id_fkey
      FOREIGN KEY (base_fee_contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_base_fee_contract_id
  ON public.customers(base_fee_contract_id);

CREATE INDEX IF NOT EXISTS idx_customers_stripe_customer_id
  ON public.customers(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- Backfill stripe_customer_id: erstes non-NULL aus Verträgen des Kunden
UPDATE public.customers c
   SET stripe_customer_id = sub.scid
  FROM (
    SELECT DISTINCT ON (customer_id) customer_id, stripe_customer_id AS scid
    FROM public.contracts
    WHERE customer_id IS NOT NULL
      AND stripe_customer_id IS NOT NULL
    ORDER BY customer_id, created_at ASC
  ) sub
 WHERE c.id = sub.customer_id
   AND c.stripe_customer_id IS NULL;

-- Backfill base_fee_contract_id: erster GOÄ-Vertrag pro Kunde
UPDATE public.customers c
   SET base_fee_contract_id = sub.cid
  FROM (
    SELECT DISTINCT ON (customer_id) customer_id, id AS cid
    FROM public.contracts
    WHERE customer_id IS NOT NULL
      AND product_name ~* 'GOÄ|GOA'
    ORDER BY customer_id, created_at ASC
  ) sub
 WHERE c.id = sub.customer_id
   AND c.base_fee_contract_id IS NULL;