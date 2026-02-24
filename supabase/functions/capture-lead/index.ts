import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const ALLOWED_ORIGINS = [
  "https://praxisflow-buddy.lovable.app",
  "https://id-preview--f9dcf8ed-b381-4f00-af4c-2993b99115fa.lovable.app",
  "https://www.honorarfuchs.de",
  "https://honorarfuchs.de",
  "http://localhost:5173",
  "http://localhost:3000",
];

function getCorsHeaders(origin: string | null) {
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin || "") ? origin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Access-Control-Allow-Credentials": "true",
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      praxis_name,
      vorname,
      nachname,
      email,
      plz,
      mobilnummer,
      abrechnungszentrum,
      mp_nummer,
      nachricht,
    } = body;

    // Validate required fields
    if (!praxis_name || !vorname || !nachname || !email || !plz || !mobilnummer || !abrechnungszentrum) {
      return new Response(
        JSON.stringify({ error: "Fehlende Pflichtfelder" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Ungültige E-Mail-Adresse" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate abrechnungszentrum values
    const validAbrechnungszentren = ["nein", "CareCapital", "privadis", "anderes"];
    if (!validAbrechnungszentren.includes(abrechnungszentrum)) {
      return new Response(
        JSON.stringify({ error: "Ungültiges Abrechnungszentrum" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // MP-Nummer required for CareCapital and privadis
    if ((abrechnungszentrum === "CareCapital" || abrechnungszentrum === "privadis") && !mp_nummer) {
      return new Response(
        JSON.stringify({ error: "MP-Nummer ist bei CareCapital/privadis erforderlich" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save to database using service role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: lead, error: insertError } = await supabase
      .from("leads")
      .insert({
        praxis_name: praxis_name.trim().slice(0, 200),
        vorname: vorname.trim().slice(0, 100),
        nachname: nachname.trim().slice(0, 100),
        email: email.trim().toLowerCase().slice(0, 255),
        plz: plz.trim().slice(0, 10),
        mobilnummer: mobilnummer.trim().slice(0, 30),
        abrechnungszentrum,
        mp_nummer: mp_nummer?.trim().slice(0, 50) || null,
        nachricht: nachricht?.trim().slice(0, 2000) || null,
      })
      .select("id, hfx_customer_number")
      .single();

    if (insertError) {
      console.error("Error inserting lead:", insertError);
      return new Response(
        JSON.stringify({ error: "Fehler beim Speichern" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Lead created: ${lead.hfx_customer_number} for ${email}`);

    // Send confirmation email via Resend
    try {
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (resendApiKey) {
        const resend = new Resend(resendApiKey);
        await resend.emails.send({
          from: "HFX Honorarfuchs <noreply@hfx-honorarfuchs.de>",
          to: [email],
          subject: `Ihre Anfrage bei Honorarfuchs – ${lead.hfx_customer_number}`,
          html: `
            <!DOCTYPE html>
            <html>
            <head><meta charset="utf-8"></head>
            <body style="font-family: Arial, sans-serif; background: #ffffff; margin: 0; padding: 0;">
              <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #0b367f, #1a4a9e); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h1 style="margin: 0; font-size: 24px;">🦊 Vielen Dank für Ihr Interesse!</h1>
                  <p style="margin: 10px 0 0 0; opacity: 0.9;">Honorarfuchs – Ihre Anfrage ist eingegangen</p>
                </div>
                <div style="background: #f9fafb; padding: 25px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
                  <p style="font-size: 16px; color: #333;">Guten Tag ${vorname} ${nachname},</p>
                  <p style="color: #555;">wir haben Ihre Anfrage erhalten und werden uns schnellstmöglich bei Ihnen melden.</p>
                  <div style="background: white; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; margin: 20px 0;">
                    <p style="margin: 0 0 8px 0; font-size: 12px; text-transform: uppercase; color: #6b7280; font-weight: bold;">Ihre Referenznummer</p>
                    <p style="margin: 0; font-size: 20px; font-weight: bold; color: #0b367f;">${lead.hfx_customer_number}</p>
                  </div>
                  <p style="color: #555; font-size: 14px;">Bitte bewahren Sie diese Nummer für Rückfragen auf.</p>
                  <p style="color: #888; font-size: 12px; margin-top: 30px;">Mit freundlichen Grüßen<br>Ihr Honorarfuchs-Team</p>
                </div>
              </div>
            </body>
            </html>
          `,
        });

        await supabase
          .from("leads")
          .update({ confirmation_email_sent: true })
          .eq("id", lead.id);

        console.log(`Confirmation email sent to ${email}`);
      }
    } catch (emailErr) {
      console.error("Error sending confirmation email:", emailErr);
      // Don't fail the request if email fails
    }

    // Sync to Salesforce (async, don't block response)
    try {
      const { data: sfConn } = await supabase
        .from("salesforce_connections")
        .select("access_token, instance_url, is_connected")
        .eq("id", "default")
        .maybeSingle();

      if (sfConn?.is_connected && sfConn.access_token && sfConn.instance_url) {
        const sfResponse = await fetch(`${sfConn.instance_url}/services/data/v59.0/sobjects/Lead`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${sfConn.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Company: praxis_name,
            FirstName: vorname,
            LastName: nachname,
            Email: email,
            PostalCode: plz,
            MobilePhone: mobilnummer,
            Description: nachricht || "",
            LeadSource: "Website",
            MPID__c: mp_nummer || "",
          }),
        });

        if (sfResponse.ok) {
          const sfData = await sfResponse.json();
          await supabase
            .from("leads")
            .update({ salesforce_synced: true, salesforce_id: sfData.id })
            .eq("id", lead.id);
          console.log(`Lead synced to Salesforce: ${sfData.id}`);
        } else {
          const errText = await sfResponse.text();
          console.error("Salesforce sync failed:", errText);
        }
      }
    } catch (sfErr) {
      console.error("Salesforce sync error:", sfErr);
    }

    // TODO: Sync to Qodia API
    // TODO: Sync to HonorarPlus API

    return new Response(
      JSON.stringify({
        success: true,
        hfx_customer_number: lead.hfx_customer_number,
        message: "Ihre Anfrage wurde erfolgreich übermittelt.",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in capture-lead:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
