
-- 1. Add assigned_to column to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS assigned_to uuid;

-- 2. Update leads RLS: Gebietsleiter can view leads assigned to them
DROP POLICY IF EXISTS "Gebietsleiter can view assigned leads" ON public.leads;
CREATE POLICY "Gebietsleiter can view assigned leads"
ON public.leads FOR SELECT
USING (
  has_role(auth.uid(), 'user'::app_role) AND assigned_to = auth.uid()
);

-- 3. Praxen: Gebietsleiter, regional_lead, vertragsabteilung can see praxen
DROP POLICY IF EXISTS "Gebietsleiter can view praxen" ON public.praxen;
CREATE POLICY "Gebietsleiter can view praxen"
ON public.praxen FOR SELECT
USING (
  has_role(auth.uid(), 'user'::app_role) OR
  has_role(auth.uid(), 'regional_lead'::app_role) OR
  has_role(auth.uid(), 'vertragsabteilung'::app_role)
);

-- 4. contracts: Gebietsleiter and regional_lead can view contracts
DROP POLICY IF EXISTS "Gebietsleiter can view contracts" ON public.contracts;
CREATE POLICY "Gebietsleiter can view contracts"
ON public.contracts FOR SELECT
USING (
  has_role(auth.uid(), 'user'::app_role) OR
  has_role(auth.uid(), 'regional_lead'::app_role)
);

-- 5. customer_revenues: include regional_lead in existing policy
DROP POLICY IF EXISTS "Admins and sales leads can view all revenues" ON public.customer_revenues;
CREATE POLICY "Admins and sales leads can view all revenues"
ON public.customer_revenues FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'sales_lead'::app_role) OR
  has_role(auth.uid(), 'regional_lead'::app_role) OR
  has_role(auth.uid(), 'user'::app_role) OR
  (auth.uid() = user_id)
);

-- 6. praxis_reservations: Gebietsleiter and regional_lead can view
DROP POLICY IF EXISTS "Gebietsleiter can view reservations" ON public.praxis_reservations;
CREATE POLICY "Gebietsleiter can view reservations"
ON public.praxis_reservations FOR SELECT
USING (
  has_role(auth.uid(), 'user'::app_role) OR
  has_role(auth.uid(), 'regional_lead'::app_role)
);

-- 7. demo_downloads: Gebietsleiter can view
DROP POLICY IF EXISTS "Gebietsleiter can view demo downloads" ON public.demo_downloads;
CREATE POLICY "Gebietsleiter can view demo downloads"
ON public.demo_downloads FOR SELECT
USING (has_role(auth.uid(), 'user'::app_role));
