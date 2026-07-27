ALTER TABLE public.leads ADD COLUMN campaign_mail_sent_at timestamp with time zone;

COMMENT ON COLUMN public.leads.campaign_mail_sent_at IS 'Zeitpunkt, an dem die letzte Kampagnen-E-Mail an diesen Interessenten versendet wurde. Nur der Anwendungscode/Service-Role setzt diesen Wert.';

REVOKE INSERT (campaign_mail_sent_at) ON public.leads FROM anon;
REVOKE UPDATE (campaign_mail_sent_at) ON public.leads FROM anon;
REVOKE INSERT (campaign_mail_sent_at) ON public.leads FROM authenticated;
REVOKE UPDATE (campaign_mail_sent_at) ON public.leads FROM authenticated;
