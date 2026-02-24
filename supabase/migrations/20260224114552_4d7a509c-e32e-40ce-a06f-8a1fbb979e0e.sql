
-- Create leads/Interessenten table
CREATE TABLE public.leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  hfx_customer_number text UNIQUE,
  praxis_name text NOT NULL,
  vorname text NOT NULL,
  nachname text NOT NULL,
  email text NOT NULL,
  plz text NOT NULL,
  mobilnummer text NOT NULL,
  abrechnungszentrum text NOT NULL DEFAULT 'nein',
  mp_nummer text,
  nachricht text,
  status text NOT NULL DEFAULT 'neu',
  salesforce_synced boolean NOT NULL DEFAULT false,
  salesforce_id text,
  qodia_synced boolean NOT NULL DEFAULT false,
  honorarplus_synced boolean NOT NULL DEFAULT false,
  confirmation_email_sent boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Auto-assign HFX number for leads (using existing sequence with I prefix)
CREATE OR REPLACE FUNCTION public.auto_assign_lead_hfx_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.hfx_customer_number IS NULL OR NEW.hfx_customer_number = '' THEN
    NEW.hfx_customer_number := 'HFX-I' || LPAD(nextval('public.hfx_customer_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER auto_assign_lead_hfx_number
  BEFORE INSERT ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_lead_hfx_number();

-- Updated_at trigger
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: Anyone can insert (public API from website)
CREATE POLICY "Anyone can submit leads"
  ON public.leads FOR INSERT
  WITH CHECK (true);

-- RLS: Admins, sales_leads, regional_leads can view
CREATE POLICY "Sales roles can view leads"
  ON public.leads FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'sales_lead'::app_role) OR
    has_role(auth.uid(), 'regional_lead'::app_role) OR
    has_role(auth.uid(), 'sales_partner'::app_role)
  );

-- RLS: Admins can update
CREATE POLICY "Admins and leads can update leads"
  ON public.leads FOR UPDATE
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'sales_lead'::app_role)
  );

-- RLS: Admins can delete
CREATE POLICY "Admins can delete leads"
  ON public.leads FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
