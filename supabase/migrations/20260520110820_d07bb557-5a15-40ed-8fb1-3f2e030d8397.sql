CREATE TABLE public.customer_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type text NOT NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('lead', 'contract')),
  entity_id uuid NOT NULL,
  hfx_customer_number text,
  lead_id uuid,
  contract_id uuid,
  event_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_events_lead_id ON public.customer_events(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX idx_customer_events_contract_id ON public.customer_events(contract_id) WHERE contract_id IS NOT NULL;
CREATE INDEX idx_customer_events_hfx ON public.customer_events(hfx_customer_number) WHERE hfx_customer_number IS NOT NULL;
CREATE INDEX idx_customer_events_created_at ON public.customer_events(created_at DESC);
CREATE INDEX idx_customer_events_entity ON public.customer_events(entity_type, entity_id);

ALTER TABLE public.customer_events ENABLE ROW LEVEL SECURITY;

-- INSERT: any authenticated user (server-side logic controls correctness)
CREATE POLICY "Authenticated can insert customer_events"
  ON public.customer_events FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Admins & sales_lead & vertragsabteilung: see all
CREATE POLICY "Admins and sales_lead view all customer_events"
  ON public.customer_events FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role)
    OR has_role(auth.uid(), 'vertragsabteilung'::app_role)
  );

-- Regional leads: events tied to contracts within their team
CREATE POLICY "Regional leads view team customer_events"
  ON public.customer_events FOR SELECT
  USING (
    has_role(auth.uid(), 'regional_lead'::app_role)
    AND (
      (contract_id IS NOT NULL AND contract_id IN (
        SELECT c.id FROM contracts c
        WHERE is_in_regional_lead_team(auth.uid(), c.sales_partner_id)
           OR is_in_regional_lead_team(auth.uid(), c.created_by)
      ))
      OR
      (lead_id IS NOT NULL AND lead_id IN (
        SELECT l.id FROM leads l
        WHERE l.assigned_to IS NOT NULL AND is_in_regional_lead_team(auth.uid(), l.assigned_to)
      ))
    )
  );

-- Users & sales_partners: events for own contracts or assigned leads
CREATE POLICY "Users view own customer_events"
  ON public.customer_events FOR SELECT
  USING (
    (has_role(auth.uid(), 'user'::app_role) OR has_role(auth.uid(), 'sales_partner'::app_role))
    AND (
      (contract_id IS NOT NULL AND contract_id IN (
        SELECT c.id FROM contracts c
        WHERE c.sales_partner_id = auth.uid() OR c.created_by = auth.uid()
      ))
      OR
      (lead_id IS NOT NULL AND lead_id IN (
        SELECT l.id FROM leads l WHERE l.assigned_to = auth.uid()
      ))
    )
  );

-- Tippgeber: events for referred leads/contracts
CREATE POLICY "Tippgeber view referred customer_events"
  ON public.customer_events FOR SELECT
  USING (
    has_role(auth.uid(), 'tippgeber'::app_role)
    AND (
      (contract_id IS NOT NULL AND contract_id IN (
        SELECT c.id FROM contracts c WHERE c.tippgeber_id = auth.uid()
      ))
      OR
      (lead_id IS NOT NULL AND lead_id IN (
        SELECT l.id FROM leads l WHERE l.tippgeber_id = auth.uid()
      ))
    )
  );