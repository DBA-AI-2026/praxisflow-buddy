// qodia-lead-usage-sync
// ---------------------
// Cron (05:30 UTC): Aktivitäts-Monitoring für Interessenten in Testphase.
// Rein lesend gegen Qodia, schreibt ausschließlich die qodia_*-Spalten auf
// public.leads. Kohorte und Delta-Logik: _shared/leadUsage.ts (SSOT, identisch
// zum Live-Abruf in qodia-usage-query mit source: "lead").
import { createClient } from "npm:@supabase/supabase-js@2";
import { loadLeadCohort, syncLeadUsage } from "../_shared/leadUsage.ts";

const LOG = "[qodia-lead-usage-sync]";

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
        status: 401, headers: { "Content-Type": "application/json" },
      });
    }

    const qodiaApiKey = Deno.env.get("QODIA_API_KEY");
    if (!qodiaApiKey) {
      return new Response(JSON.stringify({ error: "QODIA_API_KEY nicht konfiguriert" }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { leads, excludedByContract } = await loadLeadCohort(admin);
    console.log(`${LOG} Kohorte: ${leads.length} Leads (${excludedByContract} durch nicht-terminale Verträge ausgeschlossen)`);

    const now = new Date();
    let ok = 0, noAccount = 0, errors = 0;

    // Sequenziell (Qodia-Rate-Limit), zwei Calls pro Lead.
    for (const lead of leads) {
      const r = await syncLeadUsage(admin, qodiaApiKey, lead, LOG, now);
      if (r.error_code === null) ok++;
      else if (r.error_code === "no_account") noAccount++;
      else errors++;
    }

    console.log(`${LOG} Fertig: ok=${ok}, no_account=${noAccount}, errors=${errors}`);
    return new Response(JSON.stringify({
      success: true, cohort: leads.length, excluded_by_contract: excludedByContract, ok, no_account: noAccount, errors,
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err) {
    console.error(`${LOG} Unbekannter Fehler:`, err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
