

## Plan: Sprint-Bonus-Felder für "Festbetrag pro Abschluss"

### Was gebaut wird

Im Dialog "Provisionssatz erstellen/bearbeiten" wird unterhalb des Betrags-Felds ein neuer **SPRINT**-Bereich angezeigt, aber **nur** wenn das Provisionsmodell "Festbetrag pro Abschluss" ausgewählt ist. Dieser Bereich enthält:

- **Anfangsdatum** (Datepicker)
- **Enddatum** (Datepicker)
- **Ziel 1**: >= Menge (Zahl)
- **Ziel 2**: Menge >= (Zahl)
- **Sprint-Bonus 1**: xxx € (Zahl)
- **Sprint-Bonus 2**: xxx € (Zahl)

### Datenbankänderung

Neue Spalten in `product_commissions`:

```sql
ALTER TABLE product_commissions
  ADD COLUMN sprint_start date,
  ADD COLUMN sprint_end date,
  ADD COLUMN sprint_target_1 integer,
  ADD COLUMN sprint_target_2 integer,
  ADD COLUMN sprint_bonus_1 numeric DEFAULT 0,
  ADD COLUMN sprint_bonus_2 numeric DEFAULT 0;
```

Alle Spalten nullable, keine Pflichtfelder – Sprint ist optional.

### Frontend-Änderung

**Datei: `src/pages/vertrieb/Provisionen.tsx`**

1. **`ProductCommission` Interface erweitern** um die 6 neuen Felder
2. **`form` State erweitern** um Sprint-Felder (Defaults: null/0)
3. **Im Dialog** (Zeile ~660): Wenn `form.commission_type === "festbetrag"`, einen neuen Abschnitt "SPRINT" mit Separator rendern:
   - 2 Datepicker nebeneinander (Anfang/Ende)
   - 2 Zahl-Inputs nebeneinander (Ziel 1 / Ziel 2)
   - 2 Zahl-Inputs nebeneinander (Sprint-Bonus 1 / Sprint-Bonus 2)
4. **`saveMutation`** erweitern: die 6 Sprint-Felder beim Insert/Update mitspeichern
5. **`openEditDialog`** erweitern: Sprint-Felder aus bestehendem Eintrag laden
6. **Tabelle** (optional): Aktive Sprints als kleine Badge/Info in der Provisionssatz-Tabelle anzeigen

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| Migration (SQL) | 6 neue Spalten in `product_commissions` |
| `src/pages/vertrieb/Provisionen.tsx` | Interface, Form-State, Dialog-UI, Save-Logik |

