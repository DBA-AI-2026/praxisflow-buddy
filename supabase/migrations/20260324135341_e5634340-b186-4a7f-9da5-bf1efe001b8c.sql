
-- ============================================================
-- 3-EBENEN-ARCHITEKTUR: customers + contract_cases
-- Fix: Drop old FK contracts.customer_id -> praxen, re-point to customers
-- ============================================================

-- 1. Drop old FK constraint (contracts.customer_id -> praxen)
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_customer_id_fkey;

-- 2. CUSTOMERS TABLE
CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hfx_customer_number text UNIQUE NOT NULL,
  praxis_name text,
  vorname text,
  nachname text,
  email text,
  telefon text,
  adresse text,
  plz text,
  ort text,
  mp_nr text,
  bsnr text,
  lanr text,
  salesforce_id text,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- 3. Re-add FK: contracts.customer_id -> customers.id
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_customer_id_fkey
  FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- 4. Add contract_number column
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_number text UNIQUE;

-- 5. CASE SEQUENCE + TABLE
CREATE SEQUENCE IF NOT EXISTS public.case_number_seq START WITH 1;

CREATE TABLE public.contract_cases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_number text UNIQUE NOT NULL DEFAULT '',
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  case_type text NOT NULL DEFAULT 'neuabschluss',
  status text NOT NULL DEFAULT 'offen',
  title text,
  notes text,
  created_by uuid,
  assigned_to uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE public.contract_cases ENABLE ROW LEVEL SECURITY;

-- 6. TRIGGER: auto_assign_contract_number
CREATE OR REPLACE FUNCTION public.auto_assign_contract_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  cust_num text;
  idx integer;
BEGIN
  IF NEW.contract_number IS NULL OR NEW.contract_number = '' THEN
    IF NEW.customer_id IS NOT NULL THEN
      SELECT hfx_customer_number INTO cust_num
        FROM public.customers WHERE id = NEW.customer_id;
      SELECT COUNT(*) + 1 INTO idx
        FROM public.contracts
        WHERE customer_id = NEW.customer_id;
      NEW.contract_number := cust_num || '-V' || LPAD(idx::text, 3, '0');
    ELSIF NEW.hfx_customer_number IS NOT NULL AND NEW.hfx_customer_number <> '' THEN
      SELECT COUNT(*) + 1 INTO idx
        FROM public.contracts
        WHERE hfx_customer_number = NEW.hfx_customer_number;
      NEW.contract_number := NEW.hfx_customer_number || '-V' || LPAD(idx::text, 3, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_contract_number
  BEFORE INSERT ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_contract_number();

-- 7. TRIGGER: auto_assign_case_number
CREATE OR REPLACE FUNCTION public.auto_assign_case_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    NEW.case_number := 'HFX-VG-' || to_char(now(), 'YYYY') || '-' || LPAD(nextval('public.case_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_assign_case_number
  BEFORE INSERT ON public.contract_cases
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_case_number();

-- 8. UPDATED_AT TRIGGERS
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contract_cases_updated_at
  BEFORE UPDATE ON public.contract_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. RLS POLICIES: customers
CREATE POLICY "Admins manage customers"
  ON public.customers FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sales leads view all customers"
  ON public.customers FOR SELECT
  USING (has_role(auth.uid(), 'sales_lead'::app_role) OR has_role(auth.uid(), 'vertragsabteilung'::app_role));

CREATE POLICY "Regional leads view team customers"
  ON public.customers FOR SELECT
  USING (
    has_role(auth.uid(), 'regional_lead'::app_role)
    AND id IN (
      SELECT cu.id FROM public.customers cu
      JOIN public.contracts co ON co.customer_id = cu.id
      WHERE is_in_regional_lead_team(auth.uid(), co.sales_partner_id)
         OR is_in_regional_lead_team(auth.uid(), co.created_by)
    )
  );

CREATE POLICY "Users view own customers"
  ON public.customers FOR SELECT
  USING (
    (has_role(auth.uid(), 'user'::app_role) OR has_role(auth.uid(), 'sales_partner'::app_role))
    AND id IN (
      SELECT customer_id FROM public.contracts
      WHERE (sales_partner_id = auth.uid() OR created_by = auth.uid())
        AND customer_id IS NOT NULL
    )
  );

CREATE POLICY "Tippgeber view referred customers"
  ON public.customers FOR SELECT
  USING (
    has_role(auth.uid(), 'tippgeber'::app_role)
    AND id IN (
      SELECT customer_id FROM public.contracts
      WHERE tippgeber_id = auth.uid()
        AND customer_id IS NOT NULL
    )
  );

-- 10. RLS POLICIES: contract_cases
CREATE POLICY "Admins manage contract_cases"
  ON public.contract_cases FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Sales leads view all contract_cases"
  ON public.contract_cases FOR SELECT
  USING (has_role(auth.uid(), 'sales_lead'::app_role) OR has_role(auth.uid(), 'vertragsabteilung'::app_role));

CREATE POLICY "Users view own contract_cases"
  ON public.contract_cases FOR SELECT
  USING (
    (has_role(auth.uid(), 'user'::app_role) OR has_role(auth.uid(), 'sales_partner'::app_role))
    AND contract_id IN (
      SELECT id FROM public.contracts
      WHERE sales_partner_id = auth.uid() OR created_by = auth.uid()
    )
  );

-- 11. MIGRATE EXISTING DATA: contracts -> customers
INSERT INTO public.customers (hfx_customer_number, praxis_name, vorname, nachname, email, telefon, adresse, plz, ort, mp_nr)
SELECT DISTINCT ON (hfx_customer_number)
  hfx_customer_number,
  COALESCE(praxis, customer_name),
  vorname,
  nachname,
  email,
  telefon,
  adresse,
  plz,
  ort,
  mp_nr
FROM public.contracts
WHERE hfx_customer_number IS NOT NULL
  AND hfx_customer_number <> ''
ORDER BY hfx_customer_number, created_at ASC;

-- FK: customer_id auf contracts setzen
UPDATE public.contracts c
SET customer_id = cu.id
FROM public.customers cu
WHERE cu.hfx_customer_number = c.hfx_customer_number
  AND c.customer_id IS NULL;

-- contract_number retroaktiv vergeben
WITH numbered AS (
  SELECT
    id,
    hfx_customer_number || '-V' || LPAD(
      ROW_NUMBER() OVER (PARTITION BY hfx_customer_number ORDER BY created_at ASC)::text,
      3, '0'
    ) AS new_contract_number
  FROM public.contracts
  WHERE hfx_customer_number IS NOT NULL
    AND hfx_customer_number <> ''
    AND contract_number IS NULL
)
UPDATE public.contracts c
SET contract_number = n.new_contract_number
FROM numbered n
WHERE c.id = n.id;

-- 12. INDEXES
CREATE INDEX IF NOT EXISTS idx_customers_hfx_number ON public.customers(hfx_customer_number);
CREATE INDEX IF NOT EXISTS idx_contracts_contract_number ON public.contracts(contract_number);
CREATE INDEX IF NOT EXISTS idx_contracts_customer_id_new ON public.contracts(customer_id);
CREATE INDEX IF NOT EXISTS idx_contract_cases_contract_id ON public.contract_cases(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_cases_customer_id ON public.contract_cases(customer_id);
