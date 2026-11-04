-- Login-E-Mail-Änderung: atomares Umschreiben in leads, contracts, customers
-- fuer exakt eine hfx_customer_number (inkl. -NN-Standorte).
-- Wird ausschliesslich von der Edge Function change-login-email aufgerufen,
-- NACHDEM das Qodia-Konto erfolgreich umgestellt wurde.
-- Rollback: DROP FUNCTION public.apply_login_email_change(text, text, text);

CREATE OR REPLACE FUNCTION public.apply_login_email_change(
  p_hfx text,
  p_old text,
  p_new text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_leads integer;
  v_contracts integer;
  v_customers integer;
BEGIN
  -- Nur Zeilen mit der bisherigen Adresse anfassen; rechnungs_email bleibt unangetastet.
  UPDATE public.leads
     SET email = p_new, updated_at = now()
   WHERE hfx_customer_number = p_hfx AND email = p_old;
  GET DIAGNOSTICS v_leads = ROW_COUNT;

  UPDATE public.contracts
     SET email = p_new, updated_at = now()
   WHERE hfx_customer_number = p_hfx AND email = p_old;
  GET DIAGNOSTICS v_contracts = ROW_COUNT;

  UPDATE public.customers
     SET email = p_new, updated_at = now()
   WHERE hfx_customer_number = p_hfx AND email = p_old;
  GET DIAGNOSTICS v_customers = ROW_COUNT;

  -- Kein einziger Treffer: HFX-Nummer oder alte Adresse stimmen nicht.
  IF v_leads + v_contracts + v_customers = 0 THEN
    RAISE EXCEPTION 'Kein Datensatz mit hfx_customer_number % und E-Mail % gefunden', p_hfx, p_old
      USING ERRCODE = 'P0002';
  END IF;
END;
$function$;

-- EXECUTE nur fuer service_role; anon + authenticated ausdruecklich entzogen.
REVOKE ALL ON FUNCTION public.apply_login_email_change(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_login_email_change(text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_login_email_change(text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_login_email_change(text, text, text) TO service_role;