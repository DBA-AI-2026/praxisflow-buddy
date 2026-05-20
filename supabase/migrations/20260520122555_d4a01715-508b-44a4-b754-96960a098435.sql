-- =========================================================================
-- 1. Spalte abrechnungszentrum auf customers
-- =========================================================================
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS abrechnungszentrum text NOT NULL DEFAULT 'nein';

-- Backfill aus leads via hfx_customer_number (nur wo Lead existiert)
UPDATE public.customers c
   SET abrechnungszentrum = COALESCE(l.abrechnungszentrum, 'nein')
  FROM public.leads l
 WHERE l.hfx_customer_number = c.hfx_customer_number
   AND c.abrechnungszentrum = 'nein';

-- =========================================================================
-- 2. leads UPDATE-Policies erweitern
-- =========================================================================

-- Regionalleiter darf Team-Leads bearbeiten
DROP POLICY IF EXISTS "Regional leads update team leads" ON public.leads;
CREATE POLICY "Regional leads update team leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND assigned_to IS NOT NULL
  AND is_in_regional_lead_team(auth.uid(), assigned_to)
)
WITH CHECK (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND assigned_to IS NOT NULL
  AND is_in_regional_lead_team(auth.uid(), assigned_to)
);

-- Außendienst (user) und Vertriebspartner dürfen ihre zugewiesenen Leads bearbeiten
DROP POLICY IF EXISTS "Assigned users update their leads" ON public.leads;
CREATE POLICY "Assigned users update their leads"
ON public.leads
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'user'::app_role) OR has_role(auth.uid(), 'sales_partner'::app_role))
  AND assigned_to = auth.uid()
)
WITH CHECK (
  (has_role(auth.uid(), 'user'::app_role) OR has_role(auth.uid(), 'sales_partner'::app_role))
  AND assigned_to = auth.uid()
);

-- =========================================================================
-- 3. customers UPDATE-Policies erweitern
-- =========================================================================

-- Vertriebsleitung + Vertragsabteilung dürfen alle Kunden bearbeiten
DROP POLICY IF EXISTS "Sales leads update all customers" ON public.customers;
CREATE POLICY "Sales leads update all customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'sales_lead'::app_role)
  OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
);

-- Regionalleiter dürfen Team-Kunden bearbeiten
DROP POLICY IF EXISTS "Regional leads update team customers" ON public.customers;
CREATE POLICY "Regional leads update team customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND id IN (
    SELECT co.customer_id
      FROM public.contracts co
     WHERE co.customer_id IS NOT NULL
       AND (
         is_in_regional_lead_team(auth.uid(), co.sales_partner_id)
         OR is_in_regional_lead_team(auth.uid(), co.created_by)
       )
  )
)
WITH CHECK (
  has_role(auth.uid(), 'regional_lead'::app_role)
  AND id IN (
    SELECT co.customer_id
      FROM public.contracts co
     WHERE co.customer_id IS NOT NULL
       AND (
         is_in_regional_lead_team(auth.uid(), co.sales_partner_id)
         OR is_in_regional_lead_team(auth.uid(), co.created_by)
       )
  )
);

-- Außendienst + Vertriebspartner dürfen ihre eigenen Kunden bearbeiten
DROP POLICY IF EXISTS "Assigned users update own customers" ON public.customers;
CREATE POLICY "Assigned users update own customers"
ON public.customers
FOR UPDATE
TO authenticated
USING (
  (has_role(auth.uid(), 'user'::app_role) OR has_role(auth.uid(), 'sales_partner'::app_role))
  AND id IN (
    SELECT co.customer_id
      FROM public.contracts co
     WHERE co.customer_id IS NOT NULL
       AND (co.sales_partner_id = auth.uid() OR co.created_by = auth.uid())
  )
)
WITH CHECK (
  (has_role(auth.uid(), 'user'::app_role) OR has_role(auth.uid(), 'sales_partner'::app_role))
  AND id IN (
    SELECT co.customer_id
      FROM public.contracts co
     WHERE co.customer_id IS NOT NULL
       AND (co.sales_partner_id = auth.uid() OR co.created_by = auth.uid())
  )
);