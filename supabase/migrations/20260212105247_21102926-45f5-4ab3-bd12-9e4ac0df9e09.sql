-- Add mp_nr and hfx_customer_number columns to contracts
ALTER TABLE public.contracts 
ADD COLUMN mp_nr text,
ADD COLUMN hfx_customer_number text;

-- Create a sequence for auto-generating HFX customer numbers
CREATE SEQUENCE IF NOT EXISTS public.hfx_customer_number_seq START 1000;

-- Create a trigger function to auto-assign HFX customer number on insert
CREATE OR REPLACE FUNCTION public.auto_assign_hfx_customer_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.hfx_customer_number IS NULL OR NEW.hfx_customer_number = '' THEN
    NEW.hfx_customer_number := 'HFX-' || LPAD(nextval('public.hfx_customer_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_hfx_customer_number
BEFORE INSERT ON public.contracts
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_hfx_customer_number();