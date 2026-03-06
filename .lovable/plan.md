
## Gesamtbild des Features

**Was gewünscht ist:**
1. Auf der Interessenten-Seite kann ein AD ein unterschriebenes Papier-Vertrags-PDF hochladen
2. Upload → Vertrag wird als "eingegangen" angelegt → Interessent erscheint unter Verträge
3. Kunde bekommt eine Bestätigungs-E-Mail mit einem Button (öffentliche URL, kein Login nötig)
4. Kunde klickt Button → Vertrag wird aktiv, Interessent wird Kunde

**Architektur-Entscheidung:**
- `contracts`-Tabelle bekommt zwei neue Spalten: `paper_contract_pdf_path` (Storage-Pfad) und `customer_confirmation_token` (UUID für den öffentlichen Bestätigungslink)
- Status-Flow: `entwurf` → neu: **`eingegangen`** → nach Kunden-Klick: `aktiv`
- Bestätigungsseite: öffentliche Route `/vertrag-bestaetigen?token=<uuid>` (analog zu `/demo-success`)
- Neue Edge Function `confirm-paper-contract`: nimmt Token, setzt Status auf aktiv, erstellt Praxen-Eintrag
- Neue Edge Function `send-contract-confirmation`: sendet Kunden-E-Mail mit Bestätigungs-CTA + Stripe-Zahlungslink

---

## Datenbankänderungen (Migration)

```sql
-- Neue Spalten an contracts
ALTER TABLE contracts ADD COLUMN paper_contract_pdf_path text;
ALTER TABLE contracts ADD COLUMN customer_confirmation_token uuid DEFAULT gen_random_uuid();
ALTER TABLE contracts ADD COLUMN customer_confirmed_at timestamptz;

-- Neuer Status 'eingegangen' ist nur ein String-Wert, kein Enum-Constraint vorhanden → keine Migration nötig

-- Storage: 'contracts' Bucket existiert bereits (privat)
-- RLS: Uploads durch eingeloggte Nutzer (bereits via 'contracts' Bucket vorhanden)
```

---

## Neue Dateien

### 1. `src/components/leads/UploadPaperContractDialog.tsx`
Dialog, der aus der Interessenten-Zeile heraus aufrufbar ist. Enthält:
- Felder: `product_name`, `monthly_price`, `start_date`, `license_count`
- PDF-Upload via `<input type="file" accept=".pdf">`  
- Upload → Storage Bucket `contracts/<contract_id>/paper-vertrag.pdf`
- Insert in `contracts` mit `status: "eingegangen"` + `paper_contract_pdf_path`
- Lead-Status auf `vertrag` setzen
- Nach Speichern: Aufruf Edge Function `send-contract-confirmation`

### 2. `supabase/functions/send-contract-confirmation/index.ts`
Neue Edge Function (Auth-geschützt). Empfängt `contract_id`.
- Lädt Contract-Daten (Name, Produkt, Preis, Token)
- Erzeugt Stripe Checkout Session für das Produkt (analog zu demo-reminder)
- Sendet HTML-E-Mail an `contract.email` mit:
  - Vertragsdetails-Box (Produkt, Laufzeit, Preis, HFX-Nummer)
  - Zwei Buttons: **"Vertrag bestätigen"** → `/vertrag-bestaetigen?token=<uuid>` und wenn Stripe verfügbar: **"Zahlung einrichten"** → Stripe Checkout URL
  - HFX-Design (blauer Header, Fox-Logo)

### 3. `supabase/functions/confirm-paper-contract/index.ts`
Neue öffentliche Edge Function (kein Auth erforderlich). Empfängt `token`.
- Sucht Contract per `customer_confirmation_token`
- Setzt `status: "aktiv"`, `approved_at: now()`, `customer_confirmed_at: now()`
- Erstellt Praxen-Eintrag (analog zur PaperContractDialog-Logik)
- Gibt `{ success: true, contract }` zurück

### 4. `src/pages/ContractConfirmation.tsx`
Öffentliche Bestätigungsseite (kein Login). Route: `/vertrag-bestaetigen?token=<uuid>`.
- Ruft `confirm-paper-contract` mit Token auf
- Zeigt Erfolgsmeldung: "Ihr Vertrag wurde bestätigt und ist jetzt aktiv."
- Bei bereits bestätigtem Vertrag: freundliche Meldung
- Design analog zu `DemoSuccess.tsx`

---

## Geänderte Dateien

### 5. `src/pages/Interessenten.tsx`
- Neues Import + State: `UploadPaperContractDialog`
- In der Aktions-Spalte: neuer Upload-Button (Icon: `Upload` oder `FileUp`) mit Tooltip "Papiervertrag einreichen"
- Öffnet `UploadPaperContractDialog` mit dem ausgewählten Lead

### 6. `src/App.tsx`
- Route `/vertrag-bestaetigen` → `<ContractConfirmation />` (öffentlich, kein ProtectedRoute)

### 7. `supabase/config.toml`
- Einträge für `send-contract-confirmation` und `confirm-paper-contract` (verify_jwt = false für confirm)

---

## Daten-Flow im Überblick

```text
AD auf Interessenten-Seite
  → klickt [Upload] bei einem Lead
  → UploadPaperContractDialog öffnet sich
  → füllt Produktdaten aus + wählt PDF
  → speichert → contracts INSERT (status: "eingegangen") + PDF in Storage
  → Lead-Status → "vertrag"
  → ruft send-contract-confirmation auf
  
Edge Function: send-contract-confirmation
  → erstellt Stripe Checkout Session (falls Produkt gemappt)
  → sendet E-Mail an Kunden mit:
      [Vertrag bestätigen] → /vertrag-bestaetigen?token=abc123
      [Zahlung einrichten] → Stripe URL

Kunde klickt E-Mail-Button
  → /vertrag-bestaetigen?token=abc123
  → ContractConfirmation Seite
  → ruft confirm-paper-contract auf
  → Contract: status → "aktiv", customer_confirmed_at gesetzt
  → Praxen-Eintrag erstellt
  → Seite zeigt "Vertrag bestätigt ✓"

Vertraege-Seite (im Dashboard)
  → Contract mit status "eingegangen" erscheint sofort nach Upload
  → Nach Bestätigung: status wechselt zu "aktiv"
```

---

## Vertraege-Seite: "eingegangen" Status

Der neue Status `eingegangen` muss in der Vertraege-Seite erkannt werden:
- In `statusConfig` in `Vertraege.tsx` den Status `eingegangen` mit Badge `"Eingang"` ergänzen
- Status-Filter-Kacheln ebenfalls erweitern
- Kein weiterer Aufwand: Contracts mit `eingegangen` tauchen automatisch in der Liste auf

---

## Zusammenfassung der Änderungen

| Datei | Typ | Beschreibung |
|---|---|---|
| DB Migration | neu | 3 Spalten an `contracts` |
| `UploadPaperContractDialog.tsx` | neu | Upload-Dialog von Interessenten |
| `send-contract-confirmation/index.ts` | neu | E-Mail mit Bestätigungslink + Stripe |
| `confirm-paper-contract/index.ts` | neu | Token-Validierung, Aktivierung |
| `ContractConfirmation.tsx` | neu | Öffentliche Bestätigungsseite |
| `Interessenten.tsx` | geändert | Upload-Button in Zeilen-Aktionen |
| `App.tsx` | geändert | Route `/vertrag-bestaetigen` |
| `Vertraege.tsx` | geändert | Status `eingegangen` in Konfiguration |
| `supabase/config.toml` | geändert | 2 neue Functions |
