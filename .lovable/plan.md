
## Unterschriften-Modus-Toggle: Mobile Optimierung

### Problem
Der Toggle-Container verwendet `grid grid-cols-2` — auf sehr kleinen Screens (< 400px) sind die beiden Buttons zu schmal und unleserlich. Sie sollen auf kleinen Screens untereinander (1 Spalte) und ab `sm` nebeneinander (2 Spalten) erscheinen.

### Lösung
Eine Zeile ändern in `Vertraege.tsx`:

**Zeile 2070** — von `grid grid-cols-2 gap-3` zu `grid grid-cols-1 sm:grid-cols-2 gap-3`

Das ist die einzige Änderung. Die Buttons nutzen bereits `flex-1` und füllen die volle Breite aus, daher reicht diese eine Klassen-Anpassung.
