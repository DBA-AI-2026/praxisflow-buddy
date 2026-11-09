-- Rollback: DROP FUNCTION IF EXISTS public.get_invoices_readonly();
CREATE OR REPLACE FUNCTION public.get_invoices_readonly()
RETURNS TABLE (
  id uuid, invoice_number text, customer_name text, customer_number text,
  adresse text, plz text, ort text, positions jsonb,
  net_amount numeric, tax_rate numeric, tax_amount numeric, gross_amount numeric,
  invoice_date date, due_date date, billing_period_month text, status text,
  email_sent_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'sales_lead') OR public.has_role(auth.uid(), 'admin')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT i.id, i.invoice_number, i.customer_name, i.customer_number,
         i.adresse, i.plz, i.ort, i.positions,
         i.net_amount, i.tax_rate, i.tax_amount, i.gross_amount,
         i.invoice_date, i.due_date, i.billing_period_month, i.status,
         i.email_sent_at
  FROM public.invoices i
  ORDER BY i.invoice_date DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoices_readonly() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_invoices_readonly() TO authenticated;