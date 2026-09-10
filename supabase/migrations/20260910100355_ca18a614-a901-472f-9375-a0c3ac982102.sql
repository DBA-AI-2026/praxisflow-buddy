-- 1) Offene INSERT-Policy entfernen (kein legitimer Nutzer: capture-lead = Service-Role)
DROP POLICY IF EXISTS "Anyone can submit leads" ON public.leads;

-- 2) Zweite Schutzschicht: INSERT-Grant fuer anon/authenticated entziehen.
--    Grant UND Policy zusammen ergeben Zugriff — ohne Grant laeuft selbst eine
--    versehentlich spaeter ergaenzte INSERT-Policy ins Leere.
--    SELECT/UPDATE bleiben (Dashboard liest/bearbeitet als authenticated) — NUR INSERT raus.
REVOKE INSERT ON public.leads FROM anon, authenticated;

-- Service-Role behaelt vollen Zugriff (umgeht RLS ohnehin) — capture-lead unberuehrt.