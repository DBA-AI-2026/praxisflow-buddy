-- Create products table for admin-managed product catalog
CREATE TABLE public.products (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  monthly_price numeric NOT NULL DEFAULT 0,
  one_time_fee numeric NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  description text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read products
CREATE POLICY "Authenticated users can view products"
ON public.products FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only admins can manage products
CREATE POLICY "Admins can insert products"
ON public.products FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update products"
ON public.products FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete products"
ON public.products FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed with existing HFX products
INSERT INTO public.products (name, monthly_price) VALUES
  ('HFX GOÄ', 0),
  ('HFX EBM', 0),
  ('HFX Benchmark KZV', 0),
  ('HFX Doku', 0),
  ('HFX Wingmann', 0),
  ('HFX GOÄ Live-Check', 0),
  ('HFX GOZ Live-Check', 0),
  ('HFX Praxismanagement Zahnmedizin', 0);