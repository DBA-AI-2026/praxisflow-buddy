-- Migration: expand_user_roles_visibility

-- 1) PRE-FLIGHT
DO $$
DECLARE
  v_fn_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'is_in_regional_lead_team'
  ) INTO v_fn_exists;

  IF NOT v_fn_exists THEN
    RAISE EXCEPTION 'Pre-Flight fehlgeschlagen: Funktion public.is_in_regional_lead_team fehlt';
  END IF;

  RAISE NOTICE 'Pre-Flight OK: is_in_regional_lead_team existiert';
END $$;

-- 2) NEUE POLICIES (idempotent)
DROP POLICY IF EXISTS "Regional leads can view team roles" ON public.user_roles;
CREATE POLICY "Regional leads can view team roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'regional_lead')
  AND (
    user_id = auth.uid()
    OR public.is_in_regional_lead_team(auth.uid(), user_id)
  )
);

DROP POLICY IF EXISTS "Sales leads can view all roles" ON public.user_roles;
CREATE POLICY "Sales leads can view all roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'sales_lead'));

DROP POLICY IF EXISTS "Vertragsabteilung can view all roles" ON public.user_roles;
CREATE POLICY "Vertragsabteilung can view all roles"
ON public.user_roles
FOR SELECT
USING (has_role(auth.uid(), 'vertragsabteilung'));

-- 3) VERIFIKATION
DO $$
DECLARE
  v_count int;
  v_rec record;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'user_roles'
    AND cmd = 'SELECT';

  RAISE NOTICE '--- SELECT-Policies auf public.user_roles ---';
  FOR v_rec IN
    SELECT policyname, qual
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND cmd = 'SELECT'
    ORDER BY policyname
  LOOP
    RAISE NOTICE 'Policy: % | USING: %', v_rec.policyname, v_rec.qual;
  END LOOP;

  IF v_count <> 5 THEN
    RAISE EXCEPTION 'Erwartet 5 SELECT-Policies, gefunden: %', v_count;
  END IF;

  RAISE NOTICE 'Verifikation OK: % SELECT-Policies aktiv', v_count;
END $$;