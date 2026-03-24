
## Analyse des IST-Zustands

### Kernprobleme
1. **Keine `customers`-Tabelle** – Kundenstammdaten leben in `contracts` (Felder: `vorname`, `nachname`, `praxis`), `leads`, und `praxen` (veraltet, redundant).
2. **`hfx_customer_number`** ist bereits produktiv im Format `HFX-I01000` (via `auto_assign_lead_hfx_number`-Trigger). Diese Nummer darf nicht geändert werden.
3. **Kein `contract_number`** – Verträge haben keine eigene lesbare Nummer.
4. **Kein `contract_cases`-System** – operative Vorgänge sind nicht modelliert.
5. **`praxen`-Tabelle** ist ein veraltetes Konstrukt; die `/praxen`-Seite mergt manuell Daten aus `praxen` + `contracts`.
6. **`Vertraege.tsx`** ist 3155 Zeilen – sie übernimmt Kundenstammdaten direkt und würde von einer sauberen Trennung profitieren.

### Was NICHT geändert wird (Stabilität)
- `hfx_customer_number`-Format (`HFX-I01000`) bleibt exakt so
- `auto-invoice`, `qodia-usage-query` und alle Edge Functions laufen weiterhin via `hfx_customer_number`
- `contracts`-Tabelle bleibt die primäre Tabelle – keine Breaking Changes
- `praxen`-Tabelle bleibt für Kompatibilität erhalten

---

## Zielbild: 3-Ebenen-Architektur

```text
customers (Stammdaten)
  hfx_customer_number = HFX-I01000  ← unveränderlich
  └── contracts (ein Vertrag pro Produkt)
        contract_number = HFX-I01000-V001
        └── contract_cases (Vorgänge)
              case_number = HFX-VG-2026-000471
```

---

## Phase 1: Datenbank-Migration

Eine einzige Migration mit:

**1. Neue Tabelle `customers`**
```sql
CREATE TABLE public.customers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hfx_customer_number text UNIQUE NOT NULL,  -- z.B. HFX-I01000
  praxis_name text,
  vorname text,
  nachname text,
  email text,
  telefon text,
  adresse text,
  plz text,
  ort text,
  mp_nr text,
  bsnr text,
  lanr text,
  salesforce_id text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
-- RLS: Admin alles, andere Rollen sehen Kunden deren Verträge sie sehen dürfen
```

**2. `contracts`: neue Spalten**
```sql
ALTER TABLE public.contracts
  ADD COLUMN customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN contract_number text UNIQUE;
```

**3. Sequenz + Trigger für `contract_number`**
```sql
-- Trigger: generiert HFX-I01000-V001 basierend auf customer.hfx_customer_number
-- Zähler: COUNT bestehender Verträge für diesen Kunden + 1
```

**4. Neue Tabelle `contract_cases`**
```sql
CREATE TABLE public.contract_cases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  case_number text UNIQUE NOT NULL,  -- HFX-VG-2026-000471
  customer_id uuid REFERENCES public.customers(id),
  contract_id uuid REFERENCES public.contracts(id),
  case_type text NOT NULL DEFAULT 'neuabschluss',
  -- neuabschluss | aenderung | upgrade | kuendigung | verlaengerung | support
  status text NOT NULL DEFAULT 'offen',
  -- offen | in_bearbeitung | abgeschlossen
  title text,
  notes text,
  created_by uuid,
  assigned_to uuid,
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE SEQUENCE public.case_number_seq START WITH 1;
-- Trigger: HFX-VG-YYYY-XXXXXX
ALTER TABLE public.contract_cases ENABLE ROW LEVEL SECURITY;
```

**5. Migrationsdaten: bestehende `contracts` → `customers`**
```sql
-- 1 customers-Zeile pro einzigartiger hfx_customer_number aus contracts
INSERT INTO customers (hfx_customer_number, praxis_name, vorname, nachname, email, ...)
SELECT DISTINCT ON (hfx_customer_number) hfx_customer_number, praxis, vorname, ...
FROM contracts WHERE hfx_customer_number IS NOT NULL;

-- FK setzen
UPDATE contracts SET customer_id = c.id
FROM customers c WHERE c.hfx_customer_number = contracts.hfx_customer_number;

-- contract_number vergeben (retroaktiv)
UPDATE contracts SET contract_number =
  hfx_customer_number || '-V' || LPAD(ROW_NUMBER() OVER (PARTITION BY hfx_customer_number ORDER BY created_at)::text, 3, '0')
WHERE hfx_customer_number IS NOT NULL;

-- Erster Vorgang pro Vertrag: Neuabschluss
INSERT INTO contract_cases (case_number, customer_id, contract_id, case_type, status, title, ...)
SELECT ... FROM contracts WHERE ...;
```

