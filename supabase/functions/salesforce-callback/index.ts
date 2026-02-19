import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://praxisflow-buddy.lovable.app",
  "https://id-preview--f9dcf8ed-b381-4f00-af4c-2993b99115fa.lovable.app",
  "http://localhost:5173",
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

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const errorDescription = url.searchParams.get("error_description");

    if (error) {
      console.error("Salesforce OAuth error:", error, errorDescription);
      return new Response(
        `<html><body><h1>Fehler</h1><p>${errorDescription || error}</p><script>setTimeout(() => window.close(), 3000);</script></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    if (!code) {
      console.error("No authorization code received");
      return new Response(
        `<html><body><h1>Fehler</h1><p>Kein Autorisierungscode erhalten</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const SALESFORCE_CLIENT_ID = Deno.env.get("SALESFORCE_CLIENT_ID");
    const SALESFORCE_CLIENT_SECRET = Deno.env.get("SALESFORCE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SALESFORCE_CLIENT_ID || !SALESFORCE_CLIENT_SECRET) {
      console.error("Missing Salesforce credentials");
      return new Response(
        `<html><body><h1>Fehler</h1><p>Salesforce nicht konfiguriert</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // Get the code verifier from database
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    const { data: connectionData, error: fetchError } = await supabase
      .from("salesforce_connections")
      .select("code_verifier")
      .eq("id", "default")
      .single();

    if (fetchError || !connectionData?.code_verifier) {
      console.error("Failed to retrieve code verifier:", fetchError);
      return new Response(
        `<html><body><h1>Fehler</h1><p>OAuth-Session abgelaufen. Bitte erneut versuchen.</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    const codeVerifier = connectionData.code_verifier;
    console.log("Retrieved code verifier for token exchange");

    // Exchange authorization code for access token with PKCE
    const redirectUri = `${SUPABASE_URL}/functions/v1/salesforce-callback`;
    
    const tokenResponse = await fetch("https://carecapital--partial.sandbox.my.salesforce.com/services/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: SALESFORCE_CLIENT_ID,
        client_secret: SALESFORCE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenData);
      return new Response(
        `<html><body><h1>Fehler</h1><p>Token-Austausch fehlgeschlagen: ${tokenData.error_description || tokenData.error}</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    console.log("Successfully obtained Salesforce tokens");

    // Store the tokens in the database and clear code_verifier
    const { error: dbError } = await supabase
      .from("salesforce_connections")
      .upsert({
        id: "default",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        instance_url: tokenData.instance_url,
        token_type: tokenData.token_type,
        issued_at: new Date(parseInt(tokenData.issued_at)).toISOString(),
        is_connected: true,
        code_verifier: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "id" });

    if (dbError) {
      console.error("Failed to store tokens:", dbError);
      return new Response(
        `<html><body><h1>Fehler</h1><p>Tokens konnten nicht gespeichert werden</p></body></html>`,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    console.log("Salesforce connection stored successfully");

    // Return success page that closes itself
    return new Response(
      `<html>
        <head>
          <style>
            body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f0fdf4; }
            .success { text-align: center; padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
            .icon { font-size: 4rem; margin-bottom: 1rem; }
            h1 { color: #16a34a; margin: 0 0 0.5rem; }
            p { color: #6b7280; margin: 0; }
          </style>
        </head>
        <body>
          <div class="success">
            <div class="icon">✅</div>
            <h1>Verbunden!</h1>
            <p>Salesforce wurde erfolgreich verbunden.</p>
            <p style="margin-top: 1rem; font-size: 0.875rem;">Dieses Fenster schließt sich automatisch...</p>
          </div>
          <script>
            setTimeout(() => {
              window.opener?.postMessage({ type: 'salesforce-connected' }, '*');
              window.close();
            }, 2000);
          </script>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error: unknown) {
    console.error("Callback error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      `<html><body><h1>Fehler</h1><p>${message}</p></body></html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
});
