
## Bestandsaufnahme (1–7)

**1. `contract_provider_status` Lese-/Schreibstellen**
- Hook **existiert sauber:** `src/hooks/useProviderStatus.ts` → `useProviderStatusMap` + `useProductProviderFlags`. Wiederverwendbar.
- Lesestellen: nur `src/pages/PraxenJourney.tsx` (Z. 30/35/747/946–947/1025/1171–1182). **Kein** Read im Kunden-Tab `src/pages/vertrieb/Vertraege.tsx` heute.
- Schreibstellen: `qodia-status-sync` (UPDATE sync/registration), Trigger `trg_usage_charges_recompute_qodia` + RPC `recompute_contract_provider_usage` (usage-Aggregate). Sauber getrennt.
- **Sauber, erweiterbar.**

**2. `qodia-status-sync`**
- Probt Qodia-Sign-Up; setzt `sync_status` (`transferred`/`error`/`not_started`) + `registration_status` (`registered`/`invited` — **nie `active`** by design).
- Auth: CRON_SECRET_2 oder anon-Bearer. Service-Role-Client.
- Mapping „4-Stufen" passt **rein im Frontend**, kein Function-Change nötig.
- **Sauber, kein Refactor.**

**3. Stripe-Webhook**
- `handleSepaMandateSetup` (Z. 841) **existiert** und ist aktiv.
- `handleContractActivation` (Z. 658) existiert, ist als No-Op-Branch im Phase-2-Sinn (kein Doc-Versand mehr), schreibt aber Audit. Wir hängen einen `qodia-status-sync?contract_id=...`-Aufruf in **`handleSepaMandateSetup`** ein (idempotent, fire-and-forget). In `handleContractActivation` bewusst **nicht** — der Trigger nach Mandat ist der natürlichere Punkt.

**4. Backfill**
- **2 aktive HFX-GOÄ-Verträge.** Triviale Größenordnung — kein Rate-Limit nötig. Backfill = einmaliger Function-Aufruf ohne `contract_id` (läuft eh über alle).

**5. Settings-Speicherort**
- Es gibt **nur** `integration_settings` (user-scoped, falsche Semantik).
- **Keine** generische `app_settings`/`feature_flags`-Tabelle. → **Neu anlegen** `app_settings(key text PK, value jsonb, updated_by, updated_at)`, RLS: alle authentifizierten lesen, nur admin schreiben.

