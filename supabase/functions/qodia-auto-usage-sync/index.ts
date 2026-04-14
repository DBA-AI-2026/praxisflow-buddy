import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    // ── Vormonat berechnen (abgeschlossener Zeitraum) ────────────────────────
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevYear = prevMonthDate.getFullYear();
    const prevMonth = prevMonthDate.getMonth(); // 0-based
    const daysInPrevMonth = new Date(prevYear, prevMonth + 1, 0).getDate();

    const startDate = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-01`;
    const endDate = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}-${String(daysInPrevMonth).padStart(2, "0")}`;

    const monthNames = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];
    const billingPeriodLabel = `${monthNames[prevMonth]} ${prevYear}`;

    console.log(`[qodia-auto-usage-sync] Sync für Vormonat: ${startDate} – ${endDate} (${billingPeriodLabel})`);

    // Fetch all active HFX GOÄ contracts with email and hfx_customer_number
    const { data: contracts, error: contractsError } = await supabase
      .from("contracts")
      .select("id, customer_name, email, hfx_customer_number, qodia_unit_price")
      .ilike("product_name", "HFX GOÄ%")
      .not("email", "is", null)
      .not("hfx_customer_number", "is", null);

    if (contractsError || !contracts || contracts.length === 0) {
      console.log("[qodia-auto-usage-sync] Keine aktiven HFX GOÄ Verträge gefunden.");
      return new Response(JSON.stringify({ success: true, synced: 0 }), {
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
    });

    let synced = 0;
    let errors = 0;

    for (const contract of uniqueContracts) {
      try {
        const res = await fetch("https://auth.qodia.de/api/external/usage", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": qodiaApiKey,
          },
          body: JSON.stringify({ email: contract.email, startDate, endDate }),
        });

        const rawText = await res.text();
        let data: Record<string, unknown> = {};
        try { data = JSON.parse(rawText); } catch { /* not JSON */ }

        console.log(`[qodia-auto-usage-sync] ${contract.hfx_customer_number} (${contract.email}) → HTTP ${res.status}`);

        if (!res.ok || !data.success) {
          errors++;
          continue;
        }

        const usage = (data.usage ?? {}) as Record<string, number>;
        const quantity =
          (usage.rechnungscheck ?? 0) +
          (usage.rechnungscheck_mini ?? 0) +
          (usage.rechnungscheck_standard ?? 0);

        const unitPrice = contract.qodia_unit_price ?? 0.99;
        const netAmount = Math.round(quantity * unitPrice * 100) / 100;

        // Delete existing pending charge for this contract+period and re-insert
        await supabase
          .from("usage_charges")
          .delete()
          .eq("hfx_customer_number", contract.hfx_customer_number)
          .eq("period_from", startDate)
          .eq("status", "pending");

        if (quantity > 0) {
          await supabase.from("usage_charges").insert({
            hfx_customer_number: contract.hfx_customer_number,
            contract_id: contract.id,
            period_from: startDate,
            period_to: endDate,
            quantity,
            unit_price: unitPrice,
            net_amount: netAmount,
            unit_description: `Geprüfte GOÄ-Rechnungen (HFX GOÄ) – ${billingPeriodLabel}`,
            source: "qodia-auto",
            status: "pending",
            notes: `Automatisch abgerufen für ${billingPeriodLabel}`,
          });
        }

        synced++;
      } catch (e) {
        console.error(`[qodia-auto-usage-sync] Fehler bei ${contract.hfx_customer_number}:`, e);
        errors++;
      }
    }

    console.log(`[qodia-auto-usage-sync] Fertig: ${synced} synchronisiert, ${errors} Fehler.`);
    return new Response(JSON.stringify({ success: true, synced, errors, period: `${startDate} – ${endDate}` }), {
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
