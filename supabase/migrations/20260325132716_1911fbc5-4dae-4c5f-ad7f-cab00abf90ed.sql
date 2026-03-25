
-- ============================================================
-- Migration: Fix contract number race condition + format
-- ============================================================
-- 
-- Problem 1: auto_assign_contract_number() uses COUNT(*)+1 which
--   is NOT atomic. Under concurrent writes, two transactions can
--   read the same count before either commits → duplicate numbers.
--
-- Problem 2: Two formats exist:
--   - HFX-I{5digits}-V{3digits}  (from leads, correct new format)
--   - HFX-{6digits}-V{3digits}   (from direct customers, legacy)
--
-- Solution:
--   - Replace COUNT(*)+1 with a global atomic DB sequence for the V-part.
--   - Each contract_number is globally unique by construction.
--   - Customer prefix is preserved from hfx_customer_number.
--   - A UNIQUE constraint on contract_number prevents any bypass.
-- ============================================================

-- Step 1: Create a global sequence for the contract V-number
CREATE SEQUENCE IF NOT EXISTS public.contract_number_seq
  START WITH 1
  INCREMENT BY 1
  NO MINVALUE
  NO MAXVALUE
  CACHE 1;

-- Step 2: Replace the trigger function with atomic sequence-based generation
CREATE OR REPLACE FUNCTION public.auto_assign_contract_number()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path TO 'public'
AS $$
DECLARE
  cust_num text;
  seq_val  bigint;
BEGIN
  IF NEW.contract_number IS NOT NULL AND NEW.contract_number <> '' THEN
    RETURN NEW;
  END IF;

  cust_num := NEW.hfx_customer_number;

  IF (cust_num IS NULL OR cust_num = '') AND NEW.customer_id IS NOT NULL THEN
    SELECT hfx_customer_number INTO cust_num
      FROM public.customers
     WHERE id = NEW.customer_id;
  END IF;

  IF cust_num IS NULL OR cust_num = '' THEN
    RETURN NEW;
  END IF;

  seq_val := nextval('public.contract_number_seq');

  NEW.contract_number := cust_num || '-V' || LPAD(seq_val::text, 7, '0');

  RETURN NEW;
END;
$$;

-- Step 3: Add UNIQUE constraint if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contracts'
      AND constraint_type = 'UNIQUE'
      AND constraint_name = 'contracts_contract_number_key'
  ) THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_contract_number_key UNIQUE (contract_number);
  END IF;
END;
$$;

-- Step 4: Re-attach trigger to pick up new function
DROP TRIGGER IF EXISTS trigger_auto_assign_contract_number ON public.contracts;
CREATE TRIGGER trigger_auto_assign_contract_number
  BEFORE INSERT ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_contract_number();
