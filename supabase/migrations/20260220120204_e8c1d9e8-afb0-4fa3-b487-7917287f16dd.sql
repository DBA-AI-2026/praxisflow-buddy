
-- 2. Create assignment table: which users belong to which regional leader
CREATE TABLE public.user_regional_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  regional_lead_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, regional_lead_id)
);

ALTER TABLE public.user_regional_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage regional assignments"
ON public.user_regional_assignments
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Regional leads can view own assignments"
ON public.user_regional_assignments
FOR SELECT
USING (regional_lead_id = auth.uid());

CREATE POLICY "Users can view own assignment"
ON public.user_regional_assignments
FOR SELECT
USING (user_id = auth.uid());

-- 3. Create demo_downloads table
CREATE TABLE public.demo_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hfx_customer_number text,
  company_name text NOT NULL,
  contact_name text,
  email text,
  telefon text,
  product_name text,
  download_date timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'testphase',
  test_phase_end date,
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.demo_downloads ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.auto_assign_demo_hfx_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.hfx_customer_number IS NULL OR NEW.hfx_customer_number = '' THEN
    NEW.hfx_customer_number := 'HFX-D' || LPAD(nextval('public.hfx_customer_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assign_demo_hfx_number
BEFORE INSERT ON public.demo_downloads
FOR EACH ROW
EXECUTE FUNCTION public.auto_assign_demo_hfx_number();

CREATE TRIGGER update_demo_downloads_updated_at
BEFORE UPDATE ON public.demo_downloads
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins and leads can manage demo downloads"
ON public.demo_downloads
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'sales_lead'::app_role) OR public.has_role(auth.uid(), 'regional_lead'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'sales_lead'::app_role) OR public.has_role(auth.uid(), 'regional_lead'::app_role));

CREATE POLICY "Sales partners can view demo downloads"
ON public.demo_downloads
FOR SELECT
USING (public.has_role(auth.uid(), 'sales_partner'::app_role));

CREATE POLICY "Sales partners can create demo downloads"
ON public.demo_downloads
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'sales_partner'::app_role) AND auth.uid() = created_by);

CREATE POLICY "Authenticated users can view demo downloads"
ON public.demo_downloads
FOR SELECT
USING (auth.uid() IS NOT NULL);
