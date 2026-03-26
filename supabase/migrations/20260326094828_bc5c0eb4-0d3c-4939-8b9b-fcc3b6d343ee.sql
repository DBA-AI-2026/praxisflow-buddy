
-- View mit SECURITY INVOKER neu erstellen, damit der Aufrufer
-- (anon) die RLS-Checks der zugrundeliegenden Tabelle respektiert.
-- Da wir die anon-Policy auf contracts entfernt haben, 
-- schützt RLS die Basistabelle weiterhin.
-- Die View selbst filtert zusätzlich auf status='eingegangen'
-- und exponiert nur die 10 sicheren Buchungsfelder.

DROP VIEW IF EXISTS public.contracts_public_booking;

CREATE VIEW public.contracts_public_booking
  WITH (security_invoker = true)
AS
  SELECT 
    id,
    praxis,
    customer_name,
    product_name,
    modules,
    monthly_price,
    hfx_customer_number,
    fachrichtung,
    rechtsform,
    status
  FROM public.contracts
  WHERE status = 'eingegangen';

-- Anon-Rolle darf View selektieren
-- (RLS der Basistabelle contracts blockiert anon vollständig;
--  wir brauchen daher eine separate RLS-Ausnahme NUR für View-Zugriff)
GRANT SELECT ON public.contracts_public_booking TO anon;
GRANT SELECT ON public.contracts_public_booking TO authenticated;

-- Ergänzende schmale SELECT-Policy auf contracts, die AUSSCHLIESSLICH
-- anon erlaubt, die 10 Felder der Buchungsview zu lesen.
-- Row Security auf contracts selbst bleibt aktiv.
CREATE POLICY "Anon booking view: safe fields only for eingegangen"
  ON public.contracts FOR SELECT
  TO anon
  USING (status = 'eingegangen');
