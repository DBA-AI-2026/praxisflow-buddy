
## Plan: Qodia-Schnittstelle – Nur Success zurückgeben (keine URL)

### Änderung gegenüber dem bisherigen Plan

Der bisherige Plan sah vor, dass die Funktion `{ booking_url, contract_id }` zurückgibt und Qodia den Kunden direkt auf diese URL weiterleitet.

**Neu**: Die Funktion gibt nur `{ success: true, contract_id: "..." }` zurück. Qodia muss keine URL öffnen – der Kunde erhält die Buchungs-E-Mail mit dem Link direkt von uns.

### Wie der Flow jetzt aussieht

```text
Qodia-Button → POST qodia-initiate-booking
    │
    ├─ API-Key prüfen
    ├─ Lead suchen / Vertrag anlegen (status="eingegangen")
    ├─ Buchungs-E-Mail an Kunden senden (via send-contract-confirmation intern)
    │
    ▼
{ "success": true, "contract_id": "..." }   ← nur das, keine URL

Kein Redirect durch Qodia nötig.
Kunde bekommt E-Mail → klickt selbst auf "Jetzt buchen" → /buchen?...
```

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `supabase/functions/qodia-initiate-booking/index.ts` | Neu erstellen – Response enthält nur `{ success, contract_id }` |
| `supabase/config.toml` | `verify_jwt = false` für neue Funktion |

### API-Spezifikation (final)

**Request:**
```http
POST /functions/v1/qodia-initiate-booking
x-api-key: <QODIA_API_KEY>
Content-Type: application/json

{ "hfx_customer_number": "HFX-D00042", "product_name": "HFX GOÄ - die KI für ihre Privatabrechnung" }
```

**Erfolg (200):**
```json
{ "success": true, "contract_id": "uuid..." }
```

**Fehler:**
| Code | Bedeutung |
|---|---|
| `401` | API-Key fehlt oder falsch |
| `400` | Pflichtfeld fehlt oder Produkt nicht konfiguriert |
| `404` | HFX-Nummer nicht gefunden |
| `409` | Vertrag für dieses Produkt bereits aktiv |

### Interner Aufbau der Edge Function

1. `x-api-key` gegen `QODIA_API_KEY` Secret prüfen
2. Body validieren (`hfx_customer_number`, `product_name`)
3. Lead in `leads` per `hfx_customer_number` suchen
4. Aktiven Vertrag prüfen → `409` falls vorhanden
5. Offenen `eingegangen`-Vertrag wiederverwenden oder neuen erstellen
6. `send-contract-confirmation` intern per `fetch` mit Service-Role-Key aufrufen → Buchungs-E-Mail geht an Kunden
7. Response: `{ success: true, contract_id }`
