INSERT INTO public.email_notification_settings (setting_key, label, category, is_enabled, description)
VALUES
  ('tipp_lead_ad_notification',        'AD: Neuer Tipp-Lead',               'tipp-leads', true, 'E-Mail an AD wenn neuer Tipp-Lead eingereicht wird'),
  ('tipp_lead_tippgeber_confirmation', 'Tippgeber: Eingangsbestätigung',     'tipp-leads', true, 'Bestätigungs-E-Mail an Tippgeber nach Lead-Einreichung'),
  ('tipp_status_notification',         'Tippgeber: Status-Update',           'tipp-leads', true, 'E-Mail an Tippgeber bei Statusänderung'),
  ('demo_expiry_customer_reminder',    'Interessent: Testphasen-Erinnerung', 'demo',       true, 'Erinnerung an Interessenten 3 Tage vor Ablauf der Testphase'),
  ('demo_expiry_ad_notification',      'AD: Testphasen-Ablauf',              'demo',       true, 'E-Mail an AD bei Ablauf der Testphase eines Interessenten'),
  ('new_access_request_admin',         'Admin: Neue Zugangsanfrage',         'system',     true, 'Benachrichtigung an Admin bei neuer Zugangsanfrage'),
  ('contract_email_customer',          'Vertrag: Kundenexemplar',            'vertraege',  true, 'Vertrags-E-Mail mit PDF an Kunden'),
  ('contract_email_partner',           'Vertrag: Vertriebspartnerkopie',     'vertraege',  true, 'Vertragskopie per E-Mail an Vertriebspartner')
ON CONFLICT (setting_key) DO NOTHING;