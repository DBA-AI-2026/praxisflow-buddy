// KampagneRedirect
// Öffentliche Kunden-Redirect-Seite. Ziel: In Kampagnen-Mails erscheint
// der Klick-Link als https://sales.hfx-honorarfuchs.de/kampagne?token=…
// statt als nackte …supabase.co/functions/v1/…-URL (Phishing-Optik).
//
// Diese Seite hat KEINE eigene Logik: Sie reicht token unverändert an die
// Edge Function `campaign-start` durch. Alle Gates (Token-Format, Lead-
// Lookup, Status-Allowlist, promo_end_date, Booking-Reuse/Neuanlage)
// leben dort — genau eine Stelle.
//
// Kein Supabase-Client-Import (nur die Env-Variable wird gelesen).
// window.location.replace, nicht href — kein History-Eintrag.
// Spiegelt MandatRedirect.tsx 1:1.

import { useEffect } from "react";

const NAVY = "#0b367f";

export default function KampagneRedirect() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  const target = token
    ? `${supabaseUrl}/functions/v1/campaign-start?token=${encodeURIComponent(token)}`
    : `${supabaseUrl}/functions/v1/campaign-start`;

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: NAVY,
        color: "#fff",
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            width: 40,
            height: 40,
            border: "3px solid rgba(255,255,255,0.3)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            margin: "0 auto 16px",
            animation: "kampagne-spin 0.9s linear infinite",
          }}
        />
        <div style={{ fontSize: 15 }}>Einen Moment, Sie werden weitergeleitet…</div>
        <style>{`@keyframes kampagne-spin { to { transform: rotate(360deg); } }`}</style>
        <noscript>
          <p style={{ marginTop: 16 }}>
            JavaScript ist deaktiviert.{" "}
            <a href={target} style={{ color: "#fff", textDecoration: "underline" }}>
              Hier weiter zur Buchung
            </a>
            .
          </p>
        </noscript>
      </div>
    </div>
  );
}