**6. RLS Policies**
- `customers`: Admin alles; `sales_lead`/`regional_lead` alles; `user`/`sales_partner` nur Kunden mit eigenem Vertrag; `tippgeber` nur eigene referrals
- `contract_cases`: gleiche Logik wie `contracts`

---

## Phase 2: UI-Änderungen

### 2a. Neue Seite `/kunden` + Sidebar-Link

Neue Datei `src/pages/Kunden.tsx`:
- Lädt aus `customers` (statt `praxen` + `contracts` mischen)
- Tabelle: HFX-Nr. | Praxis | E-Mail | Ort | Anzahl Verträge | Status
- Klick → Detailansicht mit **3 Tabs**:
  - **Stammdaten** (Adresse, Kontakt, MP-Nr.)
  - **Verträge** (Liste: `contract_number`, Produkt, Preis, Status)
  - **Vorgänge** (Liste: `case_number`, Typ, Status, Datum + Button "Neuer Vorgang")

Sidebar: neuer Eintrag "Kunden" unter Vertrieb (ersetzt /praxen visuell, /praxen bleibt weiter erreichbar als Alias).

### 2b. `src/pages/vertrieb/Vertraege.tsx`
- Neue Spalte `contract_number` in der Tabelle anzeigen (Format: `HFX-I01000-V001`)
- Filter nach `contract_number` ergänzen

### 2c. `src/pages/Praxen.tsx`
- Daten aus `customers`-Tabelle laden (statt `praxen` + `contracts` kombinieren)
- `contract_number` in der Detailansicht anzeigen

### 2d. Lead-Konvertierung (`src/components/leads/LeadDetailDialog.tsx`)
- Bei "Lead → Vertrag konvertieren": zuerst `customers`-Eintrag anlegen (oder bestehenden per `hfx_customer_number` finden), dann `customer_id` auf den neuen Vertrag setzen + automatisch einen `contract_cases`-Eintrag vom Typ `neuabschluss` erstellen

### 2e. `PaperContractDialog.tsx`
- Gleiche Logik: `customers`-Eintrag anlegen/finden bei Papiervertrag-Erfassung

---

## Phase 3: Kunden-Detailseite mit 3 Tabs

```text
/kunden → Kundenliste
/kunden/:id → Detailansicht
  Tab 1: Stammdaten (editierbar für Admin)
  Tab 2: Verträge  → contract_number, Produkt, Monatspreis, Status, Startdatum
  Tab 3: Vorgänge  → case_number, Typ, Status, erstellt von, Datum
                     + Button "Neuer Vorgang" (Typ, Notizen)
```

---

## Dateiübersicht

| Datei | Art |
|---|---|
| Migration (neu) | `customers`, `contract_cases`, Trigger, Sequenz, Migrationsdaten, RLS |
| `src/pages/Kunden.tsx` | **Neue Datei** – Kundenliste + 3-Tab-Detail |
| `src/App.tsx` | Route `/kunden` hinzufügen, `/kunden/:id` |
| `src/components/layout/Sidebar.tsx` | Link "Kunden" ergänzen |
| `src/pages/Praxen.tsx` | Daten aus `customers` laden |
| `src/pages/vertrieb/Vertraege.tsx` | `contract_number` Spalte anzeigen |
| `src/components/leads/LeadDetailDialog.tsx` | `customers`-Eintrag bei Konvertierung anlegen |
| `src/components/contracts/PaperContractDialog.tsx` | `customers`-Eintrag anlegen |

---

## Nummerierungslogik (konkret)

| Ebene | Format | Beispiel | Erzeugung |
|---|---|---|---|
| Kunde | `HFX-IXXXXX` | `HFX-I01000` | bereits vorhanden, unverändert |
| Vertrag | `HFX-IXXXXX-VXXX` | `HFX-I01000-V001` | DB-Trigger bei INSERT auf `contracts` |
| Vorgang | `HFX-VG-YYYY-XXXXXX` | `HFX-VG-2026-000471` | DB-Trigger mit Jahres-Sequenz |

---

## Migrations-Sicherheit

- Alle neuen Felder in `contracts` sind `NULLABLE` → keine bestehenden Inserts brechen
- `hfx_customer_number` in `contracts`, `leads`, `usage_charges` bleibt unverändert
- `praxen`-Tabelle bleibt; `/praxen`-Route bleibt als Fallback
- Edge Functions `auto-invoice`, `qodia-*` laufen weiterhin via `hfx_customer_number`

---

## Schritte in Reihenfolge

1. **DB-Migration**: `customers` + `contract_cases` + Trigger + Migrationsdaten
2. **Neue Seite `Kunden.tsx`**: Kundenliste + 3-Tab-Detail inkl. Vorgänge-Verwaltung
3. **App.tsx + Sidebar**: Route und Navigationslink
4. **Vertraege.tsx**: `contract_number` anzeigen
5. **LeadDetailDialog + PaperContractDialog**: `customers`-Eintrag bei Konvertierung
