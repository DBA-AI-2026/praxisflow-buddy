
## Vollständiger Plan: Abrechnungs- und Buchhaltungssystem

Alle 7 Schritte werden implementiert. Hier ist die finale Übersicht:

---

### Datenbankänderungen (3 Migrationen)

**Migration 1 – Tabelle `usage_charges`**
Speichert Qodia-Verbrauchsdaten je HFX-Nr. und Abrechnungsperiode. Felder: HFX-Nr., Vertrag, Zeitraum, Stückzahl, Preis (intern gesetzt), Betrag, Status (pending / invoiced / exported), Rechnungs-Referenz.

**Migration 2 – Tabelle `commission_payouts`**
Speichert berechnete Provisionen je Vertriebspartner und Monat. Felder: Partner-ID/Name, Vertrags-Ref., Rechnungs-Ref., Produkt, Satz, Betrag, Monat, Status (pending / approved / paid / exported), PDF-Pfad.

**Migration 3 – Zwei neue Spalten in `contracts`**
- `mandate_accepted_at` (timestamptz): rechtsgültige Zustimmung zum automatischen Einzug
- `qodia_unit_price` (numeric): intern festgelegter Preis pro Qodia-Vorgang für diesen Vertrag

---

### Neue Edge Function: `receive-usage`

Endpunkt für Qodia zum Einliefern von Verbrauchsdaten:
- Auth über `x-api-key` Header (QODIA_API_KEY)
- Input: HFX-Nr., Periode, Stückzahl
- Preis wird aus `contracts.qodia_unit_price` gelesen
- Erstellt `usage_charges`-Datensatz mit status = 'pending'

---

### Erweiterte Edge Function: `auto-invoice`

Pro Vertragsabrechnung:
1. Grundgebühr als erste Position (wie bisher)
2. Offene `usage_charges` für diese HFX-Nr. → als zusätzliche Positionen anhängen
3. `usage_charges` → status = 'invoiced', invoice_id setzen
4. Nach Rechnungserstellung → `commission_payouts`-Datensatz für Sales Partner anlegen

---

### Frontend-Änderungen

**Vertraege.tsx** – Zwei neue Felder:
- Checkbox "Zustimmung zur automatischen Zahlung erteilt" → speichert `mandate_accepted_at`
- Eingabefeld "Preis pro Qodia-Vorgang (€)" → speichert `qodia_unit_price`
- Mandate-Status als Badge in der Vertragsübersicht

**Provisionen.tsx** – Echte Daten statt Mock:
- Tabelle aus `commission_payouts` DB, gruppiert nach Monat + Vertriebler
- Admin-Aktionen: "Monat freigeben" (pending → approved), "Als ausgezahlt markieren" (approved → paid)
- Button "PDF-Abrechnung" je Monat/Partner: generiert Provisions-PDF via pdf-lib, downloadbar

**Rechnungen.tsx** – Neuer Tab "Nutzungsgebühren":
- Tabelle aller `usage_charges` mit Status, HFX-Nr., Periode, Betrag
- Offene Einträge: "Manuell abrechnen"-Button erstellt sofort eine Rechnung
- Abgerechnete Einträge: Link zur Rechnung

**Buchhaltung.tsx** – Provisionen-Tab:
- Echte Daten aus `commission_payouts` (approved/paid) statt berechneter Contract-Daten
- CSV-Export der Provisionen auf realen Payouts basierend
- Klare Bezeichnungen: "Lexware-API" vs. "CSV-Export (ohne Lexware)"

---

### Dateiübersicht

```
Neue Dateien:
  supabase/functions/receive-usage/index.ts

Geänderte Dateien:
  supabase/config.toml               (receive-usage eintragen)
  supabase/functions/auto-invoice/index.ts
  src/pages/vertrieb/Vertraege.tsx
  src/pages/vertrieb/Provisionen.tsx
  src/pages/Rechnungen.tsx
  src/pages/Buchhaltung.tsx

DB-Migrationen:
  3 separate Migrationsdateien
```

---

Bereit zur Umsetzung. Alle 7 Schritte werden in der beschriebenen Reihenfolge implementiert.
