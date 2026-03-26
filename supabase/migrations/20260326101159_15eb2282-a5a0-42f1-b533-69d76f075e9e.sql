
-- ============================================================
-- SECURITY: Rate limiting for public access request flow
-- Prevents spam / email bombing via the registration_requests table
-- ============================================================

-- 1. Add rate-limit tracking columns to registration_requests
ALTER TABLE public.registration_requests
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 1;

-- 2. Create a SECURITY DEFINER RPC function that enforces rate limiting
--    Rules:
--    - Max 3 attempts per e-mail address in any 24-hour window
--    - If already approved, block with generic message
--    This function is called by the application instead of direct INSERT
CREATE OR REPLACE FUNCTION public.submit_registration_request(
  p_full_name   text,
  p_email       text,
  p_company     text DEFAULT NULL,
  p_message     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing  record;
  v_window    interval := interval '24 hours';
  v_max_attempts int := 3;
BEGIN
  -- Validate inputs
  IF p_full_name IS NULL OR trim(p_full_name) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'message', 'Name ist erforderlich.');
  END IF;
  IF p_email IS NULL OR trim(p_email) = '' THEN
    RETURN jsonb_build_object('success', false, 'code', 'INVALID_INPUT', 'message', 'Ungültige E-Mail-Adresse.');
  END IF;

  -- Normalize email
  p_email := lower(trim(p_email));
  p_full_name := trim(p_full_name);

  -- Look up existing request for this e-mail
  SELECT * INTO v_existing
  FROM public.registration_requests
  WHERE lower(email) = p_email
  ORDER BY created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Generic: already processed (approved or rejected) — no status leak
    IF v_existing.status IN ('approved', 'rejected') THEN
      RETURN jsonb_build_object('success', false, 'code', 'ALREADY_PROCESSED', 'message', 'Ihre Anfrage wurde bereits bearbeitet. Bitte kontaktieren Sie uns direkt.');
    END IF;

    -- Rate-limit check within 24h window
    IF v_existing.last_attempt_at IS NOT NULL
       AND v_existing.last_attempt_at > now() - v_window THEN
      IF v_existing.attempt_count >= v_max_attempts THEN
        RETURN jsonb_build_object('success', false, 'code', 'RATE_LIMITED', 'message', 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.');
      END IF;
      -- Increment attempt counter
      UPDATE public.registration_requests
        SET attempt_count = attempt_count + 1,
            last_attempt_at = now()
      WHERE id = v_existing.id;
      RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE', 'message', 'Eine Anfrage mit dieser E-Mail-Adresse wurde bereits gestellt.');
    END IF;

    -- Outside window: still pending — reset counter, return duplicate
    IF v_existing.status = 'pending' THEN
      UPDATE public.registration_requests
        SET attempt_count = 1,
            last_attempt_at = now()
      WHERE id = v_existing.id;
      RETURN jsonb_build_object('success', false, 'code', 'DUPLICATE', 'message', 'Eine Anfrage mit dieser E-Mail-Adresse wurde bereits gestellt.');
    END IF;
  END IF;

  -- Insert new request
  INSERT INTO public.registration_requests (full_name, email, company, message, last_attempt_at, attempt_count)
  VALUES (p_full_name, p_email, nullif(trim(coalesce(p_company,'')), ''), nullif(trim(coalesce(p_message,'')), ''), now(), 1);

  RETURN jsonb_build_object('success', true, 'message', 'Anfrage erfolgreich übermittelt.');
END;
$$;

-- Grant EXECUTE to anon and authenticated
GRANT EXECUTE ON FUNCTION public.submit_registration_request(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_registration_request(text, text, text, text) TO authenticated;

-- 3. Remove direct INSERT policies for anon on registration_requests
--    All inserts now go through the SECURITY DEFINER RPC
DROP POLICY IF EXISTS "Anyone can submit registration request" ON public.registration_requests;
DROP POLICY IF EXISTS "Public can insert registration requests" ON public.registration_requests;
DROP POLICY IF EXISTS "Anon can insert registration requests" ON public.registration_requests;
