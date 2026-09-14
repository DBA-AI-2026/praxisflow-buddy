# Qodia-Planfehler sichtbar machen

## Umsetzung
1. **Kundenansicht:** Die vorhandenen Qodia-Statuszeilen für alle sichtbaren Kundenverträge laden, ohne Produktnamen als Voraussetzung. Problematische Plan-Upgrades (`error`, `rate_limited`, `unreachable` oder Versuch ohne Erfolg) direkt unter dem jeweiligen Eintrag in der Onboarding-Zelle anzeigen. `success` bleibt unsichtbar.
2. **Kunden-/Vertragsdialog:** Die Qodia-Statuszeilen der geladenen Verträge abfragen und den vorhandenen Detailblock je betroffenem Vertrag ergänzen. Er zeigt Versuchszeitpunkt, Erfolgszeitpunkt und Rohfehlermeldung; bei `success` wird nichts ergänzt.
3. **Nachweis:** HFX-I01070-T4 in der Kundenansicht prüfen, anschließend den Vertragsdialog öffnen und die 403-Rohmeldung prüfen. Beide Zustände per Screenshot dokumentieren.
4. **Abschluss:** Aktuellen Buildzustand und Arbeitsstand prüfen, danach veröffentlichen und knapp berichten.

## Unangetastet
- Upgrade-Logik und ihre fünf Auslösepunkte
- Datenbank und Zugriffsregeln
- Nachzieh-Lauf und Testdaten
