import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * receive-usage – Eindeutige Zuordnung von Verbrauchsdaten zu einem Vertrag.
 *
 * Zuordnungslogik (Priorität absteigend):
 *   1. hfx_customer_number + contract_id  → exakte Zuordnung (bevorzugt)
 *   2. hfx_customer_number + product_name → Produktfilter (Mehrprodukt-Schutz)
 *   3. hfx_customer_number allein         → nur zulässig, wenn exakt 1 aktiver Vertrag existiert
 *                                           → sonst: Status "ungeklaert" statt falscher Zuordnung
 *
 * Pflichtfelder: hfx_customer_number, period_from, period_to, quantity
 * Optional:      contract_id, product_name, unit_description, notes
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Authenticate via x-api-key header
  const apiKey = req.headers.get("x-api-key");
  const expectedKey = Deno.env.get("QODIA_API_KEY");

  if (!apiKey || apiKey !== expectedKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const {
      hfx_customer_number,
      period_from,
      period_to,
      quantity,
      unit_description,
      notes,
      // Optional disambiguation fields
      contract_id: requestedContractId,
      product_name: requestedProductName,
    } = body;

    // ── Validate required fields ────────────────────────────────────────────
    if (!hfx_customer_number || !period_from || !period_to || quantity == null) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: hfx_customer_number, period_from, period_to, quantity",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof quantity !== "number" || quantity < 0) {
      return new Response(
        JSON.stringify({ error: "quantity must be a non-negative number" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Contract lookup ─────────────────────────────────────────────────────
    let contract: { id: string; qodia_unit_price: number; product_name: string } | null = null;
    let ambiguous = false;

    if (requestedContractId) {
      // Path 1: Explicit contract_id – most precise, validate ownership
      const { data, error } = await supabase
        .from("contracts")
        .select("id, qodia_unit_price, product_name, status")
        .eq("id", requestedContractId)
        .eq("hfx_customer_number", hfx_customer_number)
        .eq("status", "aktiv")
        .maybeSingle();

      if (error) {
        console.error("[receive-usage] Contract lookup error (by id):", error);
        return new Response(
          JSON.stringify({ error: "Database error looking up contract" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      contract = data;
    } else {
      // Path 2 / 3: Lookup by hfx_customer_number, optionally filtered by product
      let query = supabase
        .from("contracts")
        .select("id, qodia_unit_price, product_name, status")
        .eq("hfx_customer_number", hfx_customer_number)
        .eq("status", "aktiv");

      if (requestedProductName) {
        query = query.eq("product_name", requestedProductName);
      }

      const { data: contracts, error } = await query;

      if (error) {
        console.error("[receive-usage] Contract lookup error:", error);
        return new Response(
          JSON.stringify({ error: "Database error looking up contract" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!contracts || contracts.length === 0) {
        console.warn(`[receive-usage] No active contract found for HFX-Nr: ${hfx_customer_number}${requestedProductName ? ` / product: ${requestedProductName}` : ""}`);
        return new Response(
          JSON.stringify({
            error: `No active contract found for HFX-Nr: ${hfx_customer_number}`,
            hint: requestedProductName
              ? `No contract with product_name="${requestedProductName}"`
              : "Try providing product_name or contract_id for disambiguation",
          }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (contracts.length === 1) {
        contract = contracts[0];
      } else {
        // Multiple active contracts – cannot safely assign → mark as ungeklaert
        ambiguous = true;
        console.warn(
          `[receive-usage] Ambiguous: ${contracts.length} active contracts for ${hfx_customer_number}. ` +
            `Products: ${contracts.map((c) => c.product_name).join(", ")}. ` +
            `Inserting usage_charge with status=ungeklaert.`
        );
      }
    }

    const unitPrice = contract ? Math.round(Number(contract.qodia_unit_price) * 100) / 100 : 0;
    const netAmount = Math.round(quantity * unitPrice * 100) / 100;
    const chargeStatus = ambiguous ? "ungeklaert" : "pending";

    // ── Insert usage charge ─────────────────────────────────────────────────
    const { data: usageCharge, error: insertError } = await supabase
      .from("usage_charges")
      .insert({
        hfx_customer_number,
        contract_id: contract?.id ?? null,
        period_from,
        period_to,
        unit_description: unit_description || "Abgerechnete Qodia-Vorgänge",
        quantity,
        unit_price: unitPrice,
        net_amount: netAmount,
        status: chargeStatus,
        source: "qodia",
        notes: ambiguous
          ? `UNGEKLÄRT – mehrere aktive Verträge für ${hfx_customer_number}. Bitte manuell zuordnen.${notes ? " | " + notes : ""}`
          : notes || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("[receive-usage] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (ambiguous) {
      console.warn(`[receive-usage] ⚠ Created UNRESOLVED usage charge ${usageCharge.id} for ${hfx_customer_number} – manual review required.`);
    } else {
      console.log(
        `[receive-usage] ✓ Created usage charge ${usageCharge.id} for ${hfx_customer_number}` +
          ` (contract: ${contract!.id}, product: ${contract!.product_name}): ${quantity} × ${unitPrice} € = ${netAmount} €`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        id: usageCharge.id,
        hfx_customer_number,
        contract_id: contract?.id ?? null,
        product_name: contract?.product_name ?? null,
        quantity,
        unit_price: unitPrice,
        net_amount: netAmount,
        period_from,
        period_to,
        status: chargeStatus,
        ...(ambiguous && {
          warning: "UNGEKLÄRT: Mehrere aktive Verträge für diese Kundennummer. Manuelle Zuordnung erforderlich.",
        }),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[receive-usage] Fatal error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
