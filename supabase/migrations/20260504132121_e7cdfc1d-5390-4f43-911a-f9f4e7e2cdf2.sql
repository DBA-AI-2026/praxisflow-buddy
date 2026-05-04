-- =====================================================================
-- prevent_duplicate_profiles
-- =====================================================================
-- Zweck:
--   DB-seitiger Schutz gegen die Anlage doppelter Profile mit derselben
--   E-Mail-Adresse. Notwendig nach der Konsolidierung von 7 doppelten
--   AD-Profilen am 2026-05-04 (Migration consolidate_duplicate_ad_profiles).
--
-- Wirkung:
--   1) Partieller UNIQUE-Index auf lower(email) für AKTIVE Profile.
--      Soft-deleted Profile (Suffix '+deactivated_...@duplicate.local')
--      sind ausgenommen und bleiben als Audit-Anker erhalten.
--   2) handle_new_user() prüft vor dem INSERT, ob bereits ein aktives
--      Profil mit derselben (case-insensitive, getrimmten) E-Mail
--      existiert, und bricht mit klarer Fehlermeldung ab.
--
-- Was tun, wenn ein Duplikat absichtlich angelegt werden soll?
--   Vorher manuell entscheiden, welches Profil das AKTIVE bleibt, und
--   das andere mit dem Suffix '+deactivated_<DATUM>@duplicate.local'
--   in profiles.email + profiles.full_name versehen (siehe Vorgehen
--   aus consolidate_duplicate_ad_profiles vom 2026-05-04).
-- =====================================================================

DO $$
DECLARE
  v_dupe_count int;
  v_dupe_list  text;
BEGIN
  SELECT COUNT(*), string_agg(email_lc || ' (n=' || n || ')', ', ')
    INTO v_dupe_count, v_dupe_list
  FROM (
    SELECT lower(email) AS email_lc, COUNT(*) AS n
      FROM public.profiles
     WHERE email IS NOT NULL
       AND email NOT LIKE '%+deactivated_%@duplicate.local'
     GROUP BY lower(email)
    HAVING COUNT(*) > 1
  ) d;

  IF v_dupe_count > 0 THEN
    RAISE EXCEPTION
      'Migration abgebrochen: % aktive Duplikat-E-Mails gefunden. Bitte zuerst manuell konsolidieren. Betroffen: %',
      v_dupe_count, v_dupe_list;
  END IF;
END
$$;

-- 1) Partieller UNIQUE-Index auf aktive Profile
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_unique_active
  ON public.profiles (lower(email))
  WHERE email NOT LIKE '%+deactivated_%@duplicate.local';

COMMENT ON INDEX public.profiles_email_unique_active IS
  'Verhindert doppelte aktive Profile pro E-Mail (case-insensitive). Soft-deleted Profile (+deactivated_..@duplicate.local) sind ausgenommen.';

-- 2) handle_new_user(): Pre-Check gegen aktive Duplikate
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email_norm text;
  v_existing_user_id uuid;
BEGIN
  v_email_norm := lower(trim(NEW.email));

  IF v_email_norm IS NOT NULL AND v_email_norm <> '' THEN
    SELECT user_id INTO v_existing_user_id
      FROM public.profiles
     WHERE lower(email) = v_email_norm
       AND email NOT LIKE '%+deactivated_%@duplicate.local'
     LIMIT 1;

    IF v_existing_user_id IS NOT NULL THEN
      RAISE EXCEPTION
        'Ein aktives Profil mit dieser E-Mail existiert bereits (user_id: %)',
        v_existing_user_id
        USING ERRCODE = '23505';
    END IF;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );

  RETURN NEW;
END;
$function$;