-- Spalte für generiertes Passwort (wird an Qodia übermittelt und in der Bestätigungsmail angezeigt)
ALTER TABLE public.leads ADD COLUMN generated_password text;
