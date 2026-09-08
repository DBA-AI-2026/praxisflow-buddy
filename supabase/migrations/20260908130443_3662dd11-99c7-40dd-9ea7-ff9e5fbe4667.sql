-- 1) Sicherheitsnetz: idempotenter Gap-Catch (erwartet 0 Zeilen)
INSERT INTO public.lead_credentials (lead_id, generated_password)
SELECT id, generated_password
FROM public.leads
WHERE generated_password IS NOT NULL
ON CONFLICT (lead_id) DO NOTHING;

-- 2) Klartextspalte entfernen — schliesst leads_generated_password_broad_exposure
ALTER TABLE public.leads DROP COLUMN IF EXISTS generated_password;