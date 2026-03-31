# Vertriebsrollenmodell – Technische Dokumentation

> Stand: 2026-03-31 | Autor: System

---

## 1. Rollenübersicht

| Rolle | DB-Wert (`app_role`) | Beschreibung | Vertragsverantwortung |
|---|---|---|---|
| Festangestellter AD (Gebietsleiter) | `user` | Interner Außendienst, Gebietsverantwortung | ✅ Ja |
| Vertriebspartner | `sales_partner` | Externer Partner, eigenständig | ✅ Ja |
| Tippgeber | `tippgeber` | Empfehlungsgeber, immer einem Partner zugeordnet | ❌ Nein |

---

## 2. Relevante Tabellen & Felder

### `user_roles`
- `user_id` (uuid) → Referenz auf `auth.users`
- `role` (app_role) → Enum: `admin`, `sales_lead`, `regional_lead`, `user`, `sales_partner`, `tippgeber`, `vertragsabteilung`
- `is_active` (boolean, default `true`) → Soft-Delete / Deaktivierung

### `profiles`
- `user_id`, `full_name`, `email`
- Wird über `handle_new_user()`-Trigger automatisch bei Registrierung angelegt.

### `tippgeber_partner_assignments`
- `tippgeber_user_id` (uuid, unique) → Der Tippgeber
- `partner_user_id` (uuid) → Der zugeordnete Vertriebspartner
- `is_active` (boolean)
- `notes` (text)
- **Unique-Constraint auf `tippgeber_user_id`** → 1:1-Zuordnung

### `contracts`
- `sales_partner_id` (uuid) → Verantwortlicher Vertriebspartner/AD
- `sales_partner_name` (text) → Anzeigename (Denormalisierung für Performance)
- `tippgeber_id` (uuid) → Optional, falls Lead über Tippgeber kam
- `created_by` (uuid) → Ersteller (eingeloggter User)

---

## 3. Fachliche Regeln (technisch erzwungen)

| Regel | Ebene | Mechanismus |
|---|---|---|
| Vertriebspartner dürfen Verträge verantworten | UI + DB | Combobox filtert nach `sales_partner`, `user`, `regional_lead`, `sales_lead` |
| **Tippgeber dürfen NICHT als Vertragsverantwortliche eingetragen werden** | DB | Trigger `prevent_tippgeber_as_sales_partner` auf `contracts` (INSERT/UPDATE) |
| **Tippgeber müssen einem Vertriebspartner zugeordnet sein** | DB | Trigger `enforce_tippgeber_partner_assignment` auf `user_roles` (INSERT/UPDATE) |
| Inaktive Partner sind in neuen Formularen nicht auswählbar | UI | `.eq("is_active", true)` bei Partner-Queries |
| Historische Daten bleiben erhalten | Design | Soft-Delete via `is_active = false`, keine physische Löschung |

---

## 4. Aktive Trigger & Schutzmechanismen

### `enforce_tippgeber_partner_assignment`
- **Tabelle:** `user_roles` (BEFORE INSERT OR UPDATE)
- **Logik:** Wenn `role = 'tippgeber'`, prüft ob ein Eintrag in `tippgeber_partner_assignments` existiert.
- **Fehler:** `'Tippgeber müssen einem Vertriebspartner zugeordnet sein.'`

### `prevent_tippgeber_as_sales_partner`
- **Tabelle:** `contracts` (BEFORE INSERT OR UPDATE)
- **Logik:** Wenn `sales_partner_id` gesetzt, prüft ob die referenzierte Person die Rolle `tippgeber` hat.
- **Fehler:** `'Tippgeber dürfen nicht als Vertragsverantwortlicher eingetragen werden.'`

---

## 5. UI-Filter & Komponenten

### Vertragsformular (`Vertraege.tsx`)
- **`SalesPartnerCombobox`**: Lädt aktive Benutzer mit Rollen `sales_partner`, `user`, `regional_lead`, `sales_lead`.
- Tippgeber werden explizit ausgeschlossen.
- Inaktive Partner (`is_active = false`) werden gefiltert.
- Gibt `user_id` + `full_name` zurück → werden als `sales_partner_id` / `sales_partner_name` gespeichert.
- **Kein Fallback auf `user?.id`** → wenn kein Partner ausgewählt, wird `null` gespeichert.

### Lead-Formular (`CreateLeadDialog.tsx`)
- Zeigt Rollenbezeichnung nach dem Namen: `"Max Müller — Vertriebspartner"`
- Tippgeber werden mit Partnerzuordnung angezeigt: `"Lisa Schmidt — Tippgeber von Max Müller"`
- Filtert inaktive Benutzer aus.

### Partneranlage (`CreatePartnerDialog.tsx`)
- Pflichtfeld "Zugehöriger Vertriebspartner" erscheint nur bei Rolle `tippgeber`.
- Client-seitige Validierung + DB-Trigger als doppelte Absicherung.

### Vertrieblerübersicht (`Vertriebler.tsx`)
- Deaktivierung statt Löschung (Soft-Delete).
- Reaktivierung möglich.
- Tippgeber-Zuordnung wird in der Liste angezeigt.

---

## 6. Provisionslogik

- `commission_payouts.sales_partner_id` referenziert den Vertriebspartner.
- Provisionen werden dem in `contracts.sales_partner_id` hinterlegten Partner zugeordnet.
- Da `sales_partner_id` jetzt korrekt den ausgewählten Partner speichert (nicht den eingeloggten User), ist die Provisionszuordnung fachlich korrekt.

---

## 7. Admin-Handbuch

### Neuen Vertriebspartner anlegen
1. Navigation: **Vertrieb → Vertriebler**
2. Button **"Neuer Partner"** → Dialog öffnet sich
3. Name, E-Mail eingeben, Rolle **"Vertriebspartner"** auswählen
4. Zugangsdaten werden automatisch generiert und per E-Mail versendet

### Neuen Tippgeber anlegen
1. Navigation: **Vertrieb → Vertriebler**
2. Button **"Neuer Partner"** → Dialog öffnet sich
3. Rolle **"Tippgeber"** auswählen → Pflichtfeld "Zugehöriger Vertriebspartner" erscheint
4. Vertriebspartner auswählen (Pflicht!)
5. Zugangsdaten werden automatisch generiert

### Partner deaktivieren
1. In der Vertrieblerübersicht auf das Kontextmenü (⋮) des Partners klicken
2. **"Deaktivieren"** wählen → Bestätigungsdialog
3. Partner ist in neuen Formularen nicht mehr auswählbar
4. Historische Verträge/Leads bleiben unverändert

### Partner reaktivieren
1. Filter auf "Inaktiv" setzen oder alle anzeigen
2. Kontextmenü → **"Reaktivieren"**
3. Partner ist sofort wieder in Formularen verfügbar

### Fachliche Grenzen
- Ein Tippgeber kann **nicht** ohne Vertriebspartner-Zuordnung existieren (DB-Trigger verhindert dies)
- Ein Tippgeber kann **nicht** als Vertragsverantwortlicher eingetragen werden (DB-Trigger verhindert dies)
- Deaktivierte Partner verlieren keine historischen Daten
- Die Rolle `vertragsabteilung` ist aktuell stillgelegt
