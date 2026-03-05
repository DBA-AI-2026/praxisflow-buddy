
## Plan: "Gebietsleiter" → "AD-Zuteilung" in Interessenten.tsx

Only 2 visible label changes needed in `src/pages/Interessenten.tsx`:

1. **Line 232** – `<TableHead>Gebietsleiter</TableHead>` → `<TableHead>AD-Zuteilung</TableHead>`
2. **Line 443** – `<p className="text-muted-foreground">Zugewiesener Gebietsleiter</p>` → `<p className="text-muted-foreground">AD-Zuteilung</p>`

Internal variable names (`gebietsleiter`, `canAssign`, etc.) and the toast message stay unchanged — only the two user-visible labels are updated.