**6. `QodiaIcon` aktuelle Anzeigen**
- Inline-Komponente nur in `PraxenJourney.tsx` (Z. 60 def, Z. 630 render — Lead-Reihen).
- `Interessenten.tsx` (in `src/pages/`, **nicht** `vertrieb/`) zeigt eigene Inline-Logik (Z. 642ff) mit `qodia_synced` + Tooltip „Bei Qodia registriert".
- `LeadDetailDialog.tsx` (Z. 375): rendert `qodia_synced` als Boolean-Feld in einer Tabelle (kein Icon, sondern als „Synchronisations-Status"-Zeile).
- `Vertraege.tsx`: liest `qodia_synced` der Leads in eine Map (Z. 567–578) — **nutzt es aber nirgends im JSX**. **Toter Code-Pfad**, wir entfernen ihn nicht eigenmächtig — **markiert zur Entscheidung**.
- **Hinweis:** Die Aufgabe nennt `src/pages/vertrieb/Interessenten.tsx` — die Datei existiert nicht (siehe `App.tsx` Z. 19, „removed"). Wir korrigieren auf `src/pages/Interessenten.tsx`.

**7. Audit-Mechanik**
- Generelle App-Audit: `audit_logs` Tabelle existiert (Edge-Functions schreiben dorthin).
- `contracts` hat `created_by`, kein `updated_by`.
- `contract_provider_status` hat **keine** `manual_set_by`/`manual_set_at`/`auto_overridden_at` → **Migration nötig**.

### Status-Bewertung
- **Sauber/wiederverwendbar:** `useProviderStatus`, `QodiaStatusBadges` (Detail/Usage/LastActivity), `qodia-status-sync`, `recompute_contract_provider_usage`.
- **Tot/unsauber (zur Entscheidung, nicht eigenmächtig löschen):**
  - `Vertraege.tsx` Z. 567–593: lädt `qodiaSyncMap` ohne JSX-Verwendung. Empfehlung: löschen, aber wartet auf Freigabe.
  - `QodiaIcon` in `PraxenJourney.tsx` Z. 60–93: bleibt für Lead-Reihen, wird per Anzeige-Bedingung auf „Lead ohne aktiven Vertrag" eingeschränkt (G).

---

## Plan vor dem Bau

### Variantenwahl bei unklaren Punkten

| Punkt | Variante A | Variante B | **Wahl** |
|---|---|---|---|
| Settings-UI Standort | Eigene Admin-Seite | Sektion in `admin/Settings.tsx` | **B** — Sektion „Aktivitäts-Schwellen" in bestehender Settings-Seite (geringere Navigation-Last) |
| EBM-Toggle Standort | Vertrags-Detail-Modal in `Vertraege.tsx` | Kunden-Tab in `PraxenJourney.tsx` | **A** wie Aufgabe — aber nur wenn EBM-Modal existiert; sonst Fallback Kunden-Tab |
| Trigger nach Mandat | Inline `await fetch(...)` im Webhook | DB-Trigger | **Inline fire-and-forget** mit kurzem Timeout, idempotent |
| `app_settings` Wert-Format | jsonb | text | **jsonb** (zukunftssicher) |

### Dateien, die ich anfassen werde
- **Neu:** `src/components/pipeline/OnboardingStatus.tsx` — `OnboardingBadge` (4 Stufen + Überfällig-Logik), `OnboardingCell` (Multi-Produkt), `ActivityCell` (GOÄ-Ampel oder „—" für EBM).
- **Neu:** `src/hooks/useAppSettings.ts` — liest `app_settings.activity_thresholds` mit Defaults 30/60.
- **Edit:** `src/pages/PraxenJourney.tsx` — Spalten „Onboarding"/„Aktivität" via neue Komponenten ersetzen; bestehende `QodiaStatusCell` im **Kunden-Tab** ersetzen, Pipeline-Tab unverändert lassen (separate Spalte ist dort eine andere Anforderung).
- **Edit:** `src/pages/Interessenten.tsx`, `src/components/leads/LeadDetailDialog.tsx`, `src/pages/PraxenJourney.tsx` (Lead-Reihen) — Anzeige-Bedingung „nur Leads ohne aktiven Vertrag", Tooltip-Label „Qodia-Account angelegt".
- **Edit:** `src/pages/vertrieb/Vertraege.tsx` — EBM-Vertrag „Als einsatzbereit markieren"-Button im Edit-Modal; Wert-Schreibung über RPC oder direktes Update mit `manual_set_by`/`manual_set_at`.
- **Edit:** `src/pages/admin/Settings.tsx` — neue Sektion „Aktivitäts-Schwellen" (zwei Number-Inputs + Save).
- **Edit:** `supabase/functions/stripe-webhook/index.ts` (`handleSepaMandateSetup`) — fire-and-forget Trigger zu `qodia-status-sync?contract_id=...`.

### Migrationen (zwei)
1. **Audit-Spalten** in `contract_provider_status`:
   - `manual_set_by uuid`, `manual_set_at timestamptz`, `auto_overridden_at timestamptz`.
2. **`app_settings`**-Tabelle:
   - `key text PK, value jsonb, updated_by uuid, updated_at timestamptz`
   - RLS: SELECT für alle authentifizierten, ALL für admin.
   - Seed: `('activity_thresholds', '{"yellow_days":30,"red_days":60}')`.
3. **HFX EBM Provider-Flag**:
   - `UPDATE products SET provider_flags = jsonb_set(coalesce(provider_flags,'{}'),'{honorarplus}','true') WHERE name = 'HFX EBM';`
   - (Nur so erkennt das Frontend EBM als Onboarding-pflichtiges Produkt; `contract_uses_provider(_, 'honorarplus')` funktioniert dann).
4. **Cron-Job** `qodia-status-sync-daily` täglich 04:30 UTC via `pg_cron` + `net.http_post` mit `x-cron-secret`. Da diese SQL projekt-spezifisch ist (URL/Secret), läuft sie über das **insert-Tool**, nicht als Migration.

### Mapping-Logik (Frontend, ohne Schema-Change)
```
sync='transferred' && reg in ('registered','active')          → "Einsatzbereit" (success)
sync='transferred' && reg = 'invited'                         → "In Einrichtung" (blue)
sync='error'                                                  → "Fehler" (destructive)
sonst                                                         → "Offen" (muted)
Überfällig (orange-Akzent): Stufe ∈ {Offen, In Einrichtung}
                            AND now() - cps.created_at > 7 Tage
EBM ohne cps-Row: Onboarding="Offen"; nach Klick=Einsatzbereit (manual_set_by/at gesetzt)
```

### Was UNANGETASTET bleibt
- `qodia-status-sync` Function-Logik (nur **gerufen** von Webhook + Cron, kein Code-Change).
- `recompute_contract_provider_usage`, Trigger, `usage_charges`.
- Stripe-Webhook außer dem zusätzlichen fire-and-forget Aufruf in `handleSepaMandateSetup`.
- Andere Mail-Templates, Pipeline-Tab-Anzeige (PraxenJourney „Abschlussphase"), Detail-Dialog `QodiaDetailBlock`.
- `Vertraege.tsx` toter `qodiaSyncMap`-Pfad — bleibt liegen bis Freigabe.

### Test-Szenarien (rechnerisch nach Bau)
1. **GOÄ aktiv, reg=`active`, last_usage 31.03.2026** (heute 12.05.) → Onboarding **🟢 Einsatzbereit**, Aktivität **🔴 41 Rg · vor 41 T** (rote Schwelle ab 60 → Empfehlung: Schwelle für „inaktiv" prüfen; mit Defaults 30/60 ist 41 T = gelb. Korrektur: 41 T zwischen yellow=30 und red=60 → 🟡, nicht 🔴. Falls red gewünscht ist, Schwelle auf 40 setzen).
2. **EBM frisch heute angelegt** → Onboarding **⚪ Offen** (grau, < 7 T), Aktivität **„—"**.
3. **EBM vor 10 T angelegt, kein Toggle** → Onboarding **🟠 Offen (überfällig)**, Aktivität **„—"**.
4. **Mix GOÄ+EBM** → zwei Mini-Zeilen pro Spalte mit Labels „GOÄ"/„EBM".
5. **Manueller Klick EBM** → cps-Row insert/update mit `sync='transferred'`, `reg='active'`, `manual_set_by=auth.uid()`, `manual_set_at=now()` → 🟢 Einsatzbereit; Audit-Symbol mit Hover „Manuell gesetzt von [Name] am [Datum]".
6. **Cron**: Nach Setup Cron sichtbar in `cron.job`, nach Backfill `last_sync_at` für die 2 GOÄ-Verträge gefüllt.
7. **Lead-Tab**: Lead `qodia_synced=true` ohne Vertrag → Icon sichtbar; Lead mit aktivem Vertrag → ausgeblendet.

### Reihenfolge der Ausführung
1. Migration 1+2 (Audit-Spalten + `app_settings`) → User-Approval.
2. Migration 3 + Cron + Backfill (insert-Tool, da projekt-spezifisch) → User-Approval.
3. Frontend-Komponenten + Hook + Settings-UI.
4. EBM-Toggle in Vertrags-Modal.
5. Lead-Tab-Konsolidierung (3 Stellen).
6. Webhook-Trigger.
7. Verifikation: rechnerisch + Smoke via DB-Read.

**Bitte freigeben. Ich starte danach mit den Migrationen.**
