
-- Sequence for auto invoice numbering (RE-2026-XXXX)
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1;

-- Invoices table
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text NOT NULL UNIQUE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  customer_name text NOT NULL,
  customer_number text,
  rechnungs_email text,
  adresse text,
  plz text,
  ort text,
  
  -- Positions (JSONB array)
  positions jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Amounts
  net_amount numeric NOT NULL DEFAULT 0,
  tax_rate numeric NOT NULL DEFAULT 19,
  tax_amount numeric NOT NULL DEFAULT 0,
  gross_amount numeric NOT NULL DEFAULT 0,
  
  -- Dates
  invoice_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  
  -- Status: entwurf, versendet, bezahlt, storniert
  status text NOT NULL DEFAULT 'entwurf',
  
  -- Email send tracking
  email_sent_at timestamp with time zone,
  email_sent_by uuid,
  
  -- Lexware export
  exported_to_lexware boolean NOT NULL DEFAULT false,
  lexware_export_date timestamp with time zone,
  lexware_voucher_id text,
  
  -- Revenue link (after sending, synced to customer_revenues)
  revenue_id uuid REFERENCES public.customer_revenues(id) ON DELETE SET NULL,
  
  -- Meta
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Auto-generate invoice number: RE-YYYY-NNNN
CREATE OR REPLACE FUNCTION public.auto_assign_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL OR NEW.invoice_number = '' THEN
    NEW.invoice_number := 'RE-' || to_char(now(), 'YYYY') || '-' || LPAD(nextval('public.invoice_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trigger_auto_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.auto_assign_invoice_number();

-- Updated_at trigger
CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- Admin-only policies
CREATE POLICY "Admins can view all invoices"
  ON public.invoices FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update invoices"
  ON public.invoices FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete invoices"
  ON public.invoices FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
