
## UX/UI Analysis of Kunden-Journey vs. Dashboard

### What the user likes (Dashboard style)
The Dashboard has:
- Clean card-based layout with clear visual hierarchy
- Warm greeting + role badge at top
- KPI stat cards (large number, icon, colored background)
- List items with clear two-line format: **bold name** / sub-text
- Activity feed with icon+color per type
- `card-elevated` containers with `border-b` header rows
- Consistent hover states

### What's broken/confusing in the Journey

**1. Tab navigation inconsistency**
- The `JourneySteps` component (lines 836–876) uses clickable "step buttons" with icons + arrow connectors, implying a LINEAR flow. But users can skip tabs freely — this is misleading. It looks like a Stepper (Wizard), but behaves like ordinary tabs.
- The active tab gets a thick bottom border + white background, which is inconsistent with the Dashboard's card style.

**2. Three separate toolbar rows per tab**
Each sub-tab renders its OWN toolbar with its OWN filter pills — but the search bar is ABOVE in the outer shell. So you have: outer search bar → inner status filter bar → inner source filter bar. Three separate filter areas creates confusion about scope.

**3. The "Verträge" tab is inconsistent with the others**
- It shows an inline alert INSIDE the tab, styled differently from other alerts.
- It filters by `neq("status", "aktiv")` which means it shows Entwurf + Eingegangen + Gezeichnet + Gekündigt + Beendet — but the tab is labeled "Verträge (ausstehend)" implying only pending items. Yet it includes Beendet/Gekündigt (finished).
- Filter pills are only shown when count > 0, causing the pill bar to appear/disappear erratically.

**4. The "Kunden" tab has no cursor-pointer / click action**
- Kunden rows are not clickable (no `onClick`) — just hover highlight. The `→` ArrowRight links to `/vertrieb/vertraege` as a generic href (not to the specific contract). This is a dead-end for users.

**5. Column inconsistency across tabs**
- Interessenten: HFX-Nr. | Praxis/Arzt | Quelle | Email | PLZ/Ort | Status | Nächster Schritt | Qodia | Datum
- Verträge: HFX-Nr. | Praxis/Arzt | Produkt | Status | Monatlich | E-Mail versendet | Zahlung | Vertrieb | Datum | →
- Kunden: HFX-Nr. | MP-Nr. | Praxis | E-Mail | PLZ/Ort | Produkt | Qodia | Seit | →

The columns don't share a "Praxis" pattern — some show "Praxis", some "Praxis / Arzt". There's no consistent primary identifier column.

**6. JourneySteps header doesn't show counts on inactive tabs**
Users can't quickly tell how many items are in each tab without clicking. Dashboard KPI cards show counts instantly.

**7. Dashboard links to wrong routes**
In `Dashboard.tsx`, "Letzte Interessenten" navigates to `/praxen-journey?tab=interessenten&id=...` but the Journey only recognizes `tab=leads`, `tab=vertraege`, `tab=kunden`. So the deep-link from Dashboard is BROKEN for leads (it falls through to the default `leads` tab but doesn't highlight the item because the `tab` param is `interessenten`, not `leads`).

**8. Activity feed links go to old routes**
`link: "/interessenten"` and `link: "/vertrieb/vertraege"` — these are separate pages, not the journey. This is consistent with the old routing, but diverges from the new journey flow.

---

## Plan

### 1. Fix the JourneySteps — tabs, not stepper
Replace the linear "step with arrows" UI with a standard **tab bar** matching the Dashboard's card-header style. Each tab shows:
- Icon + label
- Live count badge (from the already-fetched `counts`)
- Active: colored underline + foreground text
- No arrow connectors (they imply a sequence, not navigation)

### 2. Unify the toolbar strip
Move all per-tab filters into a single consistent toolbar row inside each tab's content area. The outer search bar stays. Remove the double-filter-bar pattern in `InteressentenTab` — merge source filter into a secondary row or remove the confusing "Alle Quellen" pill (rarely used).

### 3. Fix the Verträge tab scope & empty state
- Rename internally or split "aktiv" contracts out. Active contracts belong in Kunden, so Verträge tab = everything NOT aktiv. The filter pills should always be rendered (greyed out at 0) for visual stability.
- Remove the "entered but no email sent" alert from inside the tab — put it as a subtle badge on the tab header instead.

### 4. Make Kunden rows clickable
Add `cursor-pointer` + `onClick` navigating to `/praxen-journey?tab=kunden` with the contract ID deep-link, or better: open a detail dialog/navigate to the Vertraege page with the specific contract pre-selected.

### 5. Consistent column layout across all tabs
All three tabs share these common columns in the same position:
1. HFX-Nr. (mono, muted)
2. **Praxis** (bold) / Arzt (sub)
3. Tab-specific columns (middle)
4. Status badge
5. Date (right)
6. Action icon (→)

### 6. Fix Dashboard deep-links
In `Dashboard.tsx`, change:
- `tab=interessenten` → `tab=leads`
- Activity feed links for leads/contracts → `/praxen-journey?tab=leads` / `?tab=vertraege`

---

## Files to change

1. **`src/pages/PraxenJourney.tsx`** — main rewrite of:
   - `JourneySteps` component: tabs with counts, no arrows
   - `PraxenJourney` main export: pass counts into JourneySteps
   - `InteressentenTab`: simplify filter toolbar (merge source filter inline with status filter)
   - `VertraegeTab`: stable pill bar, move alert to tab badge
   - `KundenTab`: add clickable rows (navigate to contract detail)
   - Column header consistency across all three tables

2. **`src/pages/Dashboard.tsx`** — fix deep-link params:
   - `tab=interessenten` → `tab=leads`
   - Activity feed links → `/praxen-journey?tab=leads` / `?tab=vertraege`
