# Plan: Bonitätsprüfung (creditreform-check) absichern

Einordnung nach SAFE_CHANGE_PLAN: **Kategorie 2 (Vorsichtig, nur mit Review)**, weil eine Function und ein neues Protokoll betroffen sind. Kein Geld, keine Kundendaten, kein Cron.

## Bestand (nur gelesen)

- **Die Function ist eine Attrappe.** Sie fragt Creditreform gar nicht ab, sondern würfelt einen Score anhand des Namens (`[MOCK]`, `creditreform-check/index.ts:35–58`). Es entstehen keine Kosten und es fließen keine echten Auskunftsdaten.
- **Einziger Aufrufer:** `src/components/dashboard/PendingContractApprovals.tsx:91` (Knopf „Bonität prüfen"). Dieser Baustein ist **nirgends im Portal eingebunden**, keine Seite zeigt ihn an. Heute ruft also keine Rolle die Prüfung auf.
- **Bisherige Nutzung:** 0 Verträge mit Prüfdatum, 0 Prüfer. Es gibt keine Datenbasis für einen Tageswert.
- **Absicherung heute:** keine. Anmeldung ist abgeschaltet (`verify_jwt = false`), es gibt keine Rollenprüfung und keine Begrenzung. Nur die erlaubten Herkunftsadressen sind festgelegt, und die schützen Aufrufe außerhalb eines Browsers nicht.
- **Eingaben:** `contractId` und `customerName`. Die Prüfung bezieht sich auf einen **Vertrag, nicht auf einen Lead**. Der Name kommt ungeprüft vom Aufrufer.

## Vorschlag

1. **Anmeldung Pflicht** über die gemeinsame Rollenprüfung `requireActiveRole`. Weil heute niemand aufruft, schlage ich die Rollen vor, die Verträge freigeben: **admin** und **sales_lead**. Zur Entscheidung: soll `vertragsabteilung` dazu?
2. **Name aus der Datenbank** statt vom Aufrufer: Die Function liest Vertrag und Kundennamen selbst. Ein unbekannter Vertrag ergibt 404.
3. **Begrenzung pro Nutzer und Tag:** Mangels Nutzung schlage ich **20 Prüfungen je Nutzer und Tag** vor, mit höchstens **1 Prüfung je Vertrag und Tag**. Gezählt wird im Protokoll, nicht im Speicher, damit die Zahl auch über Neustarts gilt. Über dem Limit gibt es **429** mit einer deutschen Meldung.
4. **Protokoll** in `audit_logs`, serverseitig: Aktion `CREDITREFORM_CHECK`, wer (ID, E-Mail, Rolle), wann, Vertrags-ID, HFX-Nummer, Erfolg ja/nein. Score und Rating stehen **nicht** im Protokoll. Abgelehnte Aufrufe (Limit, Rolle) werden mit `success=false` protokolliert.
5. **Score speichern** übernimmt künftig die Function, nicht der Browser (heute `PendingContractApprovals.tsx:103`). So passen Protokoll und Ergebnis zusammen.
6. `verify_jwt` bleibt abgeschaltet, wie bei den anderen Functions mit gemeinsamer Rollenprüfung. Die Prüfung macht der Guard.

## Was brechen könnte

- **Im laufenden Betrieb nichts**, weil kein Bildschirm die Prüfung aufruft.
- Wird `PendingContractApprovals` später eingebunden, können nur noch die freigegebenen Rollen prüfen. Alle anderen bekommen 403.
- Externe Skripte oder Tests, die die Function ohne Anmeldung aufrufen, bekommen 401. Laut Code gibt es keine.
- Das Speichern im Browser (Punkt 5) fällt weg. Bei einer späteren Einbindung muss der Knopf das Ergebnis aus der Antwort anzeigen, statt selbst zu schreiben.

## Nur benannt, nicht im Umfang

- Die Attrappe selbst: Eine echte Creditreform-Anbindung fehlt.
- `PendingContractApprovals.tsx` ist nicht eingebunden (toter Baustein). Ob er eingebunden oder gelöscht wird, entscheiden wir gemeinsam.

## Abnahme

- Lokale Tests mit nachgebauter Datenbank, keine Live-Aufrufe. Geprüft wird:
  - ohne Anmeldung 401
  - falsche Rolle 403
  - erlaubte Rolle 200 mit Protokolleintrag ohne Score
  - 21. Aufruf am Tag 429
  - zweite Prüfung desselben Vertrags am selben Tag 429
  - unbekannter Vertrag 404
- Datei:Zeile der Prüfungen, danach Publish und Sync.

## Technische Details

- `supabase/functions/creditreform-check/index.ts`: `requireActiveRole(req, ["admin","sales_lead"], corsHeaders)`. Dann Zählung `audit_logs` mit `action='CREDITREFORM_CHECK' AND user_id=… AND created_at >= heute (Europe/Berlin)`. Dann das Update der `creditreform_*`-Felder auf `contracts` über den Service-Zugang.
- Keine Migration nötig, `audit_logs` besteht bereits.
- Neue Testdatei `src/test/security-creditreform-check.test.ts`, gleiches Muster wie die Phase-2-Tests.
