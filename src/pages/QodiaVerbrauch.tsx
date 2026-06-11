/**
 * /qodia-verbrauch — Verbrauchs-Dashboard
 *
 * DB-basierte Globalsicht aller aktiven HFX-GOÄ-Verträge.
 *
 * Datenquellen (alles read-only):
 *   1. contracts             — aktive HFX-GOÄ-Verträge (Basisliste)
 *   2. contract_provider_status (via useProviderStatusMap)
 *      — usage_status, submitted_invoice_count_total, last_usage_at
 *   3. usage_charges         — aggregiert pro contract_id für
 *                              aktueller Monat + Vormonat
 *   4. customers.base_fee_contract_id (via useCarrierMap)
 *      — Träger pro customer_id für Mehrstandort-Gruppierung (Phase 2e).
 *
 * Phase 2e — Variante 2 (kundengruppiert):
 *   Parent-Zeile zeigt aggregierten Gesamt-Verbrauch (Träger + alle Standorte)
 *   und ist aufklappbar. Beim Aufklappen erscheinen Träger und Standorte als
 *   eingerückte Kind-Zeilen mit identischer Spaltenstruktur. Kunden ohne
 *   Träger oder mit nur einem Vertrag werden flach (ohne Toggle) gerendert.
 *
 * Klick auf eine Kind-Zeile (oder eine flache Parent-Zeile) öffnet den
 * QodiaVerbrauchDetailSheet (rechts). Bei Gruppen toggelt der Parent-Klick
 * nur das Aufklappen — Detail-Sheet erreicht man über die Kind-Zeilen.
 *
 * URL-State: ?contract=<id> hält die Drawer-Auswahl beim Page-Reload.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { format, startOfMonth, subMonths, differenceInDays } from "date-fns";
import {
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Zap,
  ChevronDown,
  ChevronRight,
  MapPin,
} from "lucide-react";

import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/lib/supabaseClient";
import { useProviderStatusMap } from "@/hooks/useProviderStatus";
import { useCarrierMap } from "@/hooks/useCarrierMap";
// SYNCHRONIZE: isPromo wird über isContractPromoActive aus src/lib/promoStatus.ts
// berechnet. Nicht durch qodia_unit_price === 0 heuristisch raten — siehe JSDoc
// dort für die Begründung.
import { isContractPromoActive } from "@/lib/promoStatus";
import { useQodiaProducts } from "@/hooks/useQodiaProducts";
import {
  QodiaVerbrauchDetailSheet,
  type DashboardContract,
  type UsageAggregate,
} from "@/components/qodia/QodiaVerbrauchDetailSheet";
import { QodiaLiveAbrufDialog } from "@/components/qodia/QodiaLiveAbrufDialog";

type UsageStatus = "active" | "inactive" | "first_usage" | "no_usage";
type StatusFilter = "all" | UsageStatus;

const STATUS_LABEL: Record<UsageStatus, string> = {
  active: "Aktiv",
  inactive: "Inaktiv",
  first_usage: "Erstnutzung",
  no_usage: "Keine Nutzung",
};

const STATUS_CLASSES: Record<UsageStatus, string> = {
  active: "bg-success/10 text-success border-success/40",
  inactive: "bg-muted text-muted-foreground border-border",
  first_usage: "bg-primary/10 text-primary border-primary/40",
  no_usage: "bg-muted/50 text-muted-foreground border-border",
};

interface ContractRow extends DashboardContract {
  email: string | null;
  status: string;
  customer_id: string | null;
}

interface EnrichedRow extends ContractRow {
  usageStatus: UsageStatus | null;
  submittedTotal: number;
  lastUsageAt: string | null;
  current: UsageAggregate;
  previous: UsageAggregate;
}

/**
 * Phase 2e: Gruppierte Zeile.
 *  - kind="flat"   → einzelne Zeile, gleiches Verhalten wie vor 2e (kein Toggle).
 *  - kind="group"  → Parent (Aggregat) + Kinder (Träger zuerst, dann Standorte).
 */
