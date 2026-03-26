
-- ============================================================
-- SECURITY FIX: Close direct anon SELECT on contracts base table
-- Replace with SECURITY DEFINER RPC function that returns only
-- safe, non-PII fields for the public booking flow.
-- ============================================================

-- 1. Drop the unsafe anon SELECT policy on the base table
DROP POLICY IF EXISTS "Anon booking view: safe fields only for eingegangen" ON public.contracts;

-- 2. Create a SECURITY DEFINER function that safely returns only the
--    minimal fields needed for the public booking page.
--    - Runs as the function owner (bypasses RLS), but explicitly
--      filters columns so no PII / tokens / sensitive data is returned.
--    - Restricted to contracts with status = 'eingegangen'.
--    - Returns NULL if not found (no information leakage about other IDs).
CREATE OR REPLACE FUNCTION public.get_public_contract_booking(p_contract_id uuid)
RETURNS TABLE (
  id              uuid,
  praxis          text,
  customer_name   text,
  product_name    text,
  modules         text[],
  monthly_price   numeric,
  hfx_customer_number text,
  fachrichtung    text,
  rechtsform      text,
  status          text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.praxis,
    c.customer_name,
    c.product_name,
    c.modules,
    c.monthly_price,
    c.hfx_customer_number,
    c.fachrichtung,
    c.rechtsform,
    c.status
  FROM public.contracts c
  WHERE c.id = p_contract_id
    AND c.status = 'eingegangen';
$$;

-- Grant EXECUTE to anon and authenticated roles
GRANT EXECUTE ON FUNCTION public.get_public_contract_booking(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_contract_booking(uuid) TO authenticated;
