
CREATE TABLE public.agb_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  agb_version text NOT NULL DEFAULT '1.0',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  customer_email text,
  customer_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.agb_acceptances ENABLE ROW LEVEL SECURITY;

-- Admins can view all
CREATE POLICY "Admins can view agb acceptances"
  ON public.agb_acceptances FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Edge functions (service role) and anon can insert during booking
CREATE POLICY "Anyone can insert agb acceptances"
  ON public.agb_acceptances FOR INSERT
  WITH CHECK (true);

-- Sales roles can view
CREATE POLICY "Sales roles can view agb acceptances"
  ON public.agb_acceptances FOR SELECT
  USING (
    public.has_role(auth.uid(), 'sales_lead') OR 
    public.has_role(auth.uid(), 'vertragsabteilung')
  );
