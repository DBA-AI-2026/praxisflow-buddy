CREATE TABLE IF NOT EXISTS public.lead_credentials (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  generated_password text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_credentials ENABLE ROW LEVEL SECURITY;

-- Zugriff NUR Service-Role (umgeht RLS). Doppelte Absicherung fuer Credentials:
--   (1) KEINE Policy  -> RLS default-deny fuer anon/authenticated
--   (2) REVOKE Grants -> Zugriff braucht Grant UND Policy; selbst eine
--       spaeter versehentlich ergaenzte Policy liefe ohne Grant ins Leere.
-- NIEMALS eine SELECT/INSERT/UPDATE-Policy ergaenzen.
-- NIEMALS an anon/authenticated granten.
REVOKE ALL ON public.lead_credentials FROM anon, authenticated;
GRANT ALL ON public.lead_credentials TO service_role;

INSERT INTO public.lead_credentials (lead_id, generated_password)
SELECT id, generated_password
FROM public.leads
WHERE generated_password IS NOT NULL
ON CONFLICT (lead_id) DO NOTHING;