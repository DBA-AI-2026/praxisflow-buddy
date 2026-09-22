CREATE POLICY "Sales partners can view own referred leads"
ON public.leads
FOR SELECT
USING (has_role(auth.uid(), 'sales_partner'::app_role) AND (vermittler_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_leads_vermittler_id ON public.leads (vermittler_id);