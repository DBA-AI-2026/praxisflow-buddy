
-- ============================================================
-- PRIO 2: DB-Constraints für Tippgeber-Regeln
-- ============================================================

-- Trigger: Verhindere Tippgeber als sales_partner_id in contracts
CREATE OR REPLACE FUNCTION public.prevent_tippgeber_as_sales_partner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.sales_partner_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.sales_partner_id AND role = 'tippgeber'
    ) THEN
      RAISE EXCEPTION 'Tippgeber dürfen nicht als Vertragsverantwortlicher (sales_partner_id) eingetragen werden.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER check_no_tippgeber_as_sales_partner
  BEFORE INSERT OR UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_tippgeber_as_sales_partner();

-- Trigger: Tippgeber-Rolle nur vergeben wenn Partner-Zuordnung existiert
CREATE OR REPLACE FUNCTION public.enforce_tippgeber_partner_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role = 'tippgeber' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.tippgeber_partner_assignments
      WHERE tippgeber_user_id = NEW.user_id
    ) THEN
      RAISE EXCEPTION 'Tippgeber müssen einem Vertriebspartner zugeordnet sein (tippgeber_partner_assignments).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Nur bei INSERT, da die Zuordnung VOR der Rollenvergabe erstellt wird
-- Bei bestehenden Tippgebern ohne Zuordnung greifen wir nicht ein (Legacy)
CREATE TRIGGER check_tippgeber_has_partner
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_tippgeber_partner_assignment();

-- ============================================================
-- PRIO 3: is_active Flag für user_roles (Soft-Delete)
-- ============================================================

ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Index für schnelle Filterung aktiver Rollen
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON public.user_roles (is_active) WHERE is_active = true;
