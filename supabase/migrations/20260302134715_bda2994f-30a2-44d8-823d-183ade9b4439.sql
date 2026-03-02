CREATE TABLE public.accounting_costs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cost_date date NOT NULL DEFAULT CURRENT_DATE,
  supplier text NOT NULL,
  customer_name text NOT NULL,
  hfx_customer_number text,
  product_name text,
  category text NOT NULL DEFAULT 'Lizenzkosten',
  description text,
  net_amount numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 19,
  tax_amount numeric NOT NULL DEFAULT 0,
  gross_amount numeric NOT NULL DEFAULT 0,
  invoice_reference text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.accounting_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage accounting costs"
  ON public.accounting_costs
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_accounting_costs_updated_at
  BEFORE UPDATE ON public.accounting_costs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
