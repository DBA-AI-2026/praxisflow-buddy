
-- Create usage_charges table for Qodia billing data
CREATE TABLE public.usage_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hfx_customer_number text NOT NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  period_from date NOT NULL,
  period_to date NOT NULL,
  unit_description text NOT NULL DEFAULT 'Abgerechnete Qodia-Vorgänge',
  quantity integer NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'qodia',
  received_at timestamptz NOT NULL DEFAULT now(),
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  notes text
);
ALTER TABLE public.usage_charges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage usage_charges" ON public.usage_charges
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Sales leads can view usage_charges" ON public.usage_charges
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'sales_lead'::app_role) OR has_role(auth.uid(), 'regional_lead'::app_role));

-- Create commission_payouts table
CREATE TABLE public.commission_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_partner_id uuid NOT NULL,
  sales_partner_name text NOT NULL,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  commission_type text NOT NULL DEFAULT 'prozent',
  commission_rate numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  period_month text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approved_by uuid,
  approved_at timestamptz,
  paid_at timestamptz,
  exported_at timestamptz,
  pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.commission_payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage commission_payouts" ON public.commission_payouts
  FOR ALL TO public
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Sales leads can view commission_payouts" ON public.commission_payouts
  FOR SELECT TO public
  USING (has_role(auth.uid(), 'sales_lead'::app_role) OR has_role(auth.uid(), 'regional_lead'::app_role));
CREATE POLICY "Sales partners can view own payouts" ON public.commission_payouts
  FOR SELECT TO public
  USING (sales_partner_id = auth.uid());

-- Add mandate_accepted_at and qodia_unit_price to contracts
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS mandate_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS qodia_unit_price numeric NOT NULL DEFAULT 0;
