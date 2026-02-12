
-- Create contracts table
CREATE TABLE public.contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_id UUID REFERENCES public.praxen(id) ON DELETE SET NULL,
  sales_partner_id UUID,
  sales_partner_name TEXT,
  
  -- Produkte & Module
  product_name TEXT NOT NULL,
  modules TEXT[] DEFAULT '{}',
  license_count INTEGER NOT NULL DEFAULT 1,
  
  -- Laufzeit & Kündigung
  start_date DATE NOT NULL,
  duration_months INTEGER NOT NULL DEFAULT 12,
  end_date DATE NOT NULL,
  cancellation_period_months INTEGER NOT NULL DEFAULT 3,
  auto_renewal BOOLEAN NOT NULL DEFAULT true,
  
  -- Preiskonditionen
  monthly_price NUMERIC NOT NULL DEFAULT 0,
  one_time_fee NUMERIC NOT NULL DEFAULT 0,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  payment_interval TEXT NOT NULL DEFAULT 'monatlich',
  
  -- Vertragsdokument
  document_url TEXT,
  document_name TEXT,
  
  -- Status: Entwurf → Aktiv → Gekündigt → Beendet
  status TEXT NOT NULL DEFAULT 'entwurf',
  
  -- Meta
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view contracts
CREATE POLICY "Authenticated users can view contracts"
ON public.contracts FOR SELECT
USING (auth.uid() IS NOT NULL);

-- All authenticated users can create contracts
CREATE POLICY "Authenticated users can create contracts"
ON public.contracts FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their own contracts, admins can update all
CREATE POLICY "Users can update own contracts or admin all"
ON public.contracts FOR UPDATE
USING (
  auth.uid() = created_by OR 
  public.has_role(auth.uid(), 'admin')
);

-- Only admins can delete contracts
CREATE POLICY "Admins can delete contracts"
ON public.contracts FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_contracts_updated_at
BEFORE UPDATE ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for contract documents
INSERT INTO storage.buckets (id, name, public) VALUES ('contracts', 'contracts', false);

-- Storage policies
CREATE POLICY "Authenticated users can upload contracts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'contracts' AND auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view contracts docs"
ON storage.objects FOR SELECT
USING (bucket_id = 'contracts' AND auth.uid() IS NOT NULL);

CREATE POLICY "Admins can delete contract docs"
ON storage.objects FOR DELETE
USING (bucket_id = 'contracts' AND public.has_role(auth.uid(), 'admin'));
