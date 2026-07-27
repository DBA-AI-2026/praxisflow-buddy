COMMENT ON COLUMN public.leads.campaign_mail_sent_at IS
  'Idempotenz-Anker fuer die Kampagne goae_conversion_2026
   (campaign-mail-send). Wird EINMAL gesetzt, nachdem Resend den
   Versand bestaetigt hat, per .is(campaign_mail_sent_at, null)-Guard.
   NIEMALS ueberschreiben oder zuruecksetzen: die Zielmenge schliesst
   Leads mit gesetztem Wert aus, ein Reset wuerde einen Doppelversand
   ausloesen. Die Spalte kann Kampagnen NICHT unterscheiden - eine
   zweite Kampagne braucht eine eigene Spalte oder eine Auswertung
   ueber customer_events.CAMPAIGN_MAIL_SENT. NULL = noch nicht versendet.';