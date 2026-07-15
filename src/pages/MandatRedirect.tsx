// MandatRedirect
// Öffentliche Kunden-Redirect-Seite. Ziel: In Kundenmails erscheint der
// Mandat-Link als https://sales.hfx-honorarfuchs.de/mandat?contract_id=…
// statt als nackte …supabase.co/functions/v1/…-URL (Phishing-Optik).
//
// Diese Seite hat KEINE eigene Logik: Sie reicht contract_id unverändert
// an die Edge Function `mandate-link` durch. Alle Gates (UUID, Status,
// stripe_customer_id, Session-Mint) leben dort — genau eine Stelle.
//
// Kein Supabase-Client-Import (nur die Env-Variable wird gelesen).
// window.location.replace, nicht href — kein History-Eintrag.

import { useEffect } from "react";

const NAVY = "#0b367f";

export default function MandatRedirect() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const params = new URLSearchParams(window.location.search);
  const contractId = params.get("contract_id");
  const target = contractId
    ? `${supabaseUrl}/functions/v1/mandate-link?contract_id=${encodeURIComponent(contractId)}`
    : `${supabaseUrl}/functions/v1/mandate-link`;

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
            animation: "mandat-spin 0.9s linear infinite",
          }}
        />
        <div style={{ fontSize: 15 }}>Einen Moment, Sie werden weitergeleitet…</div>
        <style>{`@keyframes mandat-spin { to { transform: rotate(360deg); } }`}</style>
        <noscript>
          <p style={{ marginTop: 16 }}>
            JavaScript ist deaktiviert.{" "}
            <a href={target} style={{ color: "#fff", textDecoration: "underline" }}>
              Hier weiter zum Mandat
            </a>
            .
          </p>
        </noscript>
      </div>
    </div>
  );
}
