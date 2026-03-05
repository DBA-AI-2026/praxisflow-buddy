
## Analyse

Der bestehende Vertrag speichert Produkte in den Feldern `product_name` (kommaseparierter Text), `modules` (Array) und `selected_addon_modules` (Array). Es gibt keine separate Tabelle für "Vertragserweiterungen" — alle Änderungen laufen über `UPDATE` auf dem `contracts`-Datensatz.

**Das Problem:** Wenn ein bestehender Kunde später ein neues Produkt bucht, soll das nicht den alten Vertrag überschreiben — stattdessen soll es dokumentiert werden als eigenständige **Erweiterung** mit eigenem Datum, eigener Unterschrift und eigenem PDF.

## Lösung: "Vertragsergänzung" als Nachtrag

### Konzept
Ein neuer separater Dialog: **"Vertrag erweitern"** — erscheint als Menüpunkt im Kontextmenü aktiver/gezeichneter Verträge. Er erstellt einen **neuen Vertrag** mit dem gleichen Kunden, aber nur für das zusätzliche Produkt — und verlinkt diesen als `parent_contract_id` auf den ursprünglichen Vertrag.

Das ist die professionellste Lösung weil:
- Der Originalvertrag bleibt unberührt (unveränderlich, auditierbar)
- Jede Erweiterung hat ein eigenes Datum und eigene Signaturen
- In der Tabelle erscheint ein "Nachtrag"-Badge statt eines neuen Kundendatensatzes
- Keine DB-Migrationsrisiken (einfaches neues Textfeld `parent_contract_id`)

### Umsetzung

#### 1. DB-Migration
```sql
ALTER TABLE contracts ADD COLUMN parent_contract_id uuid REFERENCES contracts(id);
```
Ein neues optionales Feld. Kein Bruch mit bestehenden Datensätzen.

#### 2. UI: Kontextmenü-Eintrag
Im `DropdownMenu` jedes aktiven/gezeichneten Vertrags wird ein neuer Eintrag hinzugefügt:
```
📋  Produkt hinzubuchen
```
Nur sichtbar bei Status `aktiv` oder `gezeichnet`.

#### 3. "Erweiterungs-Dialog"
Ein separater, schlanker Dialog (deutlich kürzer als der Vollvertrag):
- Zeigt oben einen **readonly Infoblock** des Stammvertrags (Kunde, Praxis, bestehende Produkte)
- Ermöglicht die Auswahl **nur neuer Produkte** (bereits gebuchte Produkte werden ausgegraut)
- Felder für: Vertragsbeginn des neuen Produkts, Preis, Unterschriften (digital oder Papier)
- Fußzeile: "Nachtrag zeichnen" / "Als Entwurf speichern"

#### 4. Tabellenanzeige
In der Haupttabelle:
- Erweiterungsverträge bekommen ein `↗ Nachtrag`-Badge in der Statusspalte oder Produktspalte
- Optional: Unter dem Stammvertrag eingerückt anzeigen (Group-by parent)

#### 5. Preisberechnung
Der Preis des Nachtrag-Vertrags wird separat berechnet (nur das neue Produkt), sodass die Rechnungsstellung klar getrennt ist.

### Dateien
- **DB-Migration**: `ALTER TABLE contracts ADD COLUMN parent_contract_id uuid`  
- **`src/pages/vertrieb/Vertraege.tsx`**: 
  - Neuer State `extensionDialogOpen` + `extensionBaseContract`
  - Funktion `openExtensionDialog(contract)` — befüllt Stammdaten aus dem Elternvertrag
  - Schlanker `ExtensionDialog`-Abschnitt im JSX
  - Kontextmenü-Eintrag "Produkt hinzubuchen"
  - Tabelle: Badge für Nachtrag-Verträge
  - `upsertMutation` berücksichtigt `parent_contract_id`

### Was NICHT geändert wird
- Der bestehende Vertragsdialog bleibt unverändert
- Keine Änderungen an der PDF-Generierung (Nachtrag nutzt dasselbe Template)
- Keine Änderungen an RLS-Policies
