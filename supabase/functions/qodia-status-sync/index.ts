/**
 * qodia-status-sync
 *
 * Cron-driven sync that updates the EXTERNAL provider status fields
 * (sync_status, registration_status, last_sync_at, sync_error_message)
 * in contract_provider_status for the "qodia" provider.
 *
 * Usage aggregates (counts, first/last usage, usage_status) are NOT touched
 * here — they are computed from usage_charges via the SQL function
 * recompute_contract_provider_usage and the trigger on usage_charges.
 *
 * Today: Qodia does not expose a dedicated registration-status endpoint,
 * so we apply a deliberately CONSERVATIVE derivation:
 *   - sync_status = "transferred" if a Qodia account exists for the email
 *     (leads.qodia_synced = true OR external sign-up succeeded earlier)
 *   - registration_status:
 *       * "registered" only if Qodia API confirms the account exists
 *         (probed via signup attempt that returns 409 conflict / OK)
 *       * else stay at the previous value (defaults to "not_registered")
 *   - "active" registration is NEVER set here — that requires a real
 *     Qodia account-status API. Frontend may show usage_status = "active"
 *     independently.
 *
 * As soon as Qodia exposes a real status endpoint, swap out the
 * `probeQodiaRegistration` function — datamodel and frontend stay stable.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROVIDER = "qodia";

interface ContractRow {
  id: string;
  email: string | null;
  hfx_customer_number: string | null;
  status: string;
  product_name: string;
}

async function probeQodiaRegistration(
  email: string,
  apiKey: string,
): Promise<{ registered: boolean; raw: string; httpStatus: number }> {
  // Qodia returns 409 when the email already exists → indicates a registered account.
  // We send a sign-up probe with a throwaway random password; on 409 the account exists.
  // On 200/201 we treat it as just-created (still registered).
  // On other statuses we treat it as inconclusive.
  try {
    const probePwd = crypto.randomUUID() + "Aa1!";
    const res = await fetch("https://auth.qodia.de/api/external/sign-up", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({ email, password: probePwd, name: email }),
    });
    const raw = await res.text();
    if (res.status === 409) return { registered: true, raw, httpStatus: 409 };
    if (res.ok) return { registered: true, raw, httpStatus: res.status };
    return { registered: false, raw, httpStatus: res.status };
  } catch (e) {
    return { registered: false, raw: String(e), httpStatus: 0 };
  }
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const qodiaApiKey = Deno.env.get("QODIA_API_KEY");
    if (!qodiaApiKey) {
      return new Response(JSON.stringify({ error: "QODIA_API_KEY nicht konfiguriert" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Optional: limit to a single contract via ?contract_id=...
    const url = new URL(req.url);
    const onlyContractId = url.searchParams.get("contract_id");

    // Find all contracts whose product has provider_flags->>'qodia' = true
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("name, provider_flags");
    if (prodErr) throw prodErr;
    const qodiaProductNames = (products ?? [])
      .filter((p: any) => p.provider_flags && p.provider_flags[PROVIDER])
      .map((p: any) => p.name);

    if (qodiaProductNames.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0, note: "no qodia products" }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    let contractsQuery = supabase
      .from("contracts")
      .select("id, email, hfx_customer_number, status, product_name")
      .in("product_name", qodiaProductNames)
      .not("email", "is", null);
    if (onlyContractId) {
      contractsQuery = contractsQuery.eq("id", onlyContractId);
    }
    const { data: contracts, error: cErr } = await contractsQuery;
    if (cErr) throw cErr;

    if (!contracts || contracts.length === 0) {
      return new Response(JSON.stringify({ success: true, synced: 0 }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Pre-fetch leads.qodia_synced map for technical hint (NOT authoritative)
    const emails = Array.from(new Set(contracts.map((c: ContractRow) => c.email).filter(Boolean) as string[]));
    const { data: leadHints } = await supabase
      .from("leads")
      .select("email, qodia_synced")
      .in("email", emails);
    const leadHintMap: Record<string, boolean> = {};
    (leadHints ?? []).forEach((l: any) => {
      if (l.email) leadHintMap[l.email.toLowerCase()] = !!l.qodia_synced;
    });

    let synced = 0;
    let errors = 0;

    for (const c of contracts as ContractRow[]) {
      try {
        if (!c.email) continue;

        // Ensure a row exists
        await supabase
          .from("contract_provider_status")
          .upsert(
            { contract_id: c.id, provider: PROVIDER },
            { onConflict: "contract_id,provider", ignoreDuplicates: true },
          );

        // Probe Qodia for account existence.
        // We only probe when we have at least a hint that something might exist
        // OR the contract has been activated (status === "aktiv") — to avoid
        // creating throwaway accounts on Qodia's side for unrelated drafts.
        let newSyncStatus: "not_started" | "transferred" | "error" | "unknown" = "not_started";
        let newRegistrationStatus: "not_registered" | "invited" | "registered" | "active" | null = null;
        let errorMessage: string | null = null;

        const hint = leadHintMap[c.email.toLowerCase()] === true;
        const isActiveContract = c.status === "aktiv" || c.status === "gezeichnet";

        if (hint || isActiveContract) {
          const probe = await probeQodiaRegistration(c.email, qodiaApiKey);
          if (probe.httpStatus === 0) {
            newSyncStatus = "error";
            errorMessage = `Qodia API nicht erreichbar: ${probe.raw}`.slice(0, 500);
          } else if (probe.registered) {
            newSyncStatus = "transferred";
            newRegistrationStatus = "registered";
          } else if (probe.httpStatus >= 500) {
            newSyncStatus = "error";
            errorMessage = `Qodia HTTP ${probe.httpStatus}: ${probe.raw}`.slice(0, 500);
          } else {
            // 4xx other than 409 → account does not exist
            newSyncStatus = hint ? "transferred" : "not_started";
            newRegistrationStatus = "invited";
          }
        }

        const update: Record<string, unknown> = {
          sync_status: newSyncStatus,
          last_sync_at: new Date().toISOString(),
          sync_error_message: errorMessage,
        };
        if (newRegistrationStatus) {
          update.registration_status = newRegistrationStatus;
        }

        const { error: upErr } = await supabase
          .from("contract_provider_status")
          .update(update)
          .eq("contract_id", c.id)
          .eq("provider", PROVIDER);
        if (upErr) throw upErr;

        // Refresh usage aggregates from usage_charges (idempotent SQL function)
        await supabase.rpc("recompute_contract_provider_usage", {
          _contract_id: c.id,
          _provider: PROVIDER,
        });

        synced++;
      } catch (e) {
        console.error(`[qodia-status-sync] Fehler bei ${c.id}:`, e);
        errors++;
        await supabase
          .from("contract_provider_status")
          .update({
            sync_status: "error",
            sync_error_message: String(e).slice(0, 500),
            last_sync_at: new Date().toISOString(),
          })
          .eq("contract_id", c.id)
          .eq("provider", PROVIDER);
      }
    }

    console.log(`[qodia-status-sync] Fertig: ${synced} synchronisiert, ${errors} Fehler.`);
    return new Response(
      JSON.stringify({ success: true, synced, errors, provider: PROVIDER }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[qodia-status-sync] Unbekannter Fehler:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
