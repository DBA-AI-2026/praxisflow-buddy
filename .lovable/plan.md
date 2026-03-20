
## Plan: Qodia-Verbrauch – Neue Seite „Qodia-Verbrauch"

### Was gebaut wird

Eine neue Seite `/qodia-verbrauch` (Admin + Sales Lead) die den Live-Verbrauch aller aktiven Qodia-Kunden aus der Qodia-API abruft und übersichtlich anzeigt. Da die Qodia-API einen API-Key (`X-API-Key`) benötigt, läuft der Abruf über eine neue Edge Function, um den Key nicht im Frontend zu exponieren.

### Datenfluss

```text
Frontend (/qodia-verbrauch)
    │
    ▼
POST /functions/v1/qodia-usage-query
  Authorization: Bearer <Supabase session>
  { hfx_customer_number?, startDate?, endDate? }
    │
    ▼
Edge Function:
  1. Supabase-Auth prüfen (nur admin/sales_lead)
  2. Contracts-Tabelle → Email-Adressen der aktiven Kunden laden
  3. Für jeden Kunden: POST api.qodia.de/api/external/usage
  4. Ergebnisse zusammenführen
    │
    ▼
Frontend zeigt Tabelle:
  HFX-Nr | Kunde | Email | rechnungscheck | _mini | _standard | Gesamt
```

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `supabase/functions/qodia-usage-query/index.ts` | Neue Edge Function |
| `supabase/config.toml` | Neue Funktion eintragen (verify_jwt = true) |
| `src/pages/QodiaVerbrauch.tsx` | Neue Seite |
| `src/App.tsx` | Route `/qodia-verbrauch` hinzufügen |
| `src/components/layout/Sidebar.tsx` | Menüpunkt unter Administration |
| `src/config/routePermissions.ts` | Zugriffsrechte für neue Route |

### Seitenfeatures

- **Datumsfilter**: Standardmäßig aktueller Monat, frei wählbar
- **Einzelne oder alle Kunden**: Dropdown zum Filtern oder alle abrufen
- **Tabelle**: HFX-Nr., Kundenname, E-Mail, die 3 Metriken, Gesamtsumme
- **Lade-Indikator**: Da API-Calls je Kunde gemacht werden (parallelisiert)
- **Fehler-Handling**: Kunden ohne Qodia-Account werden mit Hinweis angezeigt

### Neue Edge Function `qodia-usage-query`

```typescript
// Für jeden aktiven Vertrag mit product_name = "HFX GOÄ..."
// → email aus contracts.email
// → POST https://api.qodia.de/api/external/usage
//   mit X-API-Key: QODIA_API_KEY (bereits als Secret vorhanden)
// → Ergebnis zurückgeben
```

Der `QODIA_API_KEY` ist bereits als Secret gesetzt – kein neuer Schlüssel nötig.

### Kein Datenbankschema-Änderung notwendig
