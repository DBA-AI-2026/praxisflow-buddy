# Drift-Record: `salesforce-auto-sync`

> **Status:** offener Repo-Drift, benannt — nicht geschlossen.
> **Aufgenommen:** 2026-06-03
> **Betrifft:** Edge Function `salesforce-auto-sync` (nur in Production) + Cron `salesforce-auto-sync-12h`

---

## Worum es geht

Es existiert eine in Supabase deployte Edge Function `salesforce-auto-sync`, die **nicht im Repo** liegt. Sie geht bei jedem DB-/Function-Restore verloren, weil keine Quelle im Versionsstand existiert, aus der sie wiederhergestellt würde. Das ist der Drift.

Aktuell ist die Funktion **inert**: `salesforce_connections.is_connected = false`, sie synct nichts. Der Verlust bei einem Restore beträfe also heute eine Funktion ohne Wirkung — das Risiko ist prinzipiell, nicht akut.

---

## Was gesichert ist (verifiziert)

### Existenz
- Live-Curl gegen `https://gvsxentbbzuyanqbqvea.supabase.co/functions/v1/salesforce-auto-sync`
  → HTTP 200, Body: `{ "error": "Salesforce-Verbindung nicht aktiv", "failed": 0, "synced": 0 }`
- Im Repo: **kein** Verzeichnis `supabase/functions/salesforce-auto-sync/`, **kein** Eintrag in `supabase/config.toml`.

### Cron-Job (aus `cron.job`, jobid = 1)
| Feld | Wert |
|---|---|
| jobname | `salesforce-auto-sync-12h` |
| schedule | `0 */12 * * *` (alle 12 h, 00:00 / 12:00 UTC) |
| active | `true` |
| command | `net.http_post` an `…/functions/v1/salesforce-auto-sync` |
| Auth | statischer anon-Bearer-JWT direkt im `Authorization`-Header (**nicht** das `get_cron_secret()`/`x-cron-secret`-Vault-Muster der Qodia-Jobs) |
| Body | `{"trigger":"cron"}` |

> Hinweis: Der anon-Key in diesem Command steht bereits in committeten Qodia-Migrationen — kein neuer Secret-Leak, wenn er später in eine Salesforce-Migration wandert.

### Bauart (aus Response-Form abgeleitet, nicht aus Source)
- Gibt `synced`- und `failed`-Zähler zurück → **Batch-Sync**, iteriert über eine Datensatzmenge und pusht nach Salesforce.
- Nutzt denselben Connection-Check und dieselbe deutsche Fehlermeldung wie `salesforce-sync-price` (`"Salesforce-Verbindung nicht aktiv"`).
- **Unbekannt bleibt:** welche Objekte gesynct werden (Leads? Customers? Contracts?), Feld-Mapping, Richtung im Detail. Hierzu wird **nicht** geraten.

---

## Warum der Source nicht beschaffbar war (Stand 2026-06-03)

Keiner der verfügbaren Wege konnte den deployten Quelltext lesen:

- **Lovable:** nur `deploy` (schreibt), `curl` (ruft auf), `logs`, `delete` — kein Source-Read-Tool.
- **Projekt-Eigner (Dani):** kein Supabase-Dashboard-Zugriff, keine CLI.
- **Claude:** sieht nur den synchronisierten Repo-Stand, keine Live-Function.

Verbleibende Beschaffungswege (beide erfordern Zugriff, der aktuell fehlt):
1. **Git-History** — falls die Funktion je von Lovable aus dem Repo deployt wurde, liegt sie in der Commit-Historie von `DBA-AI-2026/praxisflow-buddy`. Jemand mit lokalem Klon:
   ```
   git log --all --full-history --oneline -- 'supabase/functions/salesforce-auto-sync/*'
   git show <commit-hash>:supabase/functions/salesforce-auto-sync/index.ts
   ```
2. **Supabase-Zugriff** — wer die Funktion ursprünglich deployt hat, kann sie ziehen:
   - Dashboard → Edge Functions → `salesforce-auto-sync` → Tab „Code"
   - CLI: `supabase functions download salesforce-auto-sync --project-ref gvsxentbbzuyanqbqvea`

---

## Auflöseplan

### Variante 1 — Source taucht doch auf (bevorzugt)
Sobald jemand mit Zugriff/Klon den Quelltext liefert:
1. Quelltext **verbatim** als `supabase/functions/salesforce-auto-sync/index.ts` ins Repo (keine Edits, kein Refactor, keine „Verbesserung").
2. Eintrag `[functions.salesforce-auto-sync]` in `supabase/config.toml` ergänzen.
3. Neue Migration, die `salesforce-auto-sync-12h` **verbatim** re-deklariert (idempotenter `unschedule`→`schedule`, exakt obiger Schedule/Command), damit der Cron restore-sicher wird.
→ Drift geschlossen, ohne je geraten zu haben.

### Variante 2 — Source bleibt unerreichbar
In die ohnehin anstehende **Salesforce-Neukonzeption** falten (offen: was wird gesynct, in welche Richtung):
1. Sync-Funktion **frisch im Repo** mit bekanntem Spec neu bauen.
2. Die verwaiste Production-Funktion im selben Zug **löschen**, damit Repo und Production wieder übereinstimmen.
→ Drift geschlossen durch Neubau + Retirement, statt durch Rekonstruktion.

### Was NICHT getan wird
- **Kein** isoliertes Committen der Cron-Migration ohne die Funktion — sie würde nach Restore alle 12 h ins Leere (404) feuern.
- **Kein** Nachbau der Funktion „nach Gefühl" zum Zweck der Drift-Schließung. Gleicher Name + anderer Inhalt wäre schlimmer als der jetzige, ehrliche Drift.

---

## Verweise
- Schwester-Funktionen im Repo: `salesforce-auth`, `salesforce-callback`, `salesforce-sync-price`
- Tabelle: `salesforce_connections` (Singleton `id = 'default'`)
- Bestehende Dashboard→SF-Pfade (kein Drift): `capture-lead` (Lead-Push), `salesforce-sync-price` (Preis-Push)
