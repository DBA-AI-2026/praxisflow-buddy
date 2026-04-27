-- 1) Neue Spalten ergänzen
ALTER TABLE public.praxis_reservations
  ADD COLUMN IF NOT EXISTS assigned_ad_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_ad_name text,
  ADD COLUMN IF NOT EXISTS assignment_source text,
  ADD COLUMN IF NOT EXISTS lead_id uuid,
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS converted_at timestamptz,
  ADD COLUMN IF NOT EXISTS converted_by_user_id uuid;

-- 2) Default reservation_months
ALTER TABLE public.praxis_reservations
  ALTER COLUMN reservation_months SET DEFAULT 6;

-- 3) Foreign Keys
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'praxis_reservations_lead_id_fkey') THEN
    ALTER TABLE public.praxis_reservations
      ADD CONSTRAINT praxis_reservations_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'praxis_reservations_customer_id_fkey') THEN
    ALTER TABLE public.praxis_reservations
      ADD CONSTRAINT praxis_reservations_customer_id_fkey
      FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'praxis_reservations_contract_id_fkey') THEN
    ALTER TABLE public.praxis_reservations
      ADD CONSTRAINT praxis_reservations_contract_id_fkey
      FOREIGN KEY (contract_id) REFERENCES public.contracts(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'praxis_reservations_assigned_ad_id_fkey') THEN
    ALTER TABLE public.praxis_reservations
      ADD CONSTRAINT praxis_reservations_assigned_ad_id_fkey
      FOREIGN KEY (assigned_ad_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'praxis_reservations_converted_by_user_id_fkey') THEN
    ALTER TABLE public.praxis_reservations
      ADD CONSTRAINT praxis_reservations_converted_by_user_id_fkey
      FOREIGN KEY (converted_by_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- 4) CHECK-Constraint für status
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'praxis_reservations_status_check') THEN
    ALTER TABLE public.praxis_reservations
      ADD CONSTRAINT praxis_reservations_status_check
      CHECK (status IS NULL OR status IN ('reserviert','in_bearbeitung','konvertiert','abgelaufen','freigegeben'));
  END IF;
END $$;

-- 5) Backfill status
UPDATE public.praxis_reservations
   SET status = 'reserviert'
 WHERE status IS NULL OR status = '';

-- 6) Default status
ALTER TABLE public.praxis_reservations
  ALTER COLUMN status SET DEFAULT 'reserviert';

-- 7) Indizes
CREATE INDEX IF NOT EXISTS idx_praxis_reservations_reserved_by ON public.praxis_reservations(reserved_by);
CREATE INDEX IF NOT EXISTS idx_praxis_reservations_assigned_ad_id ON public.praxis_reservations(assigned_ad_id);
CREATE INDEX IF NOT EXISTS idx_praxis_reservations_plz ON public.praxis_reservations(plz);
CREATE INDEX IF NOT EXISTS idx_praxis_reservations_status ON public.praxis_reservations(status);
CREATE INDEX IF NOT EXISTS idx_praxis_reservations_lead_id ON public.praxis_reservations(lead_id);
CREATE INDEX IF NOT EXISTS idx_praxis_reservations_customer_id ON public.praxis_reservations(customer_id);
CREATE INDEX IF NOT EXISTS idx_praxis_reservations_contract_id ON public.praxis_reservations(contract_id);

-- 8) Trigger-Funktion: AD-Auflösung beim INSERT
CREATE OR REPLACE FUNCTION public.trg_praxis_reservations_resolve_ad()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_gl_id uuid;
  v_gl_name text;
  v_rule text;
BEGIN
  IF NEW.assigned_ad_id IS NULL AND NEW.plz IS NOT NULL AND length(trim(NEW.plz)) > 0 THEN
    SELECT r.gebietsleiter_id, r.gebietsleiter_name, r.matched_rule
      INTO v_gl_id, v_gl_name, v_rule
      FROM public.resolve_plz_ad(NEW.plz) r
      LIMIT 1;

    IF v_gl_id IS NOT NULL THEN
      NEW.assigned_ad_id := v_gl_id;
      NEW.assigned_ad_name := v_gl_name;
      NEW.assignment_source := COALESCE(NEW.assignment_source, 'plz_auto');
    ELSE
      NEW.assignment_source := COALESCE(NEW.assignment_source, 'unassigned');
    END IF;
  END IF;

  IF NEW.status IS NULL OR NEW.status = '' THEN
    NEW.status := 'reserviert';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS praxis_reservations_resolve_ad_biu ON public.praxis_reservations;
CREATE TRIGGER praxis_reservations_resolve_ad_biu
  BEFORE INSERT ON public.praxis_reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_praxis_reservations_resolve_ad();

-- 9) Optionales Backfill mit LATERAL
WITH resolved AS (
  SELECT pr.id,
         r.gebietsleiter_id,
         r.gebietsleiter_name
    FROM public.praxis_reservations pr
    CROSS JOIN LATERAL public.resolve_plz_ad(pr.plz) r
   WHERE pr.assigned_ad_id IS NULL
     AND pr.plz IS NOT NULL
     AND length(trim(pr.plz)) > 0
     AND r.gebietsleiter_id IS NOT NULL
)
UPDATE public.praxis_reservations pr
   SET assigned_ad_id    = resolved.gebietsleiter_id,
       assigned_ad_name  = resolved.gebietsleiter_name,
       assignment_source = 'plz_auto_backfill'
  FROM resolved
 WHERE pr.id = resolved.id;