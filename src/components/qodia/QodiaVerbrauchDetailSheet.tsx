/**
 * QodiaVerbrauchDetailSheet
 * -------------------------
 * Right-side detail drawer for a single HFX-GOÄ contract. Shows the full
 * chronological list of usage_charges, grouped by:
 *
 *   1. "Offen"        = status IN ('pending', 'invoicing', 'ungeklaert')
 *   2. "Abgerechnet"  = status = 'invoiced' (linked to invoices.invoice_number)
 *
 * Within each group, entries are sorted by period_from DESC (newest first).
 *
 * This component is the canonical pattern for future "row click -> detail drawer"
 * use cases in this repo. Keep the prop API minimal: parent owns the open state
 * and the currently selected contract; the sheet just renders.
 *
 * Props:
 *   - open           : visibility (controlled by parent)
 *   - onOpenChange   : standard radix open-change callback
 *   - contract       : the contract to show; null while no row is selected
 *   - summary        : pre-computed monthly aggregates from the dashboard
 *                      (saves a duplicate query — the dashboard already has them)
 */
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { AlertTriangle, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

// SYNCHRONIZE: isPromo wird über isContractPromoActive aus src/lib/promoStatus.ts
// berechnet. Nicht durch qodia_unit_price === 0 heuristisch raten — siehe JSDoc
// dort für die Begründung.
import { isContractPromoActive } from "@/lib/promoStatus";
import { useQodiaProducts } from "@/hooks/useQodiaProducts";

import { supabase } from "@/lib/supabaseClient";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface DashboardContract {
  id: string;
  customer_name: string;
  hfx_customer_number: string | null;
  product_name: string;
  qodia_unit_price: number;
}

export interface UsageAggregate {
  quantitySum: number;
  netSum: number;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract: DashboardContract | null;
  currentMonth?: UsageAggregate;
  previousMonth?: UsageAggregate;
  submittedTotal?: number;
}

interface UsageChargeRow {
  id: string;
  contract_id: string | null;
  period_from: string;
  period_to: string;
  unit_description: string | null;
  quantity: number;
  unit_price: number;
  net_amount: number;
  status: string;
  source: string | null;
  invoice_id: string | null;
  notes: string | null;
  invoices?: {
    invoice_number: string | null;
    status: string | null;
    invoice_date: string | null;
  } | null;
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  pending:    { label: "offen",       className: "bg-destructive/10 text-destructive border-destructive/40" },
  invoicing:  { label: "in Rechng.",  className: "bg-primary/10 text-primary border-primary/40" },
  ungeklaert: { label: "ungeklärt",   className: "bg-warning/10 text-warning border-warning/40" },
  invoiced:   { label: "abgerechnet", className: "bg-success/10 text-success border-success/40" },
};

function formatPeriod(from: string, to: string) {
  return `${format(new Date(from), "dd.MM.")}–${format(new Date(to), "dd.MM.yyyy")}`;
}

function StatCard({ label, qty, net }: { label: string; qty: number; net: number }) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-2xl font-bold leading-tight tabular-nums">{qty}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {net.toFixed(2)} €
        </div>
      </CardContent>
    </Card>
  );
}

