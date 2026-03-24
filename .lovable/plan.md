
## Analyse des IST-Zustands

Die Funktion `auto-invoice` lädt bereits `usage_charges` und fügt sie als Positionen hinzu. Die Grundstruktur für den gemeinsamen Einzug ist vorhanden. 

Konkrete Lücken / Probleme:

1. **E-Mail-Betreff-Bug (Zeile 408)**: `subjectSuffix = grossAmount === 0 ? " (kein Zahlbetrag)" : ""` — wird korrekt gesetzt, da grossAmount die Summe aus Grundgebühr + Verbrauch ist. ✓ Bereits korrekt.

2. **E-Mail-Positionsfilter-Bug (Zeile 341-349)**: `filter(p => p.unit_price > 0 || isInWaiverPeriod)` zeigt beim Waiver immer die 0 €-Grundgebühr-Zeile an — auch wenn Verbrauch > 0 ist. Das ist verwirrend. **Fix nötig**: Wenn Verbrauch vorhanden, soll die 0€-Grundgebühr-Zeile trotzdem sichtbar bleiben, aber mit dem Label "Einführungsangebot".

3. **Stripe-Beschreibung (Zeile 280)**: Enthält nur Produktname und HFX-Nr. Soll die Anzahl Qodia-Vorgänge explizit nennen.

4. **Stripe-Einzug bei Waiver + Verbrauch (Zeile 256)**: `if (hasStripeCustomer && grossAmount > 0)` — bei Waiver-Grundgebühr (0€) + Verbrauch > 0 ist grossAmount > 0 → Stripe-Einzug wird korrekt ausgelöst. ✓ Bereits korrekt.

5. **`usageNetAmount` ist im Hauptfluss nicht sauber getrennt berechnet** — wird nur innerhalb `createGoaeCommissions` berechnet. Für GOÄ-Provisionen brauchen wir es aber bereits im Hauptfluss für die Stripe-Beschreibung.

6. **`notes` in der DB-Rechnung (Zeile 321)**: Kein Hinweis auf Anzahl Qodia-Vorgänge und deren Betrag.

7. **`customer_revenues` (Zeile 445)**: `notes` enthält bereits "+ X Nutzungsposten" — gut.

---

## Was geändert wird (nur `supabase/functions/auto-invoice/index.ts`)

### Änderung 1 — `usageNetAmount` sauber im Hauptfluss berechnen (nach Zeile 183)

```typescript
// Verbrauchsnettobetrag separat ermitteln (für Stripe-Beschreibung und Provisionen)
const usageNetAmount = positions
  .slice(1) // alle Positionen nach der Grundgebühr
  .reduce((s, p) => s + p.quantity * p.unit_price, 0);
```

### Änderung 2 — Stripe invoice `description` ergänzen (Zeile 280)

```typescript
description: `${contract.product_name} – ${billingPeriod}${contract.hfx_customer_number ? ` (${contract.hfx_customer_number})` : ""}${usageChargeIds.length > 0 ? ` | Verbrauch: ${usageChargeIds.length} Qodia-Vorgänge (${usageNetAmount.toFixed(2)} €)` : ""}`,
```

### Änderung 3 — Stripe `invoiceItems`: Grundgebühr und Verbrauch klarer beschriften (Zeile 258-267)

Momentan wird die Beschreibung der Position direkt aus `pos.description` übernommen — das ist bereits korrekt. Keine Änderung nötig, da die Positionen schon unterschiedliche Descriptions haben.

### Änderung 4 — `notes` in DB-Rechnung präziser (Zeile 321)

```typescript
notes: `Automatisch generiert – Laufzeit: ${billingPeriod}${isInWaiverPeriod ? " | Grundgebühr-Waiver aktiv (0 €)" : ""}${usageChargeIds.length > 0 ? ` | ${usageChargeIds.length} Qodia-Verbrauchsposten: ${usageNetAmount.toFixed(2)} € netto` : ""}`,
```

### Änderung 5 — E-Mail: Waiver-0€-Position nur zeigen wenn kein Verbrauch

Aktuell (Zeile 341-349): `filter(p => p.unit_price > 0 || isInWaiverPeriod)` — zeigt Waiver-0€-Zeile immer.

Neues Verhalten:
- Waiver aktiv + kein Verbrauch → zeige 0€-Grundgebühr-Zeile (Nachweis)
- Waiver aktiv + Verbrauch vorhanden → zeige Waiver-Zeile UND alle Verbrauchszeilen (klar für den Kunden)
- Kein Waiver + kein Verbrauch → zeige nur Grundgebühr
- Kein Waiver + Verbrauch → zeige beide

Konkret: Filter anpassen zu `filter(p => p.unit_price > 0 || (isInWaiverPeriod && p === positions[0]))` — zeigt immer die Grundgebühr-Position (auch bei 0 € im Waiver), aber filtert sonstige 0€-Positionen heraus.

### Änderung 6 — E-Mail: Zahlungshinweis-Zusammenfassung um Verbrauch ergänzen

Im Payment-Block bei Stripe-Einzug (Zeile 353-357): wenn `usageNetAmount > 0`, kurze Zeile ergänzen:
```
📊 Enthält: Qodia-Verbrauch ${usageChargeIds.length} Vorgänge × 0,99 € = ${usageNetAmount.toFixed(2)} € (zzgl. MwSt.)
```

---

## Zusammenfassung

| # | Was | Wo |
|---|---|---|
| 1 | `usageNetAmount` im Hauptfluss berechnen | nach Zeile 183 |
| 2 | Stripe invoice description um Verbrauchshinweis ergänzen | Zeile 280 |
| 3 | DB `notes` um Qodia-Verbrauchsdetails ergänzen | Zeile 321 |
| 4 | E-Mail-Positionsfilter präzisieren | Zeile 341 |
| 5 | Stripe-Zahlungsblock um Verbrauchsübersicht ergänzen | Zeile 353 |

**Keine DB-Migration nötig. Keine Frontend-Änderungen nötig.**
