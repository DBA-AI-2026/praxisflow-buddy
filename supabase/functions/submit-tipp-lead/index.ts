import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshSalesforceToken(supabase: ReturnType<typeof createClient>, refreshToken: string): Promise<string | null> {
  const clientId = Deno.env.get("SALESFORCE_CLIENT_ID");
  const clientSecret = Deno.env.get("SALESFORCE_CLIENT_SECRET");
  try {
    const res = await fetch("https://carecapital--partial.sandbox.my.salesforce.com/services/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId!,
        client_secret: clientSecret!,
      }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    await supabase.from("salesforce_connections").update({ access_token: data.access_token, updated_at: new Date().toISOString() }).eq("id", "default");
    return data.access_token;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

    // Auth: get calling user
    const authHeader = req.headers.get("authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
      global: { headers: { authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Nicht authentifiziert" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json();
    const { tippLeadId } = body;
    if (!tippLeadId) {
      return new Response(JSON.stringify({ error: "tippLeadId fehlt" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load the tipp_lead
    const { data: tip, error: tipError } = await supabase
      .from("tipp_leads")
      .select("*")
      .eq("id", tippLeadId)
      .single();
    if (tipError || !tip) {
      return new Response(JSON.stringify({ error: "Tipp nicht gefunden" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load tippgeber profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", tip.created_by)
      .single();

    const tippgeberName = profile?.full_name ?? "Unbekannt";
    const tippgeberEmail = profile?.email ?? null;

    // ── 1. Salesforce: Create Lead ──────────────────────────────────────────
    const { data: sfConn } = await supabase
      .from("salesforce_connections")
      .select("access_token, refresh_token, instance_url, is_connected")
      .eq("id", "default")
      .single();

    let sfId: string | null = null;
    let adEmail: string | null = null;
    let adTelefon: string | null = null;

    if (sfConn?.is_connected && sfConn.access_token) {
      let token = sfConn.access_token;
      const instanceUrl = sfConn.instance_url;

      const leadPayload = {
        LastName: tip.arzt_name,
        Company: tip.praxis_name,
        PostalCode: tip.plz,
        Email: tip.email ?? undefined,
        Phone: tip.telefon ?? undefined,
        Description: `[${tip.geschaeftsbereich}] ${tip.gewuenschte_dienstleistung}`,
        LeadSource: "Tippgeber",
        Tippgeber_Name__c: tippgeberName,
        Tippgeber_Email__c: tippgeberEmail ?? undefined,
      };

      let sfRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Lead`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(leadPayload),
      });

      if (sfRes.status === 401 && sfConn.refresh_token) {
        const newToken = await refreshSalesforceToken(supabase, sfConn.refresh_token);
        if (newToken) {
          token = newToken;
          sfRes = await fetch(`${instanceUrl}/services/data/v59.0/sobjects/Lead`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify(leadPayload),
          });
        }
      }

      if (sfRes.ok) {
        const sfData = await sfRes.json();
        sfId = sfData.id ?? null;

        // Try to get assigned owner details from SF
        if (sfId) {
          const ownerRes = await fetch(
            `${instanceUrl}/services/data/v59.0/sobjects/Lead/${sfId}?fields=Owner.Email,Owner.Phone`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (ownerRes.ok) {
            const ownerData = await ownerRes.json();
            adEmail = ownerData?.Owner?.Email ?? null;
            adTelefon = ownerData?.Owner?.Phone ?? null;
          }
        }
      } else {
        const errBody = await sfRes.text();
        console.error("SF Lead creation failed:", sfRes.status, errBody);
      }
    }

    // ── 2. Update tipp_leads with SF data ──────────────────────────────────
    await supabase.from("tipp_leads").update({
      salesforce_id: sfId,
      salesforce_synced: !!sfId,
      ad_email: adEmail,
      ad_telefon: adTelefon,
    }).eq("id", tippLeadId);

    // ── 3. Confirmation email to Tippgeber ─────────────────────────────────
    if (tippgeberEmail && RESEND_API_KEY) {
      const reservationDate = new Date(tip.reservation_until ?? Date.now() + 30 * 86400000);
      const formattedDate = reservationDate.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

      const adSection = (adEmail || adTelefon)
        ? `<tr><td style="padding:16px 24px;background:#f8fafc;border-radius:8px;">
            <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Ihr Ansprechpartner im Außendienst</p>
            ${adEmail ? `<p style="margin:0 0 4px;font-size:14px;color:#0b367f;">📧 <a href="mailto:${adEmail}" style="color:#0b367f;">${adEmail}</a></p>` : ""}
            ${adTelefon ? `<p style="margin:0;font-size:14px;color:#0b367f;">📞 <a href="tel:${adTelefon}" style="color:#0b367f;">${adTelefon}</a></p>` : ""}
           </td></tr>`
        : "";

      const emailHtml = `<!DOCTYPE html><html lang="de"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 16px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px rgba(0,0,0,0.07);">
      <!-- Header -->
      <tr><td style="background:linear-gradient(135deg,#0b367f,#1a4a9e);padding:32px 24px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">Ihr Lead-Tipp ist eingegangen ✓</h1>
        <p style="margin:8px 0 0;color:#c7d7f5;font-size:14px;">Vielen Dank für Ihre Empfehlung!</p>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hallo <strong>${tippgeberName}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          Ihr Lead-Tipp wurde erfolgreich erfasst und wird von unserem Vertriebsteam bearbeitet.
          Die Reservierungsfrist läuft bis zum <strong style="color:#0b367f;">${formattedDate}</strong>.
        </p>
        <!-- Lead details -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Übermittelter Lead</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:140px;">Arzt / Ärztin</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">${tip.arzt_name}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Praxis</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">${tip.praxis_name}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">PLZ</td><td style="padding:4px 0;font-size:13px;color:#111827;">${tip.plz}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Geschäftsbereich</td><td style="padding:4px 0;font-size:13px;color:#111827;">${tip.geschaeftsbereich}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;vertical-align:top;">Dienstleistung</td><td style="padding:4px 0;font-size:13px;color:#111827;">${tip.gewuenschte_dienstleistung}</td></tr>
            </table>
          </td></tr>
        </table>
        ${adSection}
      </td></tr>
      <!-- Footer -->
      <tr><td style="padding:20px 24px;background:#f8fafc;border-top:1px solid #e5e7eb;text-align:center;">
        <p style="margin:0;font-size:12px;color:#9ca3af;">Diese E-Mail wurde automatisch von HFX Honorarfuchs generiert.</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af;">© ${new Date().getFullYear()} HFX Honorarfuchs GmbH</p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "noreply@hfx-honorarfuchs.de",
          to: [tippgeberEmail],
          subject: `Ihr Lead-Tipp für ${tip.praxis_name} wurde erfasst`,
          html: emailHtml,
        }),
      });
    }

    return new Response(
      JSON.stringify({ success: true, salesforce_id: sfId, ad_email: adEmail, ad_telefon: adTelefon }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    console.error("submit-tipp-lead error:", err);
    const message = err instanceof Error ? err.message : "Unbekannter Fehler";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
