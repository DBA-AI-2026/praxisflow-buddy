import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    // Allow cron trigger via secret header
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret !== Deno.env.get("CRON_SECRET")) {
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

    // Current month period
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const endDate = now.toISOString().slice(0, 10);

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
            unit_description: "Abgerechnete Qodia-Vorgänge",
            source: "qodia-auto",
            status: "pending",
            notes: `Automatisch abgerufen am ${endDate}`,
          });
        }

        synced++;
      } catch (e) {
        console.error(`[qodia-auto-usage-sync] Fehler bei ${contract.hfx_customer_number}:`, e);
        errors++;
      }
    }

    console.log(`[qodia-auto-usage-sync] Fertig: ${synced} synchronisiert, ${errors} Fehler.`);
    return new Response(JSON.stringify({ success: true, synced, errors }), {
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