export function QodiaVerbrauchDetailSheet({
  open,
  onOpenChange,
  contract,
  currentMonth,
  previousMonth,
  submittedTotal = 0,
}: Props) {
  const navigate = useNavigate();
  const contractId = contract?.id ?? null;

  // Echte Promo-Erkennung über Produktdaten (siehe src/lib/promoStatus.ts).
  const { productMap } = useQodiaProducts(
    contract?.product_name ? [contract.product_name] : [],
  );
  const product = contract?.product_name
    ? productMap.get(contract.product_name) ?? null
    : null;
  const isPromo = contract ? isContractPromoActive(contract, product) : false;
  const promoTooltip = product?.promo_price_label ?? undefined;

  const { data: charges, isLoading } = useQuery({
    queryKey: ["qodia-detail-charges", contractId],
    enabled: open && !!contractId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_charges")
        .select(
          "id, contract_id, period_from, period_to, unit_description, quantity, unit_price, net_amount, status, source, invoice_id, notes, invoices(invoice_number, status, invoice_date)"
        )
        .eq("contract_id", contractId!)
        .order("period_from", { ascending: false });
      if (error) throw error;
      return (data ?? []) as UsageChargeRow[];
    },
  });

  const offen = (charges ?? []).filter((c) =>
    ["pending", "invoicing", "ungeklaert"].includes(c.status)
  );
  const abgerechnet = (charges ?? []).filter((c) => c.status === "invoiced");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl overflow-y-auto"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl">
            {contract?.customer_name ?? "—"}
          </SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {contract?.hfx_customer_number ?? "—"} · {contract?.product_name ?? ""}
            {isPromo && (
              <Badge
                variant="outline"
                title={promoTooltip}
                className="ml-2 bg-primary/10 text-primary border-primary/40 text-[10px]"
              >
                Aktionspreis
              </Badge>
            )}
          </SheetDescription>
        </SheetHeader>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          <StatCard
            label="Akt. Monat"
            qty={currentMonth?.quantitySum ?? 0}
            net={currentMonth?.netSum ?? 0}
          />
          <StatCard
            label="Vormonat"
            qty={previousMonth?.quantitySum ?? 0}
            net={previousMonth?.netSum ?? 0}
          />
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Gesamt
              </div>
              <div className="text-2xl font-bold leading-tight tabular-nums">
                {submittedTotal}
              </div>
              <div className="text-xs text-muted-foreground">eingereicht</div>
            </CardContent>
          </Card>
        </div>

        {/* Charges */}
        {isLoading ? (
          <div className="space-y-3 mt-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (charges?.length ?? 0) === 0 ? (
          <div className="mt-8 text-center text-sm text-muted-foreground">
            Noch keine Nutzungsdaten vorhanden für diesen Vertrag.
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            <ChargesSection
              title="Offen"
              charges={offen}
              isPromo={isPromo}
              onInvoiceClick={() => navigate("/rechnungen")}
            />
            <ChargesSection
              title="Abgerechnet"
              charges={abgerechnet}
              isPromo={isPromo}
              onInvoiceClick={() => navigate("/rechnungen")}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ChargesSection({
  title,
  charges,
  isPromo,
  onInvoiceClick,
}: {
  title: string;
  charges: UsageChargeRow[];
  isPromo: boolean;
  onInvoiceClick: () => void;
}) {
  if (charges.length === 0) {
    return (
      <section>
        <SectionHeader title={title} count={0} />
        <p className="text-xs text-muted-foreground italic">
          Keine Einträge in dieser Gruppe.
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader title={title} count={charges.length} />
      <ul className="space-y-2">
        {charges.map((c) => {
          const badge = STATUS_BADGE[c.status] ?? {
            label: c.status,
            className: "bg-muted text-muted-foreground border-border",
          };
          const isUngeklaert = c.status === "ungeklaert";
          // Datenfehler: Verbrauch vorhanden, aber kein Stückpreis hinterlegt
          // und es liegt KEINE aktive Produkt-Promo vor.
          const isDataError =
            !isPromo && c.quantity > 0 && Number(c.net_amount) === 0;
          const invoiceNo = c.invoices?.invoice_number ?? null;
          const invoiceDate = c.invoices?.invoice_date
            ? format(new Date(c.invoices.invoice_date), "dd.MM.yyyy")
            : null;

          return (
            <li
              key={c.id}
              className={`rounded-md border p-3 text-sm ${
                isUngeklaert ? "border-l-2 border-l-warning bg-warning/5" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium tabular-nums">
                    {formatPeriod(c.period_from, c.period_to)}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {c.unit_description ?? "—"}
                  </div>
                  <div className="mt-1 text-xs tabular-nums">
                    {c.quantity} Stk · {Number(c.net_amount).toFixed(2)} €
                  </div>
                  {isDataError && (
                    <div className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>Stückpreis fehlt — Datenfehler.</span>
                    </div>
                  )}
                  {invoiceNo && (
                    <button
                      type="button"
                      onClick={onInvoiceClick}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      title={invoiceDate ? `Rechnungsdatum: ${invoiceDate}` : ""}
                    >
                      <FileText className="h-3 w-3" />
                      {invoiceNo}
                    </button>
                  )}
                  {isUngeklaert && (
                    <div className="mt-1.5 flex items-start gap-1.5 text-xs text-warning">
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>Manuelle Vertragszuordnung erforderlich.</span>
                    </div>
                  )}
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] flex-shrink-0 ${badge.className}`}
                >
                  {badge.label}
                </Badge>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <span className="text-xs text-muted-foreground">({count})</span>
      <div className="flex-1 border-t border-border ml-2" />
    </div>
  );
}
