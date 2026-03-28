-- Create auth user for wierskeiser@carecapital.de with a temporary password
-- The approve-user flow: create user, assign role, mark request approved

DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Create auth user
  v_user_id := extensions.uuid_generate_v4();
  
  INSERT INTO auth.users (
    id, instance_id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, created_at, updated_at, aud, role
  ) VALUES (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'wierskeiser@carecapital.de',
    crypt('HFX-Welcome2026!', gen_salt('bf')),
    now(),
    jsonb_build_object('full_name', 'Thilo Wiers-Keiser'),
    now(), now(), 'authenticated', 'authenticated'
  );

  -- Create identity
  INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  VALUES (v_user_id, v_user_id, 'wierskeiser@carecapital.de', 'email',
    jsonb_build_object('sub', v_user_id::text, 'email', 'wierskeiser@carecapital.de', 'email_verified', true, 'full_name', 'Thilo Wiers-Keiser'),
    now(), now(), now());

  -- Assign admin role
  INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'admin');

  -- Mark registration request as approved
  UPDATE public.registration_requests
  SET status = 'approved', reviewed_at = now()
  WHERE id = '40bc56f5-544a-408e-bc89-1cf529929828';
END;
$$;