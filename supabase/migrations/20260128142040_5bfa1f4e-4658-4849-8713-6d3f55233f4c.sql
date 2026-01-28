-- Create praxen table for storing practice data
CREATE TABLE public.praxen (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  adresse TEXT,
  plz TEXT,
  ort TEXT,
  telefon TEXT,
  email TEXT,
  mp_nr TEXT UNIQUE,
  produkt TEXT,
  module TEXT[],
  preis NUMERIC DEFAULT 0,
  buchungs_datum DATE,
  status TEXT DEFAULT 'aktiv',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.praxen ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage praxen" 
ON public.praxen 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- All authenticated users can view praxen
CREATE POLICY "Authenticated users can view praxen" 
ON public.praxen 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Update trigger for updated_at
CREATE TRIGGER update_praxen_updated_at
BEFORE UPDATE ON public.praxen
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;