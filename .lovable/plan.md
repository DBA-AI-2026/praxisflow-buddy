
## Was geändert wird

Die neuen Provisionsregeln gelten **ausschließlich für HFX GOÄ-Verträge**. Alle anderen Produkte behalten die bestehende Logik (Abfrage aus `product_commissions`).

---

## Provisionsmodell – Zusammenfassung

| Rolle | Regelwerk | Zeitlich |
|---|---|---|
| AD (user / regional_lead / sales_lead) | 100 € Festbetrag bei Vertragsabschluss + 10% auf Verbrauchserlöse | 24 Monate ab Vertragsbeginn |
| Vertriebspartner (sales_partner) | 10% auf alle Erlöse (Grundgebühr + Verbrauch) | Unbegrenzt, solange Vertrag aktiv |
| Tippgeber | 200 € Einmalzahlung, manuell durch Admin ausgelöst | Einmalig nach Erreichen von 500 € kumuliertem Erlös |
| Sprint-Bonus (AD) | +150 € pro Vertrag (= 250 € gesamt) wenn ≥ 25 Abschlüsse bis 31.12.2026 | bis 31.12.2026 |

---

## Datenbankänderungen (1 Migration)

**Tabelle `commission_payouts`** – neue Felder:
- `commission_role` text → `'ad'`, `'sales_partner'`, `'tippgeber'`
- `payout_trigger` text → `'contract_signup'`, `'usage_revenue'`, `'tippgeber_milestone'`
- `contract_start_date` date → für 24-Monats-Prüfung

**Neue Tabelle `tippgeber_milestone_tracking`**:
```sql
id, tippgeber_id, contract_id, cumulative_revenue, milestone_reached, 
milestone_reached_at, payout_triggered, created_at
```
RLS: Admin kann alles, Tippgeber sehen eigene Einträge.

**Tabelle `contracts`** – neues Feld:
- `tippgeber_id` uuid → wird bei Lead-Konvertierung übertragen (Spalte existiert schon in `leads`)

---

## Betroffene Dateien

### 1. `supabase/functions/auto-invoice/index.ts`
Aktuellen Provisionsblock (Zeilen 456–496) ersetzen durch eine Funktion `createGoaeCommissions(contract, invoice, netAmount, usageNetAmount, isFirstInvoice)`:

```
Falls contract.product_name enthält 'GOÄ' oder 'GOA':
  → Neue Logik (rollenbasiert, siehe unten)
Sonst:
  → Bestehende product_commissions-Logik (unverändert)
```

**GOÄ-Logik im Detail:**

1. **AD-Provision** (wenn `sales_partner_id` einen User mit Rolle `user`, `regional_lead` oder `sales_lead` hat):
   - Bei erster Rechnung: Festbetrag 100 € (payout_trigger = `contract_signup`)
     - Sprint-Check: Vertragsanzahl des AD >= 25 bis 31.12.2026 → 250 € statt 100 €
   - Bei jeder Rechnung: 10% auf `usageNetAmount` (nur Verbrauchspositionen, nicht Grundgebühr), solange `invoice_date <= contract.start_date + 24 Monate`
   
2. **Vertriebspartner-Provision** (wenn `sales_partner_id` einen User mit Rolle `sales_partner` hat):
   - 10% auf gesamten `netAmount` (Grundgebühr + Verbrauch)
   - Nur wenn Vertrag `status = 'aktiv'`

3. **Tippgeber-Meilenstein** (wenn `contracts.tippgeber_id` gesetzt):
   - Kumulierten Nettobetrag aus allen Rechnungen dieses Vertrags berechnen
   - Wenn >= 500 € und noch kein Milestone-Eintrag vorhanden → Eintrag in `tippgeber_milestone_tracking` anlegen (Auszahlung selbst erfolgt manuell durch Admin)

### 2. Migration: DB-Änderungen
Neue Migration-Datei für:
- `ALTER TABLE commission_payouts ADD COLUMN commission_role text, payout_trigger text, contract_start_date date`
- `CREATE TABLE tippgeber_milestone_tracking` mit RLS
- `ALTER TABLE contracts ADD COLUMN tippgeber_id uuid`

### 3. `src/components/leads/LeadDetailDialog.tsx`
Bei Konvertierung eines Leads zu einem Vertrag: `lead.tippgeber_id` → `contracts.tippgeber_id` übernehmen.

### 4. `src/pages/vertrieb/Provisionen.tsx`
- Tab "Provisionssätze": Neue Section "HFX GOÄ-Regelwerk" mit beschreibenden Cards (nicht editierbar, da fix im Code)
- Tippgeber-Meilenstein-View: Admins sehen `tippgeber_milestone_tracking` und können Auszahlungen manuell auslösen
- Tippgeber-eigene Ansicht: Fortschrittsanzeige zur 500 €-Schwelle

---

## Was bleibt unverändert

- Alle anderen Produkte (HFX EBM, Benchmark, Wingmann etc.) laufen weiterhin über die bestehende `product_commissions`-Tabelle
- Bestehende `commission_payouts` bleiben unverändert, neue Felder sind `nullable`
- Sprint-Konfiguration bleibt in `product_commissions` (Festbetrag-Typ mit Sprint-Feldern)
