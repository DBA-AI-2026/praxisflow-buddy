-- Add 'tippgeber' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'tippgeber';

-- Create tipp_leads table for Tippgeber to submit lead tips
CREATE TABLE IF NOT EXISTS public.tipp_leads (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by uuid NOT NULL,
  arzt_name text NOT NULL,
  praxis_name text NOT NULL,
  email text,
  telefon text,
  plz text NOT NULL,
  geschaeftsbereich text NOT NULL, -- MCC | privadis | ZAB
  gewuenschte_dienstleistung text NOT NULL,
  status text NOT NULL DEFAULT 'neu',
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tipp_leads ENABLE ROW LEVEL SECURITY;

-- Tippgeber can insert their own tips
CREATE POLICY "Tippgeber can insert own tips"
  ON public.tipp_leads FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Tippgeber can view their own tips
CREATE POLICY "Tippgeber can view own tips"
  ON public.tipp_leads FOR SELECT
  USING (auth.uid() = created_by);

-- Admins and sales_lead can view all tips
CREATE POLICY "Admins and sales leads can view all tips"
  ON public.tipp_leads FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'sales_lead'::app_role)
    OR has_role(auth.uid(), 'regional_lead'::app_role)
  );

-- Admins can update tips (e.g. status changes)
CREATE POLICY "Admins can update tips"
  ON public.tipp_leads FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'sales_lead'::app_role));

-- Admins can delete tips
CREATE POLICY "Admins can delete tips"
  ON public.tipp_leads FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE TRIGGER update_tipp_leads_updated_at
  BEFORE UPDATE ON public.tipp_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
