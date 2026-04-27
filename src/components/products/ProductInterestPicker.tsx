import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductInterestPickerProps {
  /** Aktuell ausgewählte Produktnamen (products.name als Schlüssel) */
  value: string[];
  /** Callback bei Änderung */
  onChange: (next: string[]) => void;
  /** Optionales Label oben */
  label?: string;
  /** Wenn true: kein Label, kompakt (z. B. innerhalb anderer Forms) */
  hideLabel?: boolean;
  /** Layout: grid (default) oder badges (kompakte Toggle-Badges) */
  layout?: "grid" | "badges";
  /** Komponente deaktivieren */
  disabled?: boolean;
  /** Hinweistext unter den Optionen */
  hint?: string;
  className?: string;
}

/**
 * Wiederverwendbare Auswahl für „Interesse an" Produkten.
 * Lädt aktive Produkte aus public.products (is_active = true).
 * Speichert Werte als products.name (string[]) – kompatibel mit
 * leads.interested_products und praxis_reservations.interested_products.
 *
 * Keine Hardcodes: Neue aktive Produkte erscheinen automatisch.
 */
export function ProductInterestPicker({
  value,
  onChange,
  label = "Produktinteresse",
  hideLabel = false,
  layout = "grid",
  disabled = false,
  hint,
  className,
}: ProductInterestPickerProps) {
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["active-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const toggle = (name: string, checked: boolean) => {
    const current = value ?? [];
    const next = checked
      ? Array.from(new Set([...current, name]))
      : current.filter((p) => p !== name);
    onChange(next);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {!hideLabel && (
        <div className="flex items-center gap-2 text-sm font-medium">
          <Package className="h-4 w-4 text-primary" />
          {label}
          {value && value.length > 0 && (
            <span className="text-xs text-muted-foreground">({value.length} ausgewählt)</span>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-3 w-3 animate-spin" /> Lade Produkte …
        </div>
      ) : products.length === 0 ? (
        <div className="text-xs text-muted-foreground py-2">
          Keine aktiven Produkte verfügbar.
        </div>
      ) : layout === "badges" ? (
        <div className="flex flex-wrap gap-1.5">
          {products.map((p) => {
            const checked = (value ?? []).includes(p.name);
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => toggle(p.name, !checked)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                  checked
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {products.map((p) => {
            const checked = (value ?? []).includes(p.name);
            return (
              <label
                key={p.id}
                className={cn(
                  "flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors",
                  checked ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50",
                  disabled && "opacity-50 cursor-not-allowed",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) => toggle(p.name, !!v)}
                  disabled={disabled}
                />
                <span className="text-sm">{p.name}</span>
              </label>
            );
          })}
        </div>
      )}

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * Kleine Read-Only-Anzeige für Listen / Detail-Views.
 * Zeigt die übergebenen Produktnamen als Badges.
 */
export function ProductInterestBadges({
  products,
  empty = "—",
  className,
}: {
  products: string[] | null | undefined;
  empty?: string;
  className?: string;
}) {
  if (!products || products.length === 0) {
    return <span className="text-xs text-muted-foreground">{empty}</span>;
  }
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {products.map((p) => (
        <Badge key={p} variant="outline" className="text-[10px]">
          {p}
        </Badge>
      ))}
    </div>
  );
}
