
## Plan: "Zugangsdaten versendet" im Sync-Status

### Problem
Der Sync-Status-Bereich zeigt aktuell: Bestätigungs-E-Mail, Qodia, Salesforce, HonorarPlus. Das Versenden von Zugangsdaten (über den Button "Zugangsdaten erneut senden") wird nirgends als Status-Flag festgehalten oder angezeigt.

### Lösung
1. **DB-Migration**: Neues Feld `credentials_sent_at` (timestamp, nullable) in der `leads`-Tabelle ergänzen — speichert wann zuletzt Zugangsdaten versendet wurden.
2. **`resend-lead-credentials` Edge Function**: Nach erfolgreichem E-Mail-Versand `credentials_sent_at = now()` in die `leads`-Tabelle schreiben (nur bei leadId-basierten Aufrufen).
3. **`LeadDetailDialog.tsx`**: 
   - `syncItems` um einen neuen Eintrag „Zugangsdaten versendet" erweitern (key: `credentials_sent_at`)
   - Status = ✅ wenn `credentials_sent_at` nicht null ist, inkl. Timestamp-Anzeige
   - Trigger-Button „Zugangsdaten senden" ruft die bestehende `resendCredentials`-Funktion auf
   - Nach Versand: DB-Feld updaten + Query invalidieren (kein Dialog-Close)

### Datenbankänderung
```sql
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS credentials_sent_at timestamptz DEFAULT NULL;
```

### Änderungen
- `supabase/migrations/` — neue Migration
- `supabase/functions/resend-lead-credentials/index.ts` — `credentials_sent_at` nach Versand setzen
- `src/components/leads/LeadDetailDialog.tsx` — neuer Sync-Item-Eintrag + Timestamp-Label + State
