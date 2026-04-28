# HFX / PraxisFlow

Sales- und Abrechnungs-Portal für die HFX-Plattform — von der Lead-Erfassung über den Vertragsabschluss bis zur Provisions- und FiBu-Vorbereitung (Lexware-Export).

**Ziel:** Zentrale Steuerung aller Vertriebs-, Vertrags- und Abrechnungsprozesse für Zahnarztpraxen in einem System.

Das Projekt wird mit [Lovable](https://lovable.dev) entwickelt und läuft auf einem Vite-Frontend mit Supabase als Backend (Datenbank, Auth, Edge Functions). Externe Integrationen: Stripe (Zahlungen, SEPA), Lexware (FiBu), Salesforce (CRM), Qodia (Verbrauchsdaten), Resend (E-Mail).

---

## ⚠️ Vor jeder KI-gestützten Änderung lesen

Dieses Projekt enthält produktionskritische Bereiche (Zahlungs-Webhooks, Cron-Jobs, RLS-Policies, MFA-Auth, FiBu-Export). Damit KI-Tools (Lovable, Claude, Cursor, Copilot, etc.) diese nicht versehentlich beschädigen, gibt es zwei verbindliche Dokumente im Projekt-Root:

- **[`AI_GUARDRAILS.md`](./AI_GUARDRAILS.md)** — Regeln für jede KI-Änderung. Enthält die "Do-Not-Modify"-Bereiche, Branch- und PR-Vorgaben, Smoke-Test-Pflichten und Rollback-Strategien. **Vor jeder Änderung zu lesen.**
- **[`SAFE_CHANGE_PLAN.md`](./SAFE_CHANGE_PLAN.md)** — konkrete, nach Risiko sortierte Liste der erlaubten Änderungen in drei Kategorien:
  - 🟢 **Sicher / sofort möglich** (z. B. README, `.gitignore`, Unit-Tests für Utilities, UI-Texte)
  - 🟡 **Vorsichtig / nur mit Review** (z. B. große Page-Komponenten refactoren, CORS prüfen, Console-Logs auditieren)
  - 🔴 **Tabu ohne Backup und Testplan** (Stripe-Webhook, Edge Functions, RLS-Policies, Auth/MFA, Cron-Jobs, Lexware/Salesforce/Qodia-Integrationen)

Wenn die geplante Änderung in keiner Kategorie auftaucht, gilt sie als 🟡 oder 🔴 — im Zweifel höher einstufen.

Die verbindliche Systemdokumentation (Mermaid-Diagramme für Management- und Technik-Sicht) liegt unter [`docs/system/`](./docs/system/README.md).

---

## Tech-Stack

- **Frontend:** Vite, React 18, TypeScript, shadcn-ui, Tailwind CSS, React Router, React Query, react-hook-form, Zod
- **Backend (Supabase):** Postgres mit Row Level Security, Supabase Auth (inkl. TOTP-MFA für privilegierte Rollen), 35 Deno-basierte Edge Functions
- **Externe Dienste:** Stripe, Lexware, Salesforce (OAuth 2.0 PKCE), Qodia, Resend
- **PDF & Signatur:** `pdf-lib`, `pdfjs-dist`, `signature_pad`

---

## Lokale Entwicklung

Voraussetzung: Node.js & npm — [Installation via nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
# 1. Repository klonen
git clone <YOUR_GIT_URL>
cd praxisflow-buddy-main

# 2. Abhängigkeiten installieren
npm install

# 3. Environment-Variablen anlegen
# .env-Datei im Projekt-Root mit folgenden Variablen erstellen:
#   VITE_SUPABASE_URL=...
#   VITE_SUPABASE_PUBLISHABLE_KEY=...
#   VITE_SUPABASE_PROJECT_ID=...
# (Werte erhältst du vom Projekt-Owner. Hinweis: .env sollte in .gitignore stehen.)

# 4. Dev-Server starten (mit Hot Reload, Port 8080)
npm run dev

# Weitere Befehle:
npm run build       # Production-Build
npm run lint        # ESLint
npm run test        # Vitest (einmalig)
npm run test:watch  # Vitest (Watch-Modus)
```

Der Dev-Server läuft anschließend unter `http://localhost:8080`.

---

## Arbeiten am Projekt

**Über Lovable:** Direkt im [Lovable-Projekt](https://lovable.dev) prompten. Änderungen werden automatisch in dieses Repo committet.

**Lokal mit eigener IDE:** Repo klonen, Änderungen pushen — die werden ebenfalls in Lovable übernommen. Branch- und PR-Konventionen siehe `AI_GUARDRAILS.md` Abschnitt 5.

**Direkt auf GitHub:** Bearbeiten via Pencil-Icon oder GitHub Codespaces.

In allen Fällen gelten die Regeln aus `AI_GUARDRAILS.md` und `SAFE_CHANGE_PLAN.md`.

---

## Deployment & Domain

Deployment über Lovable: Share → Publish.
Custom-Domain: Project → Settings → Domains → Connect Domain ([Doku](https://docs.lovable.dev/features/custom-domain#custom-domain)).

---

## Projektstruktur (Kurzüberblick)

```
.
├── src/
│   ├── pages/              ← Routen-Komponenten (Dashboard, Pipeline, Buchhaltung, …)
│   ├── components/         ← UI-Komponenten (inkl. shadcn-ui)
│   ├── hooks/              ← useAuth, useUserRole, …
│   ├── lib/                ← supabaseClient, PDF-Generatoren, Validatoren
│   ├── config/             ← routePermissions
│   └── integrations/       ← auto-generierte Supabase-Types
├── supabase/
│   ├── functions/          ← 35 Edge Functions (Deno)
│   ├── migrations/         ← Versionierte SQL-Migrationen
│   └── config.toml         ← verify_jwt-Flags pro Function
├── docs/system/            ← Verbindliche Mermaid-Systemdiagramme
├── AI_GUARDRAILS.md        ← Regeln für KI-Änderungen ⚠️
├── SAFE_CHANGE_PLAN.md     ← Erlaubte Änderungskategorien ⚠️
└── README.md               ← diese Datei
```
