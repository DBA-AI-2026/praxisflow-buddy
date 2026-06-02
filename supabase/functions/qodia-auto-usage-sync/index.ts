import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEFAULT_QODIA_UNIT_PRICE } from "../_shared/promoStatus.ts";

const MONTH_NAMES = [
  "Januar","Februar","März","April","Mai","Juni",
  "Juli","August","September","Oktober","November","Dezember",
];

type Period = "previous" | "current";

interface ContractRow {
  id: string;
  customer_name: string | null;
  email: string;
  hfx_customer_number: string;
  qodia_unit_price: number | null;
}

interface SyncOptions {
  startDate: string;        // YYYY-MM-DD
  endDate: string;          // YYYY-MM-DD
  billingPeriodLabel: string;
  logPrefix: string;        // e.g. "[qodia-auto-usage-sync]" or "[qodia-auto-usage-sync][current]"
  descSuffix: string;       // appended to unit_description
  notes: string;            // pre-built notes string for normal (net>0) case
  notesZero: string;        // notes string for qty>0 but net=0 case
}

/**
 * Synchronize Qodia usage for ONE contract for the given period.
 * Identical logic for previous-month and current-month pulls; only the
 * period boundaries, labels and log/description strings differ.
 */
async function syncContractUsage(
  supabase: SupabaseClient,
  qodiaApiKey: string,
  contract: ContractRow,
  opts: SyncOptions,
): Promise<"ok" | "error"> {
  try {
    const res = await fetch("https://auth.qodia.de/api/external/usage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": qodiaApiKey,
      },
      body: JSON.stringify({
        email: contract.email,
        startDate: opts.startDate,
        endDate: opts.endDate,
      }),
    });

    const rawText = await res.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(rawText); } catch { /* not JSON */ }

    console.log(`${opts.logPrefix} ${contract.hfx_customer_number} (${contract.email}) → HTTP ${res.status}`);

    if (!res.ok || !data.success) {
      return "error";
    }

    const usage = (data.usage ?? {}) as Record<string, number>;
    const quantity =
      (usage.rechnungscheck ?? 0) +
      (usage.rechnungscheck_mini ?? 0) +
      (usage.rechnungscheck_standard ?? 0);

    const unitPrice = contract.qodia_unit_price ?? DEFAULT_QODIA_UNIT_PRICE;
    const netAmount = Math.round(quantity * unitPrice * 100) / 100;

    // Skip if this period is already invoiced
    const { data: existingInvoiced } = await supabase
      .from("usage_charges")
      .select("id")
      .eq("hfx_customer_number", contract.hfx_customer_number)
      .eq("period_from", opts.startDate)
      .eq("status", "invoiced")
      .limit(1);

    if (existingInvoiced && existingInvoiced.length > 0) {
      console.log(`${opts.logPrefix} ${contract.hfx_customer_number} – Periode ${opts.startDate} bereits fakturiert, überspringe.`);
      return "ok";
    }

    // Delete existing pending charge for this contract+period and re-insert (idempotent)
    await supabase
      .from("usage_charges")
      .delete()
      .eq("hfx_customer_number", contract.hfx_customer_number)
      .eq("period_from", opts.startDate)
      .eq("status", "pending");

    if (quantity > 0) {
      // qty>0 but net=0 (e.g. promo, unit_price=0) → mark directly as invoiced
      const chargeStatus = netAmount > 0 ? "pending" : "invoiced";

      await supabase.from("usage_charges").insert({
        hfx_customer_number: contract.hfx_customer_number,
        contract_id: contract.id,
        period_from: opts.startDate,
        period_to: opts.endDate,
        quantity,
        unit_price: unitPrice,
        net_amount: netAmount,
        unit_description: `Geprüfte GOÄ-Rechnungen (HFX GOÄ) – ${opts.billingPeriodLabel}${opts.descSuffix}`,
        source: "qodia-auto",
        status: chargeStatus,
        notes: netAmount > 0 ? opts.notes : opts.notesZero,
      });

      if (chargeStatus === "invoiced") {
        console.log(`${opts.logPrefix} ${contract.hfx_customer_number} – ${quantity} Nutzungen, aber 0,00 € netto → direkt als invoiced markiert.`);
      }
    }

    return "ok";
  } catch (e) {
    console.error(`${opts.logPrefix} Fehler bei ${contract.hfx_customer_number}:`, e);
    return "error";
  }
}

