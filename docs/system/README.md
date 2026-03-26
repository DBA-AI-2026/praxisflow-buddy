# HFX Systemdokumentation – Übersicht

> **Source of Truth für die HFX-Systemübersicht.**
> Die Mermaid-Dateien in diesem Verzeichnis sind die verbindliche, versionierte Systemdokumentation.

---

## Enthaltene Diagramme

| Datei | Version | Zielgruppe | Fokus |
|---|---|---|---|
| `hfx_system_overview_management.mmd` | v1.0 (2026-03-26) | Geschäftsführung, Management | Fachlicher Hauptprozess: Lead → Zahlung → FiBu |
| `hfx_system_overview_technical.mmd` | v1.0 (2026-03-26) | Entwicklung, IT | Module, Edge Functions, Tabellen, Integrationen |

---

## Dokumentationsregel (verbindlich)

### Wann müssen die Diagramme geprüft / aktualisiert werden?

Bei jeder Änderung an folgenden Bereichen ist zu prüfen, ob das betroffene Diagramm aktualisiert werden muss:

| Bereich | Management-Diagramm | Technisches Diagramm |
|---|---|---|
| Lead & Vertrieb (Leads, Tippgeber, PLZ-Zuweisung) | ✅ prüfen | ✅ prüfen |
| Kunde & Vertrag (contracts, customers, praxen) | ✅ prüfen | ✅ prüfen |
| Nutzung / Qodia / Usage (usage_charges, qodia-*) | – | ✅ prüfen |
| Abrechnung (auto-invoice, invoices, customer_revenues) | ✅ prüfen | ✅ prüfen |
| Stripe / Zahlung (stripe-webhook, processed_stripe_events) | ✅ prüfen | ✅ prüfen |
| Provisionen (commission_payouts, product_commissions) | ✅ prüfen | ✅ prüfen |
| FiBu-Vorbereitung (fibu_events, fibu_export_batches, Lexware) | ✅ prüfen | ✅ prüfen |
| Rollen & Zugriffe (user_roles, RLS, auth) | – | ✅ prüfen |
| Admin & Integrationen (Salesforce, Lexware, E-Mail-Einstellungen) | – | ✅ prüfen |

### Versionskonvention

- Format: `v<Major>.<Minor>` im Diagramm-Header (`title:`-Zeile) plus Datum
- **Minor-Bump**: bestehende Struktur erweitert, kein Prozesswechsel
- **Major-Bump**: grundlegender Prozessumbau oder neuer Hauptbaustein

### Commit-Hinweis

Änderungen an Diagrammen gehören in denselben Commit/PR wie die inhaltliche Änderung:

```
feat(fibu): Stornobuchung ergänzt

- Stornierungslogik in fibu_events implementiert
- docs/system/hfx_system_overview_technical.mmd v1.1 aktualisiert
```

---

## Änderungshistorie

| Version | Datum | Autor | Änderung |
|---|---|---|---|
| v1.0 | 2026-03-26 | Lovable / HFX | Initiale Erstellung nach FiBu-, Provisions- und Stripe-Vervollständigung |
