CREATE OR REPLACE FUNCTION public.is_tippgeber_of(_partner_user_id uuid, _tippgeber_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tippgeber_partner_assignments
    WHERE partner_user_id   = _partner_user_id
      AND tippgeber_user_id = _tippgeber_user_id
      AND is_active = true
  )
$$;