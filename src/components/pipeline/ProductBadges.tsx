/**
 * Compact product badge list for the Pipeline.
 *
 * Designed multi-product first: accepts an array of products. Today the
 * Abschlussphase tab feeds a single contract product, while the Kunden tab
 * can feed all active products of the customer. The component itself is
 * agnostic to whether products come from contracts.product_name or a future
 * contract_products / product_id mapping — it only consumes a normalized
 * shape `{ key, label, variant? }`.
 *
 * Display rules (per spec):
 *  - Up to 2 products visible as chips
 *  - Additional products collapsed into a "+X weitere" chip with tooltip
 *  - Empty → muted dash
 */
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface ProductBadgeItem {
  /**
   * Opaque, stable identifier for de-duplication and React keys.
   *
   * IMPORTANT: This is intentionally typed as an abstract `key`, NOT as
   * `product_name` or `product_id`. The component must never assume the
   * value carries display meaning — `label` is the only field used for
   * rendering. Callers are responsible for choosing the most stable
   * identifier currently available:
   *   - Today: `contracts.product_name` (string)
   *   - Future: `products.id` / `contract_products.product_id` (uuid)
   * Switching the source only requires changing the caller's mapping;
   * the badge component, its de-dup logic, and the tooltip stay intact.
   */
  key: string;
  /** Human-readable display label (independent from `key`). */
  label: string;
  /** Visual variant — "primary" highlights the focus product (Abschlussphase) */
  variant?: "default" | "primary" | "muted";
}

interface ProductBadgesProps {
  products: ProductBadgeItem[];
  /** Max items shown inline before collapsing into "+X weitere" */
  maxVisible?: number;
}

const variantCls: Record<NonNullable<ProductBadgeItem["variant"]>, string> = {
  default: "bg-muted/60 text-foreground border border-border",
  primary: "bg-primary/10 text-primary border border-primary/20",
  muted: "bg-muted/30 text-muted-foreground border border-border/60",
};

function Chip({ label, variant = "default", title }: { label: string; variant?: ProductBadgeItem["variant"]; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap max-w-[140px] truncate ${variantCls[variant ?? "default"]}`}
    >
      {label}
    </span>
  );
}

export function ProductBadges({ products, maxVisible = 2 }: ProductBadgesProps) {
  if (!products || products.length === 0) {
    return <span className="text-[10px] text-muted-foreground/40">–</span>;
  }

  // De-duplicate by key, preserve order, primary variant wins
  const seen = new Map<string, ProductBadgeItem>();
  for (const p of products) {
    const existing = seen.get(p.key);
    if (!existing || (p.variant === "primary" && existing.variant !== "primary")) {
      seen.set(p.key, p);
    }
  }
  const unique = Array.from(seen.values());

  const visible = unique.slice(0, maxVisible);
  const hidden = unique.slice(maxVisible);

  return (
    <TooltipProvider>
      <div className="flex flex-wrap items-center gap-1">
        {visible.map((p) => (
          <Chip key={p.key} label={p.label} variant={p.variant} title={p.label} />
        ))}
        {hidden.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/60 text-muted-foreground border border-border whitespace-nowrap cursor-help">
                +{hidden.length} weitere
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <div className="flex flex-col gap-0.5 text-xs">
                {hidden.map((p) => (
                  <span key={p.key}>{p.label}</span>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
