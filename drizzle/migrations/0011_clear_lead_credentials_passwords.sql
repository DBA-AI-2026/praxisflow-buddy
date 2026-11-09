-- Rollback: nicht moeglich (Passwoerter werden bewusst verworfen). Zeilen bleiben erhalten.
-- Kein Leser/Schreiber mehr: capture-lead und sync-lead-qodia nutzen lead_credentials nicht mehr.
UPDATE public.lead_credentials SET generated_password = NULL, updated_at = now() WHERE generated_password IS NOT NULL;
COMMENT ON TABLE public.lead_credentials IS 'DEPRECATED: wird nicht mehr gelesen oder beschrieben; kann spaeter entfernt werden.';