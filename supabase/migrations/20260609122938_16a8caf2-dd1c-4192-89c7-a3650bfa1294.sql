
-- Fix 2: partner_commission_overrides - droppt die offene authenticated-read Policy.
-- "Partners can view own overrides" (auth.uid()=user_id) und "Admins can manage" bleiben aktiv.
DROP POLICY IF EXISTS "Authenticated can view partner overrides" ON public.partner_commission_overrides;

-- Fix 3: plz_assignment_log - INSERT auf authentifizierte User einschränken (statt with_check=true).
DROP POLICY IF EXISTS "System insert assignment log" ON public.plz_assignment_log;
CREATE POLICY "Authenticated insert assignment log"
  ON public.plz_assignment_log
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Fix 4: has_role() respektiert is_active.
-- Deaktivierte Rollen (is_active=false) bestehen den Check nicht mehr.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND is_active = true
  )
$$;
