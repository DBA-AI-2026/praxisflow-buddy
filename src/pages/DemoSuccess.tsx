import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DemoSuccess() {
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!sessionId) {
      setStatus("error");
      setMessage("Kein Session-Parameter gefunden.");
      return;
    }
    // The stripe-webhook handles the actual contract creation asynchronously.
    // We just confirm to the user that payment was received.
    const timer = setTimeout(() => {
      setStatus("success");
    }, 1500);
    return () => clearTimeout(timer);
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Logo / Brand */}
        <div className="mb-8">
          <p className="text-2xl font-bold text-primary">HFX Honorarfuchs</p>
          <p className="text-sm text-muted-foreground mt-1">Sales Portal</p>
        </div>

        {status === "loading" && (
          <div className="space-y-4">
            <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">Zahlung wird verarbeitet…</h1>
            <p className="text-muted-foreground text-sm">Bitte einen Moment warten.</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-6">
            <div className="bg-success/10 rounded-full p-6 w-fit mx-auto">
              <CheckCircle className="h-16 w-16 text-success" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Vielen Dank für Ihre Buchung!</h1>
              <p className="text-muted-foreground leading-relaxed">
                Ihre Zahlung war erfolgreich. Ihr HFX-Abonnement ist jetzt aktiv.
              </p>
            </div>

            <div className="bg-card border rounded-lg p-5 text-left space-y-2 text-sm">
              <p className="font-semibold text-foreground">Was passiert jetzt?</p>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>Sie erhalten eine Bestätigungs-E-Mail.</li>
                <li>Ihr zuständiger Außendienstmitarbeiter meldet sich bei Ihnen.</li>
                <li>Der Vertrag wurde automatisch angelegt.</li>
              </ul>
            </div>

            <p className="text-xs text-muted-foreground">
              Session-ID: <span className="font-mono">{sessionId?.slice(0, 20)}…</span>
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="space-y-6">
            <div className="bg-destructive/10 rounded-full p-6 w-fit mx-auto">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Ein Fehler ist aufgetreten</h1>
              <p className="text-muted-foreground">{message}</p>
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t">
          <p className="text-xs text-muted-foreground">
            Bei Fragen wenden Sie sich bitte an{" "}
            <a href="mailto:info@hfx-honorarfuchs.de" className="text-primary hover:underline">
              info@hfx-honorarfuchs.de
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
