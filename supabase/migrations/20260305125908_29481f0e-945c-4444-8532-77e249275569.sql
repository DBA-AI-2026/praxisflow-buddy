INSERT INTO public.email_notification_settings (setting_key, label, description, category, is_enabled)
VALUES (
  'new_lead_ad_notification',
  'AD-Benachrichtigung bei neuem Lead',
  'Benachrichtigt den zugewiesenen Außendienstmitarbeiter per E-Mail, wenn ein neuer Lead über die HFX-Webseite eingeht.',
  'leads',
  true
)
ON CONFLICT (setting_key) DO NOTHING;