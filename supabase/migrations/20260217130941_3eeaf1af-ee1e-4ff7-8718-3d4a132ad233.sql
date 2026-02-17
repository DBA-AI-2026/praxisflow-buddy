
-- Table for product add-on modules (e.g. EBM Schnittstelle, TSVG-Modul, etc.)
CREATE TABLE public.product_modules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  monthly_price NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.product_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view product modules"
  ON public.product_modules FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Admins can insert product modules"
  ON public.product_modules FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update product modules"
  ON public.product_modules FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete product modules"
  ON public.product_modules FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_product_modules_updated_at
  BEFORE UPDATE ON public.product_modules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Also add licensing info columns to products table
ALTER TABLE public.products
  ADD COLUMN base_license_price NUMERIC DEFAULT NULL,
  ADD COLUMN base_license_includes TEXT DEFAULT NULL,
  ADD COLUMN extra_unit_price NUMERIC DEFAULT NULL,
  ADD COLUMN extra_unit_label TEXT DEFAULT NULL,
  ADD COLUMN licensing_notes TEXT DEFAULT NULL;