function buildPeriodOptions(period: Period): Omit<SyncOptions, never> {
  const now = new Date();

  if (period === "previous") {
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth();
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();

    const startDate = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-01`;
    const endDate = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(daysInPrevMonth).padStart(2, "0")}`;
    const billingPeriodLabel = `${MONTH_NAMES[prevMonth]} ${prevYear}`;

    return {
      startDate,
      endDate,
      billingPeriodLabel,
      logPrefix: "[qodia-auto-usage-sync]",
      descSuffix: "",
      notes: `Automatisch abgerufen für ${billingPeriodLabel}`,
      notesZero: `Automatisch abgerufen für ${billingPeriodLabel} – 0,00 € (nicht abrechnungsrelevant)`,
    };
  }

  // current
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = `${year}-${String(month + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const startDate = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const endDate = today;
  const billingPeriodLabel = `${MONTH_NAMES[month]} ${year}`;

  return {
    startDate,
    endDate,
    billingPeriodLabel,
    logPrefix: "[qodia-auto-usage-sync][current]",
    descSuffix: ` (bis ${today})`,
    notes: `Automatisch abgerufen für laufenden Monat ${billingPeriodLabel} – Stand: ${today}`,
    notesZero: `Automatisch abgerufen für laufenden Monat ${billingPeriodLabel} – Stand: ${today} – 0,00 € (nicht abrechnungsrelevant)`,
  };
}

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const cronSecret = req.headers.get("x-cron-secret") ?? "";
    const envCronSecret = Deno.env.get("CRON_SECRET_2") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const validCron = cronSecret !== "" && cronSecret === envCronSecret;
    const validAnon = authHeader === `Bearer ${anonKey}`;
    if (!validCron && !validAnon) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse optional body { "period": "previous" | "current" }
    let period: Period = "previous";
    if (req.method !== "GET") {
      try {
        const text = await req.text();
        if (text && text.trim().length > 0) {
          const body = JSON.parse(text) as { period?: string };
          if (body.period !== undefined) {
            if (body.period !== "previous" && body.period !== "current") {
              return new Response(JSON.stringify({
                error: `Invalid period '${body.period}'. Allowed: 'previous' | 'current'.`,
              }), { status: 400, headers: { "Content-Type": "application/json" } });
            }
            period = body.period;
          }
        }
      } catch {
        return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const qodiaApiKey = Deno.env.get("QODIA_API_KEY");
    if (!qodiaApiKey) {
      return new Response(JSON.stringify({ error: "QODIA_API_KEY nicht konfiguriert" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const opts = buildPeriodOptions(period);

    console.log(`${opts.logPrefix} Sync für ${period === "current" ? "laufenden Monat" : "Vormonat"}: ${opts.startDate} – ${opts.endDate} (${opts.billingPeriodLabel})`);

    // Fetch active HFX GOÄ contracts with email and hfx_customer_number.
    // Status-Filter: nur "aktiv" — gezeichnet/eingegangen haben kein scharfes SEPA-Mandat,
    // gesperrt/gekuendigt/beendet sind nicht abrechnungsfähig (statusGlossary).
    const { data: contracts, error: contractsError } = await supabase
      .from("contracts")
      .select("id, customer_name, email, hfx_customer_number, qodia_unit_price")
      .ilike("product_name", "HFX GOÄ%")
      .in("status", ["aktiv"])
      .not("email", "is", null)
      .not("hfx_customer_number", "is", null);

    if (contractsError || !contracts || contracts.length === 0) {
      console.log(`${opts.logPrefix} Keine aktiven HFX GOÄ Verträge gefunden.`);
      return new Response(JSON.stringify({ success: true, synced: 0, period }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Deduplicate by email
    const seen = new Set<string>();
    const uniqueContracts = contracts.filter((c) => {
      if (seen.has(c.email)) return false;
      seen.add(c.email);
      return true;
    }) as ContractRow[];

    let synced = 0;
    let errors = 0;

    for (const contract of uniqueContracts) {
      const result = await syncContractUsage(supabase, qodiaApiKey, contract, opts);
      if (result === "ok") synced++; else errors++;
    }

    console.log(`${opts.logPrefix} Fertig: ${synced} synchronisiert, ${errors} Fehler.`);
    return new Response(JSON.stringify({
      success: true,
      period,
      synced,
      errors,
      window: `${opts.startDate} – ${opts.endDate}`,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[qodia-auto-usage-sync] Unbekannter Fehler:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