type GroupedRow =
  | { kind: "flat"; row: EnrichedRow }
  | {
      kind: "group";
      key: string; // customer_id
      carrier: EnrichedRow;
      standorte: EnrichedRow[];
      aggregate: EnrichedRow; // synthetisch (gleicher Shape wie Carrier, aggregierte Zahlen)
    };

export default function QodiaVerbrauch() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [liveOpen, setLiveOpen] = useState(false);
  const [drawerContractId, setDrawerContractId] = useState<string | null>(
    searchParams.get("contract")
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Periods for aggregation
  const currentMonthStart = useMemo(
    () => format(startOfMonth(new Date()), "yyyy-MM-dd"),
    []
  );
  const previousMonthStart = useMemo(
    () => format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM-dd"),
    []
  );

  // 1) Contracts
  const { data: contracts, isLoading: contractsLoading } = useQuery({
    queryKey: ["qodia-dashboard-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select(
          "id, customer_id, customer_name, hfx_customer_number, email, qodia_unit_price, status, product_name"
        )
        .ilike("product_name", "HFX GOÄ%")
        .eq("status", "aktiv")
        .order("customer_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContractRow[];
    },
  });

  const contractIds = useMemo(
    () => (contracts ?? []).map((c) => c.id),
    [contracts]
  );

  // 2) Provider status (reuse existing hook)
  const { data: statusMap, isLoading: statusLoading } = useProviderStatusMap({
    contractIds,
    provider: "qodia",
    enabled: contractIds.length > 0,
  });

  // 2b) Carrier-Map (Phase 2e — Mehrstandort-Gruppierung)
  const { data: carrierMap } = useCarrierMap();

  // 2c) Produkt-Promo-Daten (echte Promo-Erkennung)
  const productNames = useMemo(
    () => (contracts ?? []).map((c) => c.product_name).filter(Boolean) as string[],
    [contracts],
  );
  const { productMap } = useQodiaProducts(productNames);

  // 3) Current month aggregate
  const { data: currentAgg, isLoading: currentLoading } = useQuery({
    queryKey: ["qodia-dashboard-current", currentMonthStart, contractIds.join(",")],
    enabled: contractIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_charges")
        .select("contract_id, quantity, net_amount")
        .gte("period_from", currentMonthStart)
        .in("contract_id", contractIds);
      if (error) throw error;
      return aggregateByContract(data ?? []);
    },
  });

  // 4) Previous month aggregate
  const { data: previousAgg, isLoading: previousLoading } = useQuery({
    queryKey: ["qodia-dashboard-previous", previousMonthStart, contractIds.join(",")],
    enabled: contractIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("usage_charges")
        .select("contract_id, quantity, net_amount")
        .eq("period_from", previousMonthStart)
        .in("contract_id", contractIds);
      if (error) throw error;
      return aggregateByContract(data ?? []);
    },
  });

  const loading =
    contractsLoading || statusLoading || currentLoading || previousLoading;

  // --- Derived rows
  const enriched = useMemo<EnrichedRow[]>(() => {
    return (contracts ?? []).map((c) => {
      const ps = statusMap?.[c.id];
      const cur = currentAgg?.[c.id] ?? { quantitySum: 0, netSum: 0 };
      const prev = previousAgg?.[c.id] ?? { quantitySum: 0, netSum: 0 };
      const usageStatus = (ps?.usage_status as UsageStatus | undefined) ?? null;
      return {
        ...c,
        usageStatus,
        submittedTotal: ps?.submitted_invoice_count_total ?? 0,
        lastUsageAt: ps?.last_usage_at ?? null,
        current: cur,
        previous: prev,
      };
    });
  }, [contracts, statusMap, currentAgg, previousAgg]);

  // --- Phase 2e: Gruppierung pro customer_id (Variante 2)
  // Regel: Carrier-Map liefert Träger pro customer_id. Wenn vorhanden UND
  // Gruppe hat ≥2 Verträge → Group. Sonst flach (alte Optik).
  const grouped = useMemo<GroupedRow[]>(() => {
    if (!enriched.length) return [];
    const byCustomer = new Map<string, EnrichedRow[]>();
    const noCustomer: EnrichedRow[] = [];
    for (const r of enriched) {
      if (!r.customer_id) {
        noCustomer.push(r);
        continue;
      }
      const arr = byCustomer.get(r.customer_id) ?? [];
      arr.push(r);
      byCustomer.set(r.customer_id, arr);
    }

    const out: GroupedRow[] = [];
    for (const [customerId, rows] of byCustomer) {
      const carrierId = carrierMap?.[customerId];
      const carrier = carrierId ? rows.find((r) => r.id === carrierId) : null;
      if (!carrier || rows.length < 2) {
        for (const r of rows) out.push({ kind: "flat", row: r });
        continue;
      }
      const standorte = rows
        .filter((r) => r.id !== carrier.id)
        .sort((a, b) =>
          (a.hfx_customer_number ?? "").localeCompare(b.hfx_customer_number ?? ""),
        );
      const aggregate = aggregateGroup(carrier, standorte);
      out.push({ kind: "group", key: customerId, carrier, standorte, aggregate });
    }
    for (const r of noCustomer) out.push({ kind: "flat", row: r });

    // Sortierung wie Basislisten: nach customer_name
    return out.sort((a, b) => {
      const an = a.kind === "flat" ? a.row.customer_name : a.carrier.customer_name;
      const bn = b.kind === "flat" ? b.row.customer_name : b.carrier.customer_name;
      return (an ?? "").localeCompare(bn ?? "");
    });
  }, [enriched, carrierMap]);

  // Filter + search (auf Gruppen-Ebene)
  const filtered = useMemo<GroupedRow[]>(() => {
    const q = search.trim().toLowerCase();
    const matchesText = (r: EnrichedRow) =>
      !q ||
      (r.customer_name ?? "").toLowerCase().includes(q) ||
      (r.hfx_customer_number ?? "").toLowerCase().includes(q);
    const matchesStatus = (s: UsageStatus | null) =>
      statusFilter === "all" || s === statusFilter;

    return grouped.filter((g) => {
      if (g.kind === "flat") {
        return matchesStatus(g.row.usageStatus) && matchesText(g.row);
      }
      // Group: Status-Filter auf Aggregat; Search matcht Träger ODER einen Standort.
      if (!matchesStatus(g.aggregate.usageStatus)) return false;
      if (!q) return true;
      return matchesText(g.carrier) || g.standorte.some(matchesText);
    });
  }, [grouped, statusFilter, search]);

  // Status counts for pills — ungrouped (über alle Verträge), wie zuvor.
  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = {
      all: enriched.length,
      active: 0,
      inactive: 0,
      first_usage: 0,
      no_usage: 0,
    };
    enriched.forEach((r) => {
      if (r.usageStatus) counts[r.usageStatus]++;
    });
    return counts;
  }, [enriched]);

  // Summary cards (unverändert: ungrouped)
  const totalActive = statusCounts.active;
  const totalCurrentQty = useMemo(
    () => enriched.reduce((s, r) => s + r.current.quantitySum, 0),
    [enriched]
  );
  const totalSubmitted = useMemo(
    () => enriched.reduce((s, r) => s + r.submittedTotal, 0),
    [enriched]
  );

  // Drawer wiring with URL state
  const drawerContract = useMemo(
    () => enriched.find((r) => r.id === drawerContractId) ?? null,
    [enriched, drawerContractId]
  );

  useEffect(() => {
    const sp = new URLSearchParams(searchParams);
    if (drawerContractId) sp.set("contract", drawerContractId);
    else sp.delete("contract");
    setSearchParams(sp, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawerContractId]);

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["qodia-dashboard-contracts"] });
    queryClient.invalidateQueries({ queryKey: ["qodia-dashboard-current"] });
    queryClient.invalidateQueries({ queryKey: ["qodia-dashboard-previous"] });
    queryClient.invalidateQueries({ queryKey: ["provider-status-map"] });
    queryClient.invalidateQueries({ queryKey: ["carrier-map"] });
  };

  const toggleGroup = (key: string) =>
    setExpanded((m) => ({ ...m, [key]: !m[key] }));

  return (
    <MainLayout
      title="Qodia-Verbrauch"
      subtitle="Übersicht aller aktiven HFX-GOÄ-Verträge"
    >
      <div className="space-y-4">
        {/* Top bar: status pills + search + actions */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                label="Alle"
                active={statusFilter === "all"}
                count={statusCounts.all}
                onClick={() => setStatusFilter("all")}
              />
              {(Object.keys(STATUS_LABEL) as UsageStatus[]).map((s) => (
                <StatusPill
                  key={s}
                  label={STATUS_LABEL[s]}
                  active={statusFilter === s}
                  count={statusCounts[s]}
                  onClick={() => setStatusFilter(s)}
                />
              ))}
              <div className="flex-1" />
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="HFX-Nr. oder Name…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Aktualisieren
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setLiveOpen(true)}
                className="gap-2"
              >
                <Zap className="h-4 w-4" />
                Frische Daten von Qodia abrufen
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Verträge" value={enriched.length} />
          <SummaryCard label="Aktiv" value={totalActive} accent="success" />
          <SummaryCard label="Vorgänge akt. Monat" value={totalCurrentQty} />
          <SummaryCard label="Vorgänge gesamt" value={totalSubmitted} />
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>HFX-Nr.</TableHead>
                  <TableHead>Kunde</TableHead>
                  <TableHead className="text-right">Akt. Monat</TableHead>
                  <TableHead className="text-right">Vormonat</TableHead>
                  <TableHead className="text-right">Gesamt</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Trend</TableHead>
                  <TableHead>Letzte Nutzung</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && enriched.length === 0 ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="text-center py-8 text-muted-foreground"
                    >
                      {enriched.length === 0
                        ? "Keine aktiven HFX-GOÄ-Verträge gefunden."
                        : `Keine Verträge mit Status „${
                            statusFilter === "all"
                              ? "—"
                              : STATUS_LABEL[statusFilter]
                          }".`}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.flatMap((g) => {
                    if (g.kind === "flat") {
                      return [
                        renderContractRow({
                          r: g.row,
                          productMap,
                          onOpen: () => setDrawerContractId(g.row.id),
                          indent: false,
                        }),
                      ];
                    }
                    const isOpen = !!expanded[g.key];
                    const rows = [
                      renderGroupParentRow({
                        agg: g.aggregate,
                        childCount: 1 + g.standorte.length,
                        expanded: isOpen,
                        productMap,
                        onToggle: () => toggleGroup(g.key),
                      }),
                    ];
                    if (isOpen) {
                      rows.push(
                        renderContractRow({
                          r: g.carrier,
                          productMap,
                          onOpen: () => setDrawerContractId(g.carrier.id),
                          indent: true,
                          keyPrefix: `${g.key}-carrier`,
                        }),
                      );
                      for (const s of g.standorte) {
                        rows.push(
                          renderContractRow({
                            r: s,
                            productMap,
                            onOpen: () => setDrawerContractId(s.id),
                            indent: true,
                            keyPrefix: `${g.key}-${s.id}`,
                          }),
                        );
                      }
                    }
                    return rows;
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <QodiaVerbrauchDetailSheet
        open={!!drawerContractId}
        onOpenChange={(o) => {
          if (!o) setDrawerContractId(null);
        }}
        contract={drawerContract}
        currentMonth={drawerContract?.current as UsageAggregate | undefined}
        previousMonth={drawerContract?.previous as UsageAggregate | undefined}
        submittedTotal={drawerContract?.submittedTotal ?? 0}
      />

      <QodiaLiveAbrufDialog open={liveOpen} onOpenChange={setLiveOpen} />
    </MainLayout>
  );
}

// ─── Render helpers ──────────────────────────────────────────────────

function renderContractRow({
  r,
  productMap,
  onOpen,
  indent,
  keyPrefix,
}: {
  r: EnrichedRow;
  productMap: Map<string, any>;
  onOpen: () => void;
  indent: boolean;
  keyPrefix?: string;
}) {
  const product = productMap.get(r.product_name) ?? null;
  const isPromo = isContractPromoActive(r, product);
  return (
    <TableRow
      key={keyPrefix ?? r.id}
      tabIndex={0}
      className={`cursor-pointer focus:outline-none focus:bg-muted/50 ${
        indent ? "bg-muted/20 hover:bg-muted/40" : ""
      }`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <TableCell className="font-mono text-xs">
        <span className={indent ? "inline-flex items-center gap-1 pl-6" : ""}>
          {indent ? <MapPin className="h-3 w-3 text-muted-foreground" /> : null}
          {r.hfx_customer_number ?? "—"}
        </span>
      </TableCell>
      <TableCell className="font-medium">{r.customer_name}</TableCell>
      <TableCell className="text-right tabular-nums">
        <QtyCell
          qty={r.current.quantitySum}
          net={r.current.netSum}
          isPromo={isPromo}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <QtyCell
          qty={r.previous.quantitySum}
          net={r.previous.netSum}
          isPromo={isPromo}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">{r.submittedTotal}</TableCell>
      <TableCell>
        <UsageStatusBadge status={r.usageStatus} />
      </TableCell>
      <TableCell className="text-center">
        <TrendIcon current={r.current.quantitySum} previous={r.previous.quantitySum} />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {r.lastUsageAt ? format(new Date(r.lastUsageAt), "dd.MM.yyyy") : "—"}
      </TableCell>
    </TableRow>
  );
}

function renderGroupParentRow({
  agg,
  childCount,
  expanded,
  productMap,
  onToggle,
}: {
  agg: EnrichedRow;
  childCount: number;
  expanded: boolean;
  productMap: Map<string, any>;
  onToggle: () => void;
}) {
  const product = productMap.get(agg.product_name) ?? null;
  const isPromo = isContractPromoActive(agg, product);
  const locationsLabel = childCount - 1;
  return (
    <TableRow
      key={`group-${agg.customer_id}`}
      tabIndex={0}
      className="cursor-pointer focus:outline-none focus:bg-muted/50 font-medium"
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <TableCell className="font-mono text-xs">
        <span className="inline-flex items-center gap-1">
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {agg.hfx_customer_number ?? "—"}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="font-medium">{agg.customer_name}</span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent-foreground border border-border bg-accent/40 rounded px-1.5 py-0.5">
            <MapPin className="h-3 w-3" />
            {locationsLabel} {locationsLabel === 1 ? "Standort" : "Standorte"}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <QtyCell
          qty={agg.current.quantitySum}
          net={agg.current.netSum}
          isPromo={isPromo}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        <QtyCell
          qty={agg.previous.quantitySum}
          net={agg.previous.netSum}
          isPromo={isPromo}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">{agg.submittedTotal}</TableCell>
      <TableCell>
        <UsageStatusBadge status={agg.usageStatus} />
      </TableCell>
      <TableCell className="text-center">
        <TrendIcon
          current={agg.current.quantitySum}
          previous={agg.previous.quantitySum}
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {agg.lastUsageAt ? format(new Date(agg.lastUsageAt), "dd.MM.yyyy") : "—"}
      </TableCell>
    </TableRow>
  );
}

// ─── Aggregation helpers ─────────────────────────────────────────────

function aggregateByContract(
  rows: Array<{ contract_id: string | null; quantity: number | null; net_amount: number | null }>
): Record<string, UsageAggregate> {
  const out: Record<string, UsageAggregate> = {};
  for (const r of rows) {
    if (!r.contract_id) continue;
    const cur = out[r.contract_id] ?? { quantitySum: 0, netSum: 0 };
    cur.quantitySum += Number(r.quantity ?? 0);
    cur.netSum += Number(r.net_amount ?? 0);
    out[r.contract_id] = cur;
  }
  return out;
}

/**
 * Phase 2e: Aggregat-Zeile pro Kunde (Träger + Standorte).
 * Identitäts-/Anzeigefelder vom Träger; Zahlen + lastUsageAt + usageStatus
 * werden aus allen Mitgliedern abgeleitet.
 *
 * usageStatus-Ableitung aus dem Aggregat (dokumentiert in der 2e-Übergabe):
 *   - submittedTotal === 0                                  → "no_usage"
 *   - lastUsageAt > 60 Tage alt                              → "inactive"
 *   - submittedTotal ≤ 1                                    → "first_usage"
 *   - sonst                                                  → "active"
 */
function aggregateGroup(carrier: EnrichedRow, standorte: EnrichedRow[]): EnrichedRow {
  const all = [carrier, ...standorte];
  const current = all.reduce<UsageAggregate>(
    (acc, r) => ({
      quantitySum: acc.quantitySum + r.current.quantitySum,
      netSum: acc.netSum + r.current.netSum,
    }),
    { quantitySum: 0, netSum: 0 },
  );
  const previous = all.reduce<UsageAggregate>(
    (acc, r) => ({
      quantitySum: acc.quantitySum + r.previous.quantitySum,
      netSum: acc.netSum + r.previous.netSum,
    }),
    { quantitySum: 0, netSum: 0 },
  );
  const submittedTotal = all.reduce((s, r) => s + r.submittedTotal, 0);
  const lastUsageAt = all.reduce<string | null>((acc, r) => {
    if (!r.lastUsageAt) return acc;
    if (!acc) return r.lastUsageAt;
    return r.lastUsageAt > acc ? r.lastUsageAt : acc;
  }, null);

  let usageStatus: UsageStatus;
  if (submittedTotal === 0) {
    usageStatus = "no_usage";
  } else if (
    lastUsageAt &&
    differenceInDays(new Date(), new Date(lastUsageAt)) > 60
  ) {
    usageStatus = "inactive";
  } else if (submittedTotal <= 1) {
    usageStatus = "first_usage";
  } else {
    usageStatus = "active";
  }

  return {
    ...carrier,
    current,
    previous,
    submittedTotal,
    lastUsageAt,
    usageStatus,
  };
}

// ─── Small UI atoms ──────────────────────────────────────────────────

function StatusPill({
  label,
  active,
  count,
  onClick,
}: {
  label: string;
  active: boolean;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition ${
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background hover:bg-muted border-border text-foreground"
      }`}
    >
      {label}
      <span
        className={`tabular-nums ${
          active ? "text-primary-foreground/80" : "text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "success";
}) {
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <div
          className={`text-2xl font-bold tabular-nums ${
            accent === "success" ? "text-success" : "text-foreground"
          }`}
        >
          {value}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}

function QtyCell({ qty, net, isPromo }: { qty: number; net: number; isPromo: boolean }) {
  if (qty === 0 && net === 0) return <span className="text-muted-foreground">—</span>;
  const isDataError = !isPromo && qty > 0 && net === 0;
  if (isDataError) {
    return (
      <span>
        <span className="font-medium">{qty}</span>
        <span className="text-xs text-warning ml-1">(⚠ Datenfehler)</span>
      </span>
    );
  }
  return (
    <span>
      <span className="font-medium">{qty}</span>
      <span className="text-xs text-muted-foreground ml-1">
        ({net.toFixed(2)} €{isPromo ? " · Aktion" : ""})
      </span>
    </span>
  );
}

function TrendIcon({ current, previous }: { current: number; previous: number }) {
  if (current === 0 && previous === 0)
    return <span className="text-muted-foreground text-xs">—</span>;
  if (previous === 0 && current > 0)
    return <TrendingUp className="h-4 w-4 text-success inline-block" />;
  if (current > previous * 1.1)
    return <TrendingUp className="h-4 w-4 text-success inline-block" />;
  if (current < previous * 0.9)
    return <TrendingDown className="h-4 w-4 text-destructive inline-block" />;
  return <Minus className="h-4 w-4 text-muted-foreground inline-block" />;
}

function UsageStatusBadge({ status }: { status: UsageStatus | null }) {
  if (!status)
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        unbekannt
      </Badge>
    );
  return (
    <Badge variant="outline" className={`text-xs ${STATUS_CLASSES[status]}`}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
