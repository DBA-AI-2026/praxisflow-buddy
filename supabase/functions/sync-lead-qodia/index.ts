import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isStandortHfx } from "../_shared/multiLocation.ts";
import { requireActiveRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generatePassword(length = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%&*";
  const all = upper + lower + digits + special;
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  const result = [
    upper[arr[0] % upper.length],
    lower[arr[1] % lower.length],
    digits[arr[2] % digits.length],
    special[arr[3] % special.length],
  ];
  for (let i = 4; i < length; i++) result.push(all[arr[i] % all.length]);
  for (let i = result.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Phase 2: aktive Rolle + serverseitige Zuständigkeit (sales_partner ausgeschlossen)
    const guard = await requireActiveRole(req, ["admin", "sales_lead", "regional_lead", "user"], corsHeaders);
    if (guard instanceof Response) return guard;
    const user = { id: guard.userId };
    const supabase = guard.admin;

    const { leadId } = await req.json();
    if (!leadId) {
      return new Response(JSON.stringify({ error: "leadId fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, hfx_customer_number, email, qodia_synced, assigned_to")
      .eq("id", leadId)
      .single();

    if (leadError || !lead) {
      return new Response(JSON.stringify({ error: "Lead nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Zuständigkeit: admin/sales_lead alle; user nur assigned_to = eigene ID;
    // regional_lead eigene oder Team-Leads.
    let allowed = guard.roles.includes("admin") || guard.roles.includes("sales_lead");
    if (!allowed && lead.assigned_to) {
      if (guard.roles.includes("user") && lead.assigned_to === guard.userId) allowed = true;
      if (!allowed && guard.roles.includes("regional_lead")) {
        if (lead.assigned_to === guard.userId) allowed = true;
        else {
          const { data: inTeam, error: teamErr } = await supabase.rpc("is_in_regional_lead_team", {
            _regional_lead_id: guard.userId,
            _user_id: lead.assigned_to,
          });
          allowed = !teamErr && inTeam === true;
        }
      }
    }
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (lead.qodia_synced) {
      return new Response(
        JSON.stringify({ success: true, already_synced: true, message: "Lead ist bereits bei Qodia registriert." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Credential-Read: ausschliesslich aus der geschuetzten Tabelle lead_credentials.
    const { data: cred } = await supabase
      .from("lead_credentials")
      .select("generated_password")
      .eq("lead_id", lead.id)
      .maybeSingle();
    let password = cred?.generated_password ?? null;

    // If no password is stored, generate a new one and update it in Auth + DB
    if (!password) {
      console.log(`No stored password for ${lead.hfx_customer_number}, generating new one...`);
      password = generatePassword(12);

      // Find and update the auth user's password
      const { data: listData } = await supabase.auth.admin.listUsers();
      const authUser = listData?.users?.find((u: any) => u.email?.toLowerCase() === lead.email.toLowerCase());
      if (authUser) {
        await supabase.auth.admin.updateUserById(authUser.id, { password });
      }

      // Alleiniger Schreibpfad: lead_credentials (kein leads-Update mehr).
      await supabase.from("lead_credentials").upsert({
        lead_id: lead.id,
        generated_password: password,
        updated_at: new Date().toISOString(),
      }, { onConflict: "lead_id" });
      console.log(`New password generated and stored for ${lead.hfx_customer_number}`);
    }

    const QODIA_SIGNUP_URL = "https://auth.qodia.de/api/external/sign-up";
    const qodiaApiKey = Deno.env.get("QODIA_API_KEY");

    console.log(`Attempting Qodia sync for lead ${lead.hfx_customer_number} (${lead.email})`);

    const qodiaResponse = await fetch(QODIA_SIGNUP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(qodiaApiKey ? { "x-api-key": qodiaApiKey } : {}),
      },
      body: JSON.stringify({
        email: lead.email,
        password: password,
        name: lead.hfx_customer_number,
      }),
    });

    const responseBody = await qodiaResponse.text();
    console.log(`Qodia response (${qodiaResponse.status}):`, responseBody);

    if (qodiaResponse.ok) {
      await supabase.from("leads").update({ qodia_synced: true, qodia_conflict: false }).eq("id", lead.id);

      // Freikontingent-Trial-Grant (Phase 1): idempotent via partiellem Unique-Index
      // (grant_type='trial'). Standorte (-NN) erhalten KEINEN Auto-Grant.
      if (!isStandortHfx(lead.hfx_customer_number)) {
        const { error: grantErr } = await supabase.from("free_quota_grants").insert({
          hfx_customer_number: lead.hfx_customer_number,
          grant_type: "trial",
          menge: 200,
          quelle: "sync_retrigger",
          created_by: user.id ?? null,
        });
        if (grantErr && !String(grantErr.message || "").toLowerCase().includes("duplicate")) {
          console.error("free_quota_grants insert error:", grantErr);
        }
      }
      return new Response(
        JSON.stringify({
          success: true,
          message: `Lead ${lead.hfx_customer_number} erfolgreich bei Qodia registriert.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // Mark conflict if email already exists in Qodia (409)
      if (qodiaResponse.status === 409) {
        await supabase.from("leads").update({ qodia_conflict: true }).eq("id", lead.id);
      }
      return new Response(
        JSON.stringify({
          success: false,
          conflict: qodiaResponse.status === 409,
          error: `Qodia-Fehler (${qodiaResponse.status}): ${responseBody}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    console.error("sync-lead-qodia error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
