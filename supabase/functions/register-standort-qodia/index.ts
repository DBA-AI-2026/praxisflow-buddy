// register-standort-qodia — Phase 2a
//
// Strikt-gespiegelter Zwilling zu sync-lead-qodia, aber **contract-zentriert**:
//   - Identifikation über contractId (nicht leadId)
//   - Liest/schreibt ausschließlich auf `contracts` (NIE auf `leads`)
//   - Berührt KEINEN auth.users-Datensatz (D3 / L1): Standorte haben keinen
//     Lead-Auth-User; die Auth-Hygiene des Lead-Pfads ist hier nicht zuständig
//   - Akzeptiert nur Standort-HFX (Format `{base}-NN`) — niemals Träger (L3)
//   - Idempotent: qodia_synced=true → kurzer 200 No-Op (L4)
//
// Bewusste Code-Duplikation statt Generalisierung: Lead- und Standortpfad
// haben strukturell verschiedene Datenmodelle (Lead-Lookup vs. Contract-Lookup,
// Auth-User-Sync vs. kein Auth-User). Gemeinsamer Password-Generator könnte
// später ins _shared/ extrahiert werden.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isStandortHfx } from "../_shared/multiLocation.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Auth-Level wie sync-lead-qodia: authentifizierter Nutzer reicht
    // (UI-Button ist isAdmin-gegated; serverseitig keine Rollenprüfung nötig)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const contractId = body?.contractId;
    if (!contractId || typeof contractId !== "string") {
      return new Response(JSON.stringify({ error: "contractId fehlt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contract, error: contractError } = await supabase
      .from("contracts")
      .select("id, hfx_customer_number, email, generated_password, qodia_synced")
      .eq("id", contractId)
      .single();

    if (contractError || !contract) {
      return new Response(JSON.stringify({ error: "Vertrag nicht gefunden" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // L3: nur Standort-HFX; Träger-Pfad ist sync-lead-qodia
    if (!isStandortHfx(contract.hfx_customer_number)) {
      return new Response(
        JSON.stringify({
          error: "Diese Function ist Standorten vorbehalten. Träger laufen über sync-lead-qodia.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!contract.email) {
      return new Response(
        JSON.stringify({ error: "Standort hat keine E-Mail-Adresse" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // L4: Idempotenz
    if (contract.qodia_synced) {
      return new Response(
        JSON.stringify({
          success: true,
          already_synced: true,
          message: "Standort ist bereits bei Qodia registriert.",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Passwort: falls vorhanden wiederverwenden, sonst neu erzeugen.
    // Bewusst KEIN auth.admin.updateUserById — Standort hat keinen Lead-Auth-User (D3).
    let password = contract.generated_password as string | null;
    let passwordNewlyGenerated = false;
    if (!password) {
      password = generatePassword(12);
      passwordNewlyGenerated = true;
    }

    const QODIA_SIGNUP_URL = "https://auth.qodia.de/api/external/sign-up";
    const qodiaApiKey = Deno.env.get("QODIA_API_KEY");

    console.log(
      `[register-standort-qodia] Standort ${contract.hfx_customer_number} (${contract.email})`,
    );

    const qodiaResponse = await fetch(QODIA_SIGNUP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(qodiaApiKey ? { "x-api-key": qodiaApiKey } : {}),
      },
      body: JSON.stringify({
        email: contract.email,
        password,
        name: contract.hfx_customer_number,
      }),
    });

    const responseBody = await qodiaResponse.text();
    console.log(
      `[register-standort-qodia] Qodia response (${qodiaResponse.status}):`,
      responseBody,
    );

    if (qodiaResponse.ok) {
      const update: Record<string, unknown> = {
        qodia_synced: true,
        qodia_conflict: false,
      };
      if (passwordNewlyGenerated) update.generated_password = password;
      await supabase.from("contracts").update(update).eq("id", contract.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: `Standort ${contract.hfx_customer_number} erfolgreich bei Qodia registriert.`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } else {
      if (qodiaResponse.status === 409) {
        await supabase
          .from("contracts")
          .update({ qodia_conflict: true })
          .eq("id", contract.id);
      }
      return new Response(
        JSON.stringify({
          success: false,
          conflict: qodiaResponse.status === 409,
          error: `Qodia-Fehler (${qodiaResponse.status}): ${responseBody}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  } catch (err: any) {
    console.error("register-standort-qodia error:", err);
    return new Response(
      JSON.stringify({ error: err?.message || "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
