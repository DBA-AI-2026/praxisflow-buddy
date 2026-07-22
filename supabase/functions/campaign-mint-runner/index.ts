// [REVIEW REQUIRED] campaign-mint-runner
// Admin-JWT-geschützt. Ruft qodia-initiate-booking mit skip_mail: true für
// qualifizierte Leads ohne Vertrag auf. Drei Modi: dry_run | canary | batch.
// Klassifikation nach HTTP-Status: 200 = gemintet, 409 = übersprungen (aktiver
// Vertrag), sonst = Fehler. Kampagnen-Marker via customer_events (non-blocking).
// Rollback: Bei Regression Function deaktivieren; keine DB-Migration nötig.
// Aufrufer only — qodia-initiate-booking wird NICHT geändert.
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireActiveRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PRODUCT_NAME = "HFX GOÄ - die KI für ihre Privatabrechnung";
const CAMPAIGN_ID = "goae_mint_2026_07";

type Mode = "dry_run" | "canary" | "batch";

interface ResultRow {
  hfx_customer_number: string;
  name: string;
  outcome: "gemintet" | "übersprungen: aktiver Vertrag" | "Fehler";
  contract_id?: string | null;
  error?: string | null;
  status?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authResult = await requireActiveRole(req, ["admin"], corsHeaders);
  if (authResult instanceof Response) return authResult;
  const { admin } = authResult;

  let body: { mode?: Mode } = {};
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const mode = body.mode;
  if (!mode || !["dry_run", "canary", "batch"].includes(mode)) {
    return new Response(
      JSON.stringify({ error: "mode must be one of dry_run|canary|batch" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const qodiaApiKey = Deno.env.get("QODIA_API_KEY");
  if (!qodiaApiKey) {
    return new Response(JSON.stringify({ error: "QODIA_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Re-select target set: leads.status = 'qualifiziert' AND no contract on hfx_customer_number
  async function fetchTargets(limit?: number): Promise<
    Array<{ hfx: string; name: string }>
  > {
    const { data: leads, error } = await admin
      .from("leads")
      .select("hfx_customer_number, praxis_name, vorname, nachname")
      .eq("status", "qualifiziert")
      .not("hfx_customer_number", "is", null)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const hfxList = (leads ?? [])
      .map((l: any) => l.hfx_customer_number as string)
      .filter(Boolean);
    if (hfxList.length === 0) return [];

    const { data: contracts, error: cErr } = await admin
      .from("contracts")
      .select("hfx_customer_number")
      .in("hfx_customer_number", hfxList);
    if (cErr) throw cErr;
    const withContract = new Set(
      (contracts ?? []).map((c: any) => c.hfx_customer_number),
    );

    const targets = (leads ?? [])
      .filter((l: any) => l.hfx_customer_number && !withContract.has(l.hfx_customer_number))
      .map((l: any) => ({
        hfx: l.hfx_customer_number as string,
        name:
          l.praxis_name ||
          [l.vorname, l.nachname].filter(Boolean).join(" ") ||
          "(ohne Name)",
      }));
    return typeof limit === "number" ? targets.slice(0, limit) : targets;
  }

  // Dry-Run: nur Liste
  if (mode === "dry_run") {
    try {
      const targets = await fetchTargets();
      return new Response(
        JSON.stringify({
          mode,
          count: targets.length,
          targets: targets.map((t) => ({
            hfx_customer_number: t.hfx,
            name: t.name,
          })),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err?.message ?? String(err) }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // canary / batch: mint sequentiell, re-select vor jedem Aufruf
  const fnUrl = `${supabaseUrl}/functions/v1/qodia-initiate-booking`;
  const results: ResultRow[] = [];
  const maxIterations = mode === "canary" ? 1 : 10_000;

  async function mintOne(t: { hfx: string; name: string }): Promise<ResultRow> {
    try {
      const resp = await fetch(fnUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": qodiaApiKey!,
        },
        body: JSON.stringify({
          hfx_customer_number: t.hfx,
          product_name: PRODUCT_NAME,
          skip_mail: true,
        }),
      });
      const status = resp.status;
      let payload: any = null;
      try {
        payload = await resp.json();
      } catch {
        /* ignore */
      }

      if (status === 200) {
        const contractId = payload?.contract_id ?? null;
        // Marker (non-blocking)
        if (contractId) {
          try {
            await admin.from("customer_events").insert({
              event_type: "campaign_mint",
              entity_type: "contract",
              entity_id: contractId,
              hfx_customer_number: t.hfx,
              contract_id: contractId,
              created_by: null,
              event_data: {
                campaign: CAMPAIGN_ID,
                source: "campaign-mint-runner",
              },
            });
          } catch (mErr) {
            console.warn("[campaign-mint-runner] marker insert failed:", mErr);
          }
        }
        return {
          hfx_customer_number: t.hfx,
          name: t.name,
          outcome: "gemintet",
          contract_id: contractId,
          status,
        };
      }

      if (status === 409) {
        return {
          hfx_customer_number: t.hfx,
          name: t.name,
          outcome: "übersprungen: aktiver Vertrag",
          contract_id: payload?.contract_id ?? null,
          status,
        };
      }

      return {
        hfx_customer_number: t.hfx,
        name: t.name,
        outcome: "Fehler",
        error: payload?.error ?? `HTTP ${status}`,
        status,
      };
    } catch (err: any) {
      return {
        hfx_customer_number: t.hfx,
        name: t.name,
        outcome: "Fehler",
        error: err?.message ?? String(err),
      };
    }
  }

  try {
    for (let i = 0; i < maxIterations; i++) {
      const targets = await fetchTargets(1);
      if (targets.length === 0) break;
      const t = targets[0];
      const row = await mintOne(t);
      results.push(row);
      // Safety: if mint didn't remove the lead from target set (Fehler-Fall),
      // wir würden endlos loopen — brich ab.
      if (row.outcome === "Fehler") break;
      if (mode === "canary") break;
      await new Promise((r) => setTimeout(r, 200));
    }

    return new Response(
      JSON.stringify({ mode, count: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err?.message ?? String(err), partial: results }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
