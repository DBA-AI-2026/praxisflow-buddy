import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

// DEPRECATED — Alte Stripe-Welt, abgeklemmt am 08.05.2026.
// Diese Function wird nicht mehr aufgerufen. Falls doch — siehe Logs.

serve(async (req) => {
  const callerInfo = {
    method: req.method,
    url: req.url,
    referer: req.headers.get("referer") ?? "—",
    userAgent: req.headers.get("user-agent") ?? "—",
    origin: req.headers.get("origin") ?? "—",
    timestamp: new Date().toISOString(),
  };
  console.warn("[DEPRECATED][check-subscription] caller=", JSON.stringify(callerInfo));

  return new Response(
    JSON.stringify({
      error: "deprecated",
      message: "This endpoint has been deprecated. Please contact support.",
    }),
    {
      status: 410,
      headers: { "Content-Type": "application/json" },
    },
  );
});
