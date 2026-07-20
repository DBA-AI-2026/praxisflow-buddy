DROP FUNCTION IF EXISTS public.get_public_contract_booking(uuid);

CREATE OR REPLACE FUNCTION public.get_public_contract_booking(p_contract_id uuid)
 RETURNS TABLE(id uuid, praxis text, customer_name text, product_name text, modules text[], monthly_price numeric, hfx_customer_number text, fachrichtung text, rechtsform text, status text, cancellation_period_months integer, duration_months integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    c.status,
    c.cancellation_period_months,
    c.duration_months
  FROM public.contracts c
  WHERE c.id = p_contract_id
    AND c.status = 'eingegangen';
$function$;