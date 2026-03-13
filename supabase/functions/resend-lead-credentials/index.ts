import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Generates a secure random password (12 chars: uppercase, lowercase, digits, special).
 * Password is generated on-demand and never stored persistently.
 */
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

  for (let i = 4; i < length; i++) {
    result.push(all[arr[i] % all.length]);
  }

  // Shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // Verify caller is authenticated and has a valid role
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { leadId, email: directEmail, name: directName, hfxCustomerNumber: directHfx, vorname: directVorname, nachname: directNachname } = body;

    // Support two modes:
    // 1. leadId: look up the lead record (existing flow for Interessenten)
    // 2. direct: email + name + hfxCustomerNumber (for Praxen without a lead record)
    let lead: { id?: string; hfx_customer_number: string; praxis_name: string; vorname: string; nachname: string; email: string } | null = null;

    if (leadId) {
      const { data, error: leadError } = await supabaseAdmin
        .from("leads")
        .select("id, hfx_customer_number, praxis_name, vorname, nachname, email, status")
        .eq("id", leadId)
        .single();

      if (leadError || !data) {
        return new Response(JSON.stringify({ error: "Lead not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      lead = data;
    } else if (directEmail) {
      // Direct mode: build a pseudo-lead from supplied data
      lead = {
        id: undefined,
        hfx_customer_number: directHfx || "",
        praxis_name: directName || directEmail,
        vorname: directVorname || "",
        nachname: directNachname || "",
        email: directEmail,
      };
    } else {
      return new Response(JSON.stringify({ error: "leadId or email is required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!lead.email) {
      return new Response(JSON.stringify({ error: "Kein E-Mail für diesen Kunden vorhanden." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Generate a fresh password on-demand — never read from DB
    const newPassword = generatePassword(12);

    // Find the Supabase Auth user by email
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) {
      console.error("Error listing users:", listError);
      return new Response(JSON.stringify({ error: "Fehler beim Abrufen der Benutzerliste." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const authUser = listData?.users?.find((u) => u.email?.toLowerCase() === lead.email.toLowerCase());

    if (authUser) {
      // Update existing auth user password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(authUser.id, {
        password: newPassword,
      });
      if (updateError) {
        console.error("Error updating password:", updateError);
        return new Response(JSON.stringify({ error: "Fehler beim Zurücksetzen des Passworts." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.log(`Password updated for existing auth user: ${authUser.id}`);
    } else {
      // No auth user exists yet (manually captured lead) — create one now
      const { data: newAuthUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: lead.email,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          full_name: `${lead.vorname} ${lead.nachname}`,
        },
      });
      if (createError) {
        console.error("Error creating auth user:", createError);
        return new Response(JSON.stringify({ error: "Fehler beim Anlegen des Benutzerkontos." }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      console.log(`New auth user created for manually captured lead: ${newAuthUser.user.id}`);
    }

    // Update lead record: clear stored password + set credentials_sent_at timestamp
    if (leadId) {
      await supabaseAdmin
        .from("leads")
        .update({ generated_password: null, credentials_sent_at: new Date().toISOString() })
        .eq("id", leadId);
    }

    const resend = new Resend(Deno.env.get("RESEND_API_KEY")!);

    const emailHtml = buildCredentialsEmailHtml({
      praxis_name: lead.praxis_name,
      vorname: lead.vorname,
      nachname: lead.nachname,
      email: lead.email,
      hfx_customer_number: lead.hfx_customer_number,
      generated_password: newPassword,
    });

    await resend.emails.send({
      from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
      reply_to: "info@hfx-honorarfuchs.de",
      to: [lead.email],
      subject: "Ihre Zugangsdaten – Honorarfuchs (erneute Zusendung)",
      html: emailHtml,
      text: [
        `Hallo ${lead.vorname} ${lead.nachname},`,
        "",
        "auf Wunsch haben wir Ihre Zugangsdaten zurückgesetzt.",
        "",
        "Ihre neuen Zugangsdaten:",
        `E-Mail-Adresse: ${lead.email}`,
        `Benutzername: ${lead.hfx_customer_number}`,
        `Neues Passwort: ${newPassword}`,
        "",
        "Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung.",
        "Falls Sie diese E-Mail nicht angefordert haben, wenden Sie sich bitte umgehend an uns.",
        "",
        "© Honorarfuchs GmbH · Bei Fragen: info@hfx-honorarfuchs.de",
      ].join("\n"),
    });

    console.log(`New credentials generated and sent for lead ${lead.hfx_customer_number} to ${lead.email}`);

    return new Response(
      JSON.stringify({ success: true, message: `Neue Zugangsdaten wurden an ${lead.email} gesendet.` }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

function buildCredentialsEmailHtml(fields: {
  praxis_name: string;
  vorname: string;
  nachname: string;
  email: string;
  hfx_customer_number: string;
  generated_password: string;
}) {
  const { praxis_name, vorname, nachname, email, hfx_customer_number, generated_password } = fields;
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:verdana,geneva,sans-serif;">
<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f5f5f5;padding:20px 0;">
<tr><td align="center">
<table border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <!-- Header -->
  <tr>
    <td style="background-color:#0b367f;padding:30px 40px;text-align:center;">
      <h1 style="color:#ffffff;font-size:22pt;margin:0;font-family:verdana,geneva,sans-serif;">🦊 Honorarfuchs</h1>
      <p style="color:#c8d8f0;font-size:11pt;margin:8px 0 0 0;">Ihre neuen Zugangsdaten</p>
    </td>
  </tr>
  <!-- Body -->
  <tr>
    <td style="padding:32px 40px;">
      <p style="font-size:12pt;color:#333333;margin:0 0 16px 0;">Hallo <strong>${vorname} ${nachname}</strong>,</p>
      <p style="font-size:11pt;color:#555555;margin:0 0 24px 0;">auf Wunsch haben wir Ihre Zugangsdaten zurückgesetzt. Sie finden unten Ihre neuen Anmeldedaten für das Honorarfuchs-Portal.</p>

      <!-- Credentials Box -->
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background:#f0f5ff;border-radius:8px;border:1px solid #c8d8f0;margin-bottom:24px;">
        <tr>
          <td style="padding:20px 24px;">
            <p style="font-size:10pt;color:#0b367f;font-weight:bold;text-transform:uppercase;margin:0 0 12px 0;">Ihre neuen Zugangsdaten</p>
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;font-size:10pt;color:#777777;width:140px;">E-Mail-Adresse</td>
                <td style="padding:6px 0;font-size:11pt;color:#333333;">${email}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:10pt;color:#777777;">Benutzername</td>
                <td style="padding:6px 0;font-size:11pt;color:#0b367f;font-weight:bold;font-family:monospace;">${hfx_customer_number}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;font-size:10pt;color:#777777;">Neues Passwort</td>
                <td style="padding:6px 0;font-size:11pt;color:#0b367f;font-weight:bold;font-family:monospace;">${generated_password}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <p style="font-size:10pt;color:#888888;margin:0 0 8px 0;">
        Bitte ändern Sie Ihr Passwort nach der ersten Anmeldung.
      </p>
      <p style="font-size:10pt;color:#888888;margin:0 0 8px 0;">
        Falls Sie diese E-Mail nicht angefordert haben, wenden Sie sich bitte umgehend an uns.
      </p>
    </td>
  </tr>
  <!-- Footer -->
  <tr>
    <td style="background-color:#f8f8f8;padding:16px 40px;border-top:1px solid #eeeeee;text-align:center;">
      <p style="font-size:9pt;color:#aaaaaa;margin:0;">© Honorarfuchs GmbH · Bei Fragen: info@honorarfuchs.de</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
