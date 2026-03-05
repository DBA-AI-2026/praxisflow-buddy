
## Plan: Manuelle Vertragserfassung & Papier-Druck-Workflow

### Problem
Aktuell erfordert "Vertrag zeichnen" zwingend beide digitale Unterschriften (Kunde + Vertrieb). Der AD kann keinen Vertrag als vollständig abschließen, wenn:
- Der Vertrag auf Papier unterschrieben wurde (AD hat Unterschriften physisch eingeholt)
- Der Vertrag ausgedruckt und per Post/persönlich unterzeichnet werden soll

### Lösung: Zwei neue Workflows

#### 1. "Manuell erfasst / Papier unterschrieben"-Modus
- Neues Auswahlfeld im Unterschriften-Abschnitt: **Unterschrift-Modus**
  - `digital` (Standard, wie bisher)
  - `papier` — Unterschriften wurden physisch eingeholt
- Bei Auswahl `papier`: Unterschriften-Pads werden ausgeblendet, stattdessen erscheint ein Hinweis "Papierunterschrift eingeholt" + optionaler Upload-Slot für das gescannte Dokument
- `getMissingFields()` überspringt Unterschriften-Prüfung wenn Modus = `papier`
- Status wird direkt auf `gezeichnet` gesetzt (wie bisher bei digitaler Unterschrift)
- Ein Badge "Papier" wird in der Tabellenspalte "Status" oder "Dokument" angezeigt

#### 2. "Zum Ausdrucken" — Leerformular generieren
- Neuer Button in der Dialog-Fußzeile: **"Zum Ausdrucken"** (neben "Vorschau PDF")
- Generiert das vollständige Template-PDF mit allen eingetragenen Stammdaten, aber **ohne Unterschriften**
- Öffnet das PDF im Viewer — der AD kann es herunterladen und ausdrucken
- Kein separater Status notwendig — ist eine reine Hilfsfunktion

### Implementierungsdetails

**Formularfeld (neu):**
```typescript
signature_mode: "digital" | "papier"  // default: "digital"
```

**Änderungen in `getMissingFields()`:**
```typescript
if (form.signature_mode === "digital") {
  if (!form.signature_data) missing.push("Unterschrift Kunde");
  if (!form.vertrieb_signature_data) missing.push("Unterschrift Vertrieb");
}
```

**UI-Änderung im Unterschriften-Abschnitt:**
- Toggle/Radio "Unterschrift-Modus: Digital | Papier (manuell)"
- Bei `papier`: grüner Hinweiskasten + Upload-Möglichkeit für gescanntes Dokument
- Bei `digital`: wie bisher

**Neuer Button "Zum Ausdrucken":**
- Ruft `handleTemplatePdf(form)` ohne Signaturdaten auf
- Immer aktiv (kein `isFormComplete` Erfordernis), solange Basis-Stammdaten vorhanden

**Tabelle — "Papier"-Indikator:**
- In der Dokument-Spalte: kleines Badge `📄 Papier` wenn `signature_mode === "papier"`

### Dateien
- `src/pages/vertrieb/Vertraege.tsx` — Hauptdatei, alle Änderungen hier
  - `emptyForm` um `signature_mode: "digital"` erweitern
  - `getMissingFields()` Logik anpassen
  - UI: Toggle + bedingtes Rendering der Pads
  - Footer: neuer "Zum Ausdrucken"-Button
  - Tabelle: Papier-Badge in Dokument-Spalte
- Kein DB-Migration notwendig (kein neues Datenbankfeld — der bestehende `notes`-Mechanismus reicht, oder wir nutzen das bestehende `document_name`-Feld um `[Papier]` zu kennzeichnen)

> Optional: Ein neues `signature_mode`-Feld in der DB speichern — empfehlenswert für Nachvollziehbarkeit. Wäre eine kleine Migration (`ALTER TABLE contracts ADD COLUMN signature_mode text DEFAULT 'digital'`).
