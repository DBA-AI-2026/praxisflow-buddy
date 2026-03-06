import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, FileText } from "lucide-react";

export default function ContractConfirmation() {
  const [searchParams] = useSearchParams();
  const status = searchParams.get("status");
  const contractId = searchParams.get("contract_id");

  const isSuccess = status === "success";
  const isCancelled = status === "cancelled";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Brand header */}
        <div className="text-center mb-8">
          <p className="text-2xl font-bold text-primary">🦊 HFX Honorarfuchs</p>
          <p className="text-sm text-muted-foreground mt-1">Vertragsabschluss</p>
        </div>

        {isSuccess && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="bg-success/10 rounded-full p-6 w-fit mx-auto mb-4">
                <CheckCircle2 className="h-16 w-16 text-success" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Vielen Dank für Ihre Buchung!</h1>
              <p className="text-muted-foreground mt-2 leading-relaxed">
                Ihre Zahlung war erfolgreich. Ihr Vertrag wurde aktiviert.
              </p>
            </div>

            <div className="bg-card border rounded-lg overflow-hidden">
              <div className="bg-primary px-5 py-3">
                <p className="text-primary-foreground text-sm font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Was passiert als nächstes?
                </p>
              </div>
              <div className="p-5 text-sm space-y-2 text-muted-foreground">
                <p>✅ Ihr Vertrag ist jetzt aktiv.</p>
                <p>📧 Eine Buchungsbestätigung erhalten Sie in Kürze per E-Mail.</p>
                <p>👤 Ihr zuständiger Außendienstmitarbeiter meldet sich zeitnah bei Ihnen.</p>
              </div>
            </div>
          </div>
        )}

        {isCancelled && (
          <div className="space-y-6 text-center">
            <div className="bg-muted rounded-full p-6 w-fit mx-auto">
              <XCircle className="h-16 w-16 text-muted-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Buchung abgebrochen</h1>
              <p className="text-muted-foreground mt-2 leading-relaxed">
                Sie haben den Buchungsvorgang abgebrochen. Ihr Vertrag wurde noch nicht aktiviert.
              </p>
              <p className="text-muted-foreground mt-3 text-sm">
                Sie können die Buchung jederzeit über den Link in Ihrer E-Mail erneut starten.
              </p>
            </div>
          </div>
        )}

        {!isSuccess && !isCancelled && (
          <div className="space-y-6 text-center">
            <div className="bg-destructive/10 rounded-full p-6 w-fit mx-auto">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Ungültiger Link</h1>
              <p className="text-muted-foreground mt-2">
                Dieser Link ist nicht gültig. Bitte nutzen Sie den Button aus Ihrer E-Mail.
              </p>
            </div>
          </div>
        )}

        <div className="mt-10 pt-6 border-t text-center">
          <p className="text-xs text-muted-foreground">
            Bei Fragen:{" "}
            <a href="mailto:info@hfx-honorarfuchs.de" className="text-primary hover:underline">
              info@hfx-honorarfuchs.de
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
