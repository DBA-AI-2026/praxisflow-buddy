-- Etappe 1: Kampagnen-Token Fundament
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS campaign_token text,
  ADD COLUMN IF NOT EXISTS campaign_token_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS campaign_token_used_at timestamptz;

-- UNIQUE + partieller Index (NULL-Zeilen sollen den Index nicht aufblähen)
CREATE UNIQUE INDEX IF NOT EXISTS leads_campaign_token_key
  ON public.leads (campaign_token)
  WHERE campaign_token IS NOT NULL;

COMMENT ON COLUMN public.leads.campaign_token IS
  'Geheimer Kampagnen-Token (SECRET) für /kampagne-Einladungslink. Nur serverseitig via campaign-token-issue erzeugt. Niemals loggen, niemals im Client generieren.';
COMMENT ON COLUMN public.leads.campaign_token_created_at IS
  'Zeitpunkt der Token-Erzeugung.';
COMMENT ON COLUMN public.leads.campaign_token_used_at IS
  'Zeitpunkt der ersten Einlösung des Kampagnen-Tokens (Etappe 2).';

-- Sicherheits-Härtung: anon-INSERTs (öffentliches Lead-Formular) dürfen die
-- Token-Spalte weder setzen noch überschreiben. Alle übrigen Spalten-Rechte
-- bleiben unverändert (anon behält Table-Level INSERT/SELECT/UPDATE/DELETE ACL).
REVOKE INSERT (campaign_token) ON public.leads FROM anon;
REVOKE UPDATE (campaign_token) ON public.leads FROM anon;