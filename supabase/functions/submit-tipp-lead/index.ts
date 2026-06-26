import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderBrandedEmail } from "../_shared/email-templates/baseEmailLayout.ts";

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
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
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

    // ── 1. PLZ-Zuordnung: Zentrale Logik via DB-Funktion resolve_plz_ad() ────
    // Manuelle Zuweisung (ad_email bereits auf tipp_lead gesetzt) überschreibt Automatik.
    // Kein Treffer → adEmail bleibt null (assignment_source: 'none' = ungeklärt)
    let adEmail: string | null = null;
    let adTelefon: string | null = null;
    let assignmentSource = "none";
    let matchedRule: string | null = null;
    let resolvedGlId: string | null = null;
    let resolvedGlName: string | null = null;

    const { data: resolved, error: plzResolveErr } = await supabase
      .rpc("resolve_plz_ad", { plz_input: tip.plz ?? "" });

    if (plzResolveErr) {
      console.error("resolve_plz_ad error:", plzResolveErr.message);
    } else if (resolved && resolved.length > 0 && resolved[0].gebietsleiter_id) {
      resolvedGlId = resolved[0].gebietsleiter_id;
      resolvedGlName = resolved[0].gebietsleiter_name;
      matchedRule = resolved[0].matched_rule;
      assignmentSource = "auto_plz";

      const { data: adProfile } = await supabase
        .from("profiles")
        .select("email")
        .eq("user_id", resolvedGlId)
        .single();
      if (adProfile?.email) adEmail = adProfile.email;
      console.log(`Tipp-Lead PLZ ${tip.plz} → assigned to ${resolvedGlName} (rule: ${matchedRule})`);
    } else {
      console.log(`No GL mapping found for PLZ ${tip.plz} – ungeklärt`);
    }

    // Protokolliere Zuordnung im zentralen PLZ-Assignment-Log
    supabase.from("plz_assignment_log").insert({
      entity_type: "tipp_lead",
      entity_id: tippLeadId,
      plz: tip.plz,
      resolved_gebietsleiter_id: resolvedGlId,
      resolved_gebietsleiter_name: resolvedGlName,
      assignment_source: assignmentSource,
      matched_rule: matchedRule,
    }).then(({ error: logErr }) => {
      if (logErr) console.error("plz_assignment_log insert error:", logErr.message);
    });

    // ── 2. Salesforce: Create Lead ──────────────────────────────────────────
    const { data: sfConn } = await supabase
      .from("salesforce_connections")
      .select("access_token, refresh_token, instance_url, is_connected")
      .eq("id", "default")
      .single();

    let sfId: string | null = null;

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

        // Try to get assigned owner details from SF (only if PLZ mapping didn't provide them)
        if (sfId && !adEmail) {
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

    // ── 2. Update tipp_leads with SF data + assignment_source ──────────────
    await supabase.from("tipp_leads").update({
      salesforce_id: sfId,
      salesforce_synced: !!sfId,
      ad_email: adEmail,
      ad_telefon: adTelefon,
      assignment_source: assignmentSource,
    }).eq("id", tippLeadId);


    // ── 3. Load email notification settings ───────────────────────────────
    const { data: emailSettings } = await supabase
      .from("email_notification_settings")
      .select("setting_key, is_enabled")
      .in("setting_key", ["tipp_lead_ad_notification", "tipp_lead_tippgeber_confirmation"]);
    const settingsMap = Object.fromEntries((emailSettings ?? []).map((s: any) => [s.setting_key, s.is_enabled]));
    const adNotifEnabled = settingsMap["tipp_lead_ad_notification"] !== false;
    const tippgeberConfirmEnabled = settingsMap["tipp_lead_tippgeber_confirmation"] !== false;

    // ── 4. Notification email to AD ────────────────────────────────────────
    if (adEmail && RESEND_API_KEY && adNotifEnabled) {
      const adBodyHtml = `
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hallo,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          Ein neuer Lead-Tipp von <strong>${tippgeberName}</strong> wurde eingereicht und Ihnen zugeordnet.
        </p>
        <!-- Lead details -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-bottom:20px;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Lead-Details</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:160px;">Arzt / Ärztin</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">${tip.arzt_name}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Praxis</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">${tip.praxis_name}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">PLZ</td><td style="padding:4px 0;font-size:13px;color:#111827;">${tip.plz}</td></tr>
              ${tip.email ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">E-Mail Praxis</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="mailto:${tip.email}" style="color:#0b367f;">${tip.email}</a></td></tr>` : ""}
              ${tip.telefon ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Telefon Praxis</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="tel:${tip.telefon}" style="color:#0b367f;">${tip.telefon}</a></td></tr>` : ""}
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Geschäftsbereich</td><td style="padding:4px 0;font-size:13px;color:#111827;">${tip.geschaeftsbereich}</td></tr>
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;vertical-align:top;">Dienstleistung</td><td style="padding:4px 0;font-size:13px;color:#111827;">${tip.gewuenschte_dienstleistung}</td></tr>
            </table>
          </td></tr>
        </table>
        <!-- Tippgeber details -->
        <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
          <tr><td style="background:#f8fafc;padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <p style="margin:0;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:#6b7280;">Empfohlen von</p>
          </td></tr>
          <tr><td style="padding:16px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr><td style="padding:4px 0;font-size:13px;color:#6b7280;width:160px;">Tippgeber</td><td style="padding:4px 0;font-size:13px;color:#111827;font-weight:500;">${tippgeberName}</td></tr>
              ${tippgeberEmail ? `<tr><td style="padding:4px 0;font-size:13px;color:#6b7280;">Kontakt</td><td style="padding:4px 0;font-size:13px;color:#0b367f;"><a href="mailto:${tippgeberEmail}" style="color:#0b367f;">${tippgeberEmail}</a></td></tr>` : ""}
            </table>
          </td></tr>
        </table>`;

      const adBodyText = [
        "Hallo,",
        "",
        `Ein neuer Lead-Tipp von ${tippgeberName} wurde eingereicht und Ihnen zugeordnet.`,
        "",
        "Lead-Details:",
        `- Arzt / Ärztin: ${tip.arzt_name}`,
        `- Praxis: ${tip.praxis_name}`,
        `- PLZ: ${tip.plz}`,
        ...(tip.email ? [`- E-Mail Praxis: ${tip.email}`] : []),
        ...(tip.telefon ? [`- Telefon Praxis: ${tip.telefon}`] : []),
        `- Geschäftsbereich: ${tip.geschaeftsbereich}`,
        `- Dienstleistung: ${tip.gewuenschte_dienstleistung}`,
        "",
        "Empfohlen von:",
        `- Tippgeber: ${tippgeberName}`,
        ...(tippgeberEmail ? [`- Kontakt: ${tippgeberEmail}`] : []),
      ].join("\n");

      const { html: adHtml, text: adText } = renderBrandedEmail({
        subheadline: "Neuer Lead-Tipp eingegangen",
        bodyHtml: adBodyHtml,
        bodyText: adBodyText,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "noreply@hfx-honorarfuchs.de",
          to: [adEmail],
          subject: `Neuer Lead-Tipp: ${tip.praxis_name} (PLZ ${tip.plz})`,
          html: adHtml,
          text: adText,
        }),
      });
    }

    // ── 5. Confirmation email to Tippgeber ─────────────────────────────────
    if (tippgeberEmail && RESEND_API_KEY && tippgeberConfirmEnabled) {
      const reservationDate = new Date(tip.reservation_until ?? Date.now() + 30 * 86400000);
      const formattedDate = reservationDate.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

      const adSection = (adEmail || adTelefon)
        ? `<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin-top:8px;">
            <tr><td style="padding:16px;background:#f8fafc;">
              <p style="margin:0 0 8px;font-size:13px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">Ihr Ansprechpartner im Außendienst</p>
              ${adEmail ? `<p style="margin:0 0 4px;font-size:14px;color:#0b367f;">📧 <a href="mailto:${adEmail}" style="color:#0b367f;">${adEmail}</a></p>` : ""}
              ${adTelefon ? `<p style="margin:0;font-size:14px;color:#0b367f;">📞 <a href="tel:${adTelefon}" style="color:#0b367f;">${adTelefon}</a></p>` : ""}
            </td></tr>
          </table>`
        : "";

      const tippgeberBodyHtml = `
        <p style="margin:0 0 16px;font-size:15px;color:#374151;">Hallo <strong>${tippgeberName}</strong>,</p>
        <p style="margin:0 0 24px;font-size:14px;color:#6b7280;line-height:1.6;">
          vielen Dank für Ihre Empfehlung! Ihr Lead-Tipp wurde erfolgreich erfasst und wird von unserem Vertriebsteam bearbeitet.
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
        ${adSection}`;

      const tippgeberBodyText = [
        `Hallo ${tippgeberName},`,
        "",
        `vielen Dank für Ihre Empfehlung! Ihr Lead-Tipp wurde erfolgreich erfasst und wird von unserem Vertriebsteam bearbeitet. Die Reservierungsfrist läuft bis zum ${formattedDate}.`,
        "",
        "Übermittelter Lead:",
        `- Arzt / Ärztin: ${tip.arzt_name}`,
        `- Praxis: ${tip.praxis_name}`,
        `- PLZ: ${tip.plz}`,
        `- Geschäftsbereich: ${tip.geschaeftsbereich}`,
        `- Dienstleistung: ${tip.gewuenschte_dienstleistung}`,
        ...((adEmail || adTelefon)
          ? [
              "",
              "Ihr Ansprechpartner im Außendienst:",
              ...(adEmail ? [`- E-Mail: ${adEmail}`] : []),
              ...(adTelefon ? [`- Telefon: ${adTelefon}`] : []),
            ]
          : []),
      ].join("\n");

      const { html: tippgeberHtml, text: tippgeberText } = renderBrandedEmail({
        subheadline: "Ihr Lead-Tipp ist eingegangen",
        bodyHtml: tippgeberBodyHtml,
        bodyText: tippgeberBodyText,
      });

      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "noreply@hfx-honorarfuchs.de",
          to: [tippgeberEmail],
          subject: `Ihr Lead-Tipp für ${tip.praxis_name} wurde erfasst`,
          html: tippgeberHtml,
          text: tippgeberText,
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
