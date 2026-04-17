-- ============================================================
-- Phase 1: Generic Provider Status Architecture
-- ============================================================

-- 1. Enums for provider status fields
DO $$ BEGIN
  CREATE TYPE public.provider_sync_status AS ENUM (
    'not_started', 'transferred', 'error', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_registration_status AS ENUM (
    'not_registered', 'invited', 'registered', 'active'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.provider_usage_status AS ENUM (
    'no_usage', 'first_usage', 'active', 'inactive'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Extend products with provider_flags (jsonb for multi-provider per product)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS provider_flags jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.products.provider_flags IS
  'Structured provider flags per product, e.g. {"qodia": true, "honorarplus": false}. Drives whether provider-status columns are shown for contracts of this product.';

-- 3. Generic contract_provider_status table
CREATE TABLE IF NOT EXISTS public.contract_provider_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_customer_id text,

  sync_status public.provider_sync_status NOT NULL DEFAULT 'not_started',
  registration_status public.provider_registration_status NOT NULL DEFAULT 'not_registered',
  usage_status public.provider_usage_status NOT NULL DEFAULT 'no_usage',

  submitted_invoice_count_total integer NOT NULL DEFAULT 0,
  submitted_invoice_count_current_month integer NOT NULL DEFAULT 0,

  first_usage_at timestamptz,
  last_usage_at timestamptz,

  last_sync_at timestamptz,
  sync_error_message text,

  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT contract_provider_status_unique UNIQUE (contract_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_cps_contract_id ON public.contract_provider_status(contract_id);
CREATE INDEX IF NOT EXISTS idx_cps_provider ON public.contract_provider_status(provider);
CREATE INDEX IF NOT EXISTS idx_cps_usage_status ON public.contract_provider_status(usage_status);
CREATE INDEX IF NOT EXISTS idx_cps_last_usage_at ON public.contract_provider_status(last_usage_at);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_cps_updated_at ON public.contract_provider_status;
CREATE TRIGGER trg_cps_updated_at
  BEFORE UPDATE ON public.contract_provider_status
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. RLS – mirror contracts visibility
ALTER TABLE public.contract_provider_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage cps" ON public.contract_provider_status;
CREATE POLICY "Admins manage cps"
  ON public.contract_provider_status
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Sales leads view cps" ON public.contract_provider_status;
CREATE POLICY "Sales leads view cps"
  ON public.contract_provider_status
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'sales_lead')
    OR public.has_role(auth.uid(), 'vertragsabteilung')
  );

DROP POLICY IF EXISTS "Owners view cps" ON public.contract_provider_status;
CREATE POLICY "Owners view cps"
  ON public.contract_provider_status
  FOR SELECT
  USING (
    contract_id IN (
      SELECT c.id FROM public.contracts c
      WHERE c.sales_partner_id = auth.uid() OR c.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Regional leads view team cps" ON public.contract_provider_status;
CREATE POLICY "Regional leads view team cps"
  ON public.contract_provider_status
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'regional_lead')
    AND contract_id IN (
      SELECT c.id FROM public.contracts c
      WHERE public.is_in_regional_lead_team(auth.uid(), c.sales_partner_id)
         OR public.is_in_regional_lead_team(auth.uid(), c.created_by)
    )
  );

-- 5. Helper: does a contract's product use a given provider?
CREATE OR REPLACE FUNCTION public.contract_uses_provider(_contract_id uuid, _provider text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (p.provider_flags ->> _provider)::boolean
      FROM public.contracts c
      JOIN public.products p ON p.name = c.product_name
      WHERE c.id = _contract_id
      LIMIT 1
    ),
    false
  );
$$;

-- 6. Aggregation function: recompute usage from usage_charges (internal source of truth for usage)
CREATE OR REPLACE FUNCTION public.recompute_contract_provider_usage(
  _contract_id uuid,
  _provider text DEFAULT 'qodia'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total int := 0;
  v_month int := 0;
  v_first timestamptz;
  v_last  timestamptz;
  v_usage_status public.provider_usage_status;
  v_month_start date := date_trunc('month', now())::date;
BEGIN
  -- Aggregate from usage_charges. Only rows with quantity > 0 count as real submissions.
  SELECT
    COALESCE(SUM(quantity), 0),
    COALESCE(SUM(quantity) FILTER (WHERE period_from >= v_month_start), 0),
    MIN(period_from)::timestamptz,
    MAX(period_to)::timestamptz
    INTO v_total, v_month, v_first, v_last
  FROM public.usage_charges uc
  WHERE uc.contract_id = _contract_id
    AND uc.quantity > 0;

  -- Derive usage_status
  IF v_total = 0 THEN
    v_usage_status := 'no_usage';
  ELSIF v_last IS NOT NULL AND v_last < (now() - interval '30 days') THEN
    v_usage_status := 'inactive';
  ELSIF v_total <= 1 THEN
    v_usage_status := 'first_usage';
  ELSE
    v_usage_status := 'active';
  END IF;

  -- Upsert
  INSERT INTO public.contract_provider_status AS cps (
    contract_id, provider,
    submitted_invoice_count_total,
    submitted_invoice_count_current_month,
    first_usage_at, last_usage_at,
    usage_status
  ) VALUES (
    _contract_id, _provider,
    v_total, v_month, v_first, v_last, v_usage_status
  )
  ON CONFLICT (contract_id, provider) DO UPDATE SET
    submitted_invoice_count_total = EXCLUDED.submitted_invoice_count_total,
    submitted_invoice_count_current_month = EXCLUDED.submitted_invoice_count_current_month,
    first_usage_at = EXCLUDED.first_usage_at,
    last_usage_at  = EXCLUDED.last_usage_at,
    usage_status   = EXCLUDED.usage_status,
    updated_at = now();
END;
$$;

-- 7. Trigger: when usage_charges change, recompute affected contract's qodia status
CREATE OR REPLACE FUNCTION public.trg_usage_charges_recompute_qodia()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cid uuid;
BEGIN
  v_cid := COALESCE(NEW.contract_id, OLD.contract_id);
  IF v_cid IS NOT NULL THEN
    PERFORM public.recompute_contract_provider_usage(v_cid, 'qodia');
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_usage_charges_qodia_aiu ON public.usage_charges;
CREATE TRIGGER trg_usage_charges_qodia_aiu
  AFTER INSERT OR UPDATE OR DELETE ON public.usage_charges
  FOR EACH ROW EXECUTE FUNCTION public.trg_usage_charges_recompute_qodia();

-- 8. Initial backfill: mark HFX GOÄ products as Qodia-enabled (one-time data step,
-- afterwards uses_qodia is managed via products.provider_flags).
UPDATE public.products
   SET provider_flags = jsonb_set(provider_flags, '{qodia}', 'true'::jsonb, true)
 WHERE name ILIKE 'HFX GOÄ%';

-- 9. Backfill provider status rows for existing contracts of qodia-enabled products
INSERT INTO public.contract_provider_status (contract_id, provider, sync_status)
SELECT c.id, 'qodia', 'not_started'
  FROM public.contracts c
  JOIN public.products p ON p.name = c.product_name
 WHERE COALESCE((p.provider_flags ->> 'qodia')::boolean, false) = true
ON CONFLICT (contract_id, provider) DO NOTHING;

-- 10. Backfill usage aggregates for those contracts
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT contract_id FROM public.contract_provider_status WHERE provider = 'qodia'
  LOOP
    PERFORM public.recompute_contract_provider_usage(r.contract_id, 'qodia');
  END LOOP;
END $$;