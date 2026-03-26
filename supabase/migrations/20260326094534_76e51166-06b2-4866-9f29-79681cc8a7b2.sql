
-- ============================================================
-- BLOCKER 1: Contracts – Anon-Lesezugriff einschränken
-- ============================================================
-- Bisherige Policy erlaubte anon-Rolle ALLE Felder der Contracts
-- mit status='eingegangen' zu lesen, inkl. PII (email, telefon, 
-- adresse, iban, bic, tokens, sales_partner_id, etc.)
--
-- Lösung: Policy für anon entfernen.
-- Der öffentliche Buchungsflow (Buchen.tsx) benötigt nur diese 
-- sicheren Felder: praxis, customer_name, product_name, modules,
-- monthly_price, hfx_customer_number, fachrichtung, rechtsform.
-- Diese werden über eine neue, sichere VIEW für anon freigelegt,
-- die explizit keine PII/Tokens enthält.
-- ============================================================

-- 1. Bestehende unsichere Policy entfernen
DROP POLICY IF EXISTS "Public can read eingegangen contracts for booking" ON public.contracts;

-- 2. Sichere View mit nur den nicht-sensiblen Buchungsfeldern
CREATE OR REPLACE VIEW public.contracts_public_booking AS
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

-- View für anon-Rolle zugänglich machen (RLS greift nicht auf Views,
-- daher explizit GRANT statt Policy; View filtert bereits auf status
-- und enthält bewusst keine PII/Tokens/interne IDs)
GRANT SELECT ON public.contracts_public_booking TO anon;
GRANT SELECT ON public.contracts_public_booking TO authenticated;

-- ============================================================
-- BLOCKER 2: customer_revenues – user-Rolle zu breiter Zugriff
-- ============================================================
-- Bisherige Policy 'Admins and sales leads can view all revenues'
-- enthielt has_role(user) ohne user_id-Filter, was alle Umsätze
-- aller Kunden für jeden Gebietsleiter sichtbar machte.
--
-- Fachliche Zuordnungslogik nach Rollenmodell:
--   admin      → alle Umsätze (eigene ALL-Policy)
--   sales_lead → alle Umsätze (Gesamtübersicht, eigene Policy)
--   user       → NUR eigene (user_id = auth.uid())
--   regional_lead → Teamdaten via is_in_regional_lead_team()
--   sales_partner → eigene (user_id = auth.uid())
-- ============================================================

-- 3. Bestehende zu breite Policy entfernen
DROP POLICY IF EXISTS "Admins and sales leads can view all revenues" ON public.customer_revenues;

-- 4. Saubere separate Policies anlegen

-- Admin: alle Umsätze (ergänzt bestehende INSERT/UPDATE/DELETE)
CREATE POLICY "Admins can view all revenues"
  ON public.customer_revenues FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Sales Lead: alle Umsätze (Gesamtsicht Vertriebsleitung)
CREATE POLICY "Sales leads can view all revenues"
  ON public.customer_revenues FOR SELECT
  USING (has_role(auth.uid(), 'sales_lead'::app_role));

-- Regional Lead: nur Teamumsätze (via is_in_regional_lead_team)
CREATE POLICY "Regional leads can view team revenues"
  ON public.customer_revenues FOR SELECT
  USING (
    has_role(auth.uid(), 'regional_lead'::app_role)
    AND is_in_regional_lead_team(auth.uid(), user_id)
  );

-- user / sales_partner: nur eigene Umsätze (user_id = auth.uid())
-- Diese Logik war bereits in den INSERT/UPDATE/DELETE-Policies korrekt;
-- die neue SELECT-Policy setzt dieselbe Einschränkung durch.
CREATE POLICY "Users can view own revenues"
  ON public.customer_revenues FOR SELECT
  USING (auth.uid() = user_id);
