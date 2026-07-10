import { requireActiveRole } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const guard = await requireActiveRole(req, ["admin"], corsHeaders);
  if (guard instanceof Response) return guard;


  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { html, instruction } = await req.json();
    if (!html || !instruction) {
      return new Response(JSON.stringify({ error: "html and instruction required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `Du bist ein HTML-E-Mail-Editor-Assistent. Der Benutzer gibt dir eine bestehende HTML-E-Mail-Vorlage und eine Anweisung, was geändert werden soll.

REGELN:
- Gib NUR den vollständigen, geänderten HTML-Code zurück – keine Erklärungen, kein Markdown, keine Code-Blöcke.
- Behalte das bestehende Design, Layout und Inline-CSS bei.
- Ändere nur das, was der Benutzer anweist.
- Die E-Mail ist für den HFX Honorarfuchs (medizinische Abrechnungssoftware).
- Alle Texte müssen auf Deutsch sein, sofern nicht anders gewünscht.
- Behalte alle Platzhalter/Variablen (z.B. \${contract.vorname}) bei.`
          },
          {
            role: "user",
            content: `Hier ist die aktuelle HTML-E-Mail-Vorlage:\n\n${html}\n\nAnweisung: ${instruction}`
          }
        ],
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "KI-Rate-Limit erreicht. Bitte versuche es in einer Minute erneut." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "KI-Guthaben aufgebraucht." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error("AI gateway error");
    }

    const result = await aiResponse.json();
    let modifiedHtml = result.choices?.[0]?.message?.content || "";

    // Strip markdown code fences if present
    modifiedHtml = modifiedHtml.replace(/^```html?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();

    return new Response(
      JSON.stringify({ html: modifiedHtml }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[edit-email-template] Error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
