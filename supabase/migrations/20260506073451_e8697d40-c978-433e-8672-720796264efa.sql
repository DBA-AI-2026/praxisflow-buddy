DO $$
DECLARE
  r record;
  before_list text := '';
BEGIN
  FOR r IN
    SELECT grantee, privilege_type
      FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'get_cron_secret'
     ORDER BY grantee
  LOOP
    before_list := before_list || r.grantee || '(' || r.privilege_type || '), ';
  END LOOP;
  RAISE NOTICE 'PRE-FLIGHT grants on public.get_cron_secret(): %', before_list;
END $$;

REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cron_secret() FROM authenticated;

DO $$
DECLARE
  r record;
  after_list text := '';
  bad_count int := 0;
BEGIN
  FOR r IN
    SELECT grantee, privilege_type
      FROM information_schema.routine_privileges
     WHERE routine_schema = 'public' AND routine_name = 'get_cron_secret'
     ORDER BY grantee
  LOOP
    after_list := after_list || r.grantee || '(' || r.privilege_type || '), ';
    IF r.grantee IN ('PUBLIC', 'anon', 'authenticated') THEN
      bad_count := bad_count + 1;
    END IF;
  END LOOP;
  RAISE NOTICE 'POST-REVOKE grants on public.get_cron_secret(): %', after_list;
  IF bad_count > 0 THEN
    RAISE EXCEPTION 'PUBLIC/anon/authenticated haben noch EXECUTE (count=%). Rollback.', bad_count;
  END IF;
END $$;