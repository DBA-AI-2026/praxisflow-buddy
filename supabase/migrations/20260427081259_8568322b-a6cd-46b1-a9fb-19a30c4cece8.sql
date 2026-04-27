-- RPC: Atomare Konvertierung einer Reservierung in einen Lead/Interessenten
-- - prüft Berechtigung analog zu RLS (Admin, Sales Lead, Regional Lead via Team, Ersteller, zuständiger AD)
-- - prüft, dass noch nicht konvertiert
-- - legt neuen Lead an (übernimmt Praxis-/AD-Daten aus der Reservierung)
-- - verknüpft Reservierung mit neuem Lead, setzt status='konvertiert', converted_at, converted_by_user_id
-- - liefert die neue lead_id und hfx_customer_number zurück
-- Hinweis: DEFINER, damit Lead-Insert RLS umgeht; Berechtigung wird im Funktionsrumpf explizit geprüft.

CREATE OR REPLACE FUNCTION public.convert_reservation_to_lead(
  p_reservation_id uuid,
  p_vorname        text,
  p_nachname       text,
  p_email          text,
  p_mobilnummer    text,
  p_force          boolean DEFAULT false
)
RETURNS TABLE(lead_id uuid, hfx_customer_number text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     uuid := auth.uid();
  v_res         public.praxis_reservations%ROWTYPE;
  v_is_admin    boolean := public.has_role(auth.uid(), 'admin');
  v_is_lead     boolean := public.has_role(auth.uid(), 'sales_lead');
  v_is_regional boolean := public.has_role(auth.uid(), 'regional_lead');
  v_is_owner    boolean;
  v_is_ad       boolean;
  v_team_ok     boolean := false;
  v_lead        public.leads%ROWTYPE;
  v_full_addr   text;
  v_vorname     text;
  v_nachname    text;
  v_email       text;
  v_mobile      text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Nicht authentifiziert' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_res FROM public.praxis_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservierung nicht gefunden' USING ERRCODE = 'P0002';
  END IF;

  -- Bereits konvertiert?
  IF v_res.status = 'konvertiert' OR v_res.lead_id IS NOT NULL THEN
    RAISE EXCEPTION 'Reservierung wurde bereits konvertiert (lead_id=%).', v_res.lead_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Berechtigung
  v_is_owner := (v_res.reserved_by = v_user_id);
  v_is_ad    := (v_res.assigned_ad_id = v_user_id);

  IF v_is_regional THEN
    v_team_ok :=
      (v_res.reserved_by  IS NOT NULL AND public.is_in_regional_lead_team(v_user_id, v_res.reserved_by))
      OR
      (v_res.assigned_ad_id IS NOT NULL AND public.is_in_regional_lead_team(v_user_id, v_res.assigned_ad_id));
  END IF;

  IF NOT (v_is_admin OR v_is_lead OR v_is_owner OR v_is_ad OR v_team_ok) THEN
    RAISE EXCEPTION 'Keine Berechtigung zur Konvertierung dieser Reservierung'
      USING ERRCODE = '42501';
  END IF;

  -- Pflichtfelder normalisieren
  v_vorname  := NULLIF(trim(p_vorname),  '');
  v_nachname := NULLIF(trim(p_nachname), '');
  v_email    := NULLIF(lower(trim(p_email)), '');
  v_mobile   := NULLIF(trim(p_mobilnummer), '');

  IF v_vorname IS NULL OR v_nachname IS NULL OR v_email IS NULL THEN
    RAISE EXCEPTION 'Vorname, Nachname und E-Mail sind Pflichtfelder' USING ERRCODE = '23502';
  END IF;
  IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Ungültige E-Mail-Adresse' USING ERRCODE = '22023';
  END IF;
  IF v_res.plz IS NULL OR length(trim(v_res.plz)) = 0 THEN
    RAISE EXCEPTION 'Reservierung enthält keine PLZ' USING ERRCODE = '23502';
  END IF;

  -- E-Mail-Dublettencheck (es sei denn, p_force = true)
  IF NOT p_force AND EXISTS (
    SELECT 1 FROM public.leads WHERE lower(email) = v_email
  ) THEN
    RAISE EXCEPTION 'Es existiert bereits ein Interessent mit dieser E-Mail-Adresse'
      USING ERRCODE = '23505', HINT = 'duplicate_email';
  END IF;

  -- Adresse zusammenbauen
  v_full_addr :=
    NULLIF(
      trim(coalesce(v_res.strasse, '') || ' ' || coalesce(v_res.hausnummer, '')),
      ''
    );

  INSERT INTO public.leads (
    praxis_name,
    vorname,
    nachname,
    email,
    mobilnummer,
    plz,
    ort,
    adresse,
    nachricht,
    abrechnungszentrum,
    source,
    status,
    assigned_to,
    assignment_source
  ) VALUES (
    v_res.praxis_name,
    v_vorname,
    v_nachname,
    v_email,
    coalesce(v_mobile, v_res.telefon, 'nicht angegeben'),
    v_res.plz,
    v_res.ort,
    v_full_addr,
    v_res.notes,
    'nein',
    'reservation_conversion',
    'neu',
    v_res.assigned_ad_id,
    CASE
      WHEN v_res.assigned_ad_id IS NOT NULL
        THEN coalesce('reservation:' || v_res.assignment_source, 'reservation')
      ELSE 'none'
    END
  )
  RETURNING * INTO v_lead;

  -- Reservierung verknüpfen
  UPDATE public.praxis_reservations
     SET lead_id              = v_lead.id,
         status               = 'konvertiert',
         converted_at         = now(),
         converted_by_user_id = v_user_id,
         updated_at           = now()
   WHERE id = p_reservation_id;

  RETURN QUERY SELECT v_lead.id, v_lead.hfx_customer_number;
END;
$$;

-- Nur eingeloggte Nutzer dürfen die Funktion aufrufen
REVOKE ALL ON FUNCTION public.convert_reservation_to_lead(uuid, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.convert_reservation_to_lead(uuid, text, text, text, text, boolean) TO authenticated;