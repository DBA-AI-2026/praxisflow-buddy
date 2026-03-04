
-- PLZ Gebietsleiter mapping table
-- Stores PLZ prefix → Gebietsleiter assignment (2-digit prefix matches)
CREATE TABLE IF NOT EXISTS public.plz_gebietsleiter_mapping (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plz_prefix text NOT NULL,           -- e.g. "4", "29", "10" (match first digits)
  gebietsleiter_id uuid,              -- references auth user id of the GL
  gebietsleiter_name text NOT NULL,   -- display name for quick reference
  notes text,                         -- e.g. "medas only"
  priority integer NOT NULL DEFAULT 0, -- higher = checked first (for overlapping PLZ)
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.plz_gebietsleiter_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage PLZ mappings"
  ON public.plz_gebietsleiter_mapping FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view PLZ mappings"
  ON public.plz_gebietsleiter_mapping FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_plz_gebietsleiter_prefix ON public.plz_gebietsleiter_mapping(plz_prefix);

CREATE TRIGGER update_plz_mapping_updated_at
  BEFORE UPDATE ON public.plz_gebietsleiter_mapping
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
