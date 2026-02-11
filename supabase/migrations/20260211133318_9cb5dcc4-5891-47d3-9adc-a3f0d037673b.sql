
-- Table for commission rates per product (admin-managed)
CREATE TABLE public.product_commissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_name TEXT NOT NULL UNIQUE,
  commission_type TEXT NOT NULL DEFAULT 'prozent' CHECK (commission_type IN ('prozent', 'festbetrag', 'monatlich')),
  commission_value NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_commissions ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read commission rates
CREATE POLICY "Authenticated users can view commissions"
ON public.product_commissions
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can manage commission rates
CREATE POLICY "Admins can insert commissions"
ON public.product_commissions
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update commissions"
ON public.product_commissions
FOR UPDATE
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete commissions"
ON public.product_commissions
FOR DELETE
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at
CREATE TRIGGER update_product_commissions_updated_at
BEFORE UPDATE ON public.product_commissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with default HFX products
INSERT INTO public.product_commissions (product_name, commission_type, commission_value, description) VALUES
  ('HFX GOÄ', 'prozent', 10, 'Provision für HFX GOÄ Abschlüsse'),
  ('HFX GOZ Live-Check', 'prozent', 8, 'Provision für HFX GOZ Live-Check'),
  ('HFX EBM', 'prozent', 10, 'Provision für HFX EBM Abschlüsse'),
  ('HFX Doku', 'festbetrag', 150, 'Festbetrag pro HFX Doku Abschluss');
