import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function ContractConfirmation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "already" | "error">("loading");
  const [contractInfo, setContractInfo] = useState<{
    customer_name?: string;
    product_name?: string;
    hfx_customer_number?: string;
    praxis?: string;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("Kein Bestätigungstoken gefunden. Bitte nutzen Sie den Link aus Ihrer E-Mail.");
      return;
    }

    const confirm = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("confirm-paper-contract", {
          body: { token },
        });

        if (error) {
          throw new Error(error.message || "Bestätigung fehlgeschlagen.");
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        setContractInfo({
          customer_name: data.customer_name,
          product_name: data.product_name,
          hfx_customer_number: data.hfx_customer_number,
          praxis: data.praxis,
        });

        setStatus(data.already_confirmed ? "already" : "success");
      } catch (err: any) {
        setErrorMessage(err.message || "Ein unbekannter Fehler ist aufgetreten.");
        setStatus("error");
      }
    };

    confirm();
  }, [token]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full">
        {/* Brand header */}
        <div className="text-center mb-8">
          <p className="text-2xl font-bold text-primary">🦊 HFX Honorarfuchs</p>
          <p className="text-sm text-muted-foreground mt-1">Vertragsbestätigung</p>
        </div>

        {status === "loading" && (
          <div className="text-center space-y-4">
            <Loader2 className="h-16 w-16 animate-spin text-primary mx-auto" />
            <h1 className="text-xl font-semibold text-foreground">Vertrag wird bestätigt…</h1>
            <p className="text-muted-foreground text-sm">Bitte einen Moment warten.</p>
          </div>
        )}

        {status === "success" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="bg-success/10 rounded-full p-6 w-fit mx-auto mb-4">
                <CheckCircle2 className="h-16 w-16 text-success" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Vertrag bestätigt!</h1>
              <p className="text-muted-foreground mt-2 leading-relaxed">
                Ihr Vertrag wurde erfolgreich bestätigt und ist jetzt aktiv.
              </p>
            </div>

            {contractInfo && (
              <div className="bg-card border rounded-lg overflow-hidden">
                <div className="bg-primary px-5 py-3">
                  <p className="text-primary-foreground text-sm font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Ihre Vertragsdetails
                  </p>
                </div>
                <div className="p-5 space-y-2 text-sm">
                  {contractInfo.hfx_customer_number && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">HFX-Kundennummer</span>
                      <span className="font-mono font-semibold text-foreground">{contractInfo.hfx_customer_number}</span>
                    </div>
                  )}
                  {contractInfo.praxis && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Praxis</span>
                      <span className="font-medium text-foreground">{contractInfo.praxis}</span>
                    </div>
                  )}
                  {contractInfo.customer_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vertragspartner</span>
                      <span className="font-medium text-foreground">{contractInfo.customer_name}</span>
                    </div>
                  )}
                  {contractInfo.product_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Produkt</span>
                      <span className="font-medium text-foreground">{contractInfo.product_name}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-success/5 border border-success/30 rounded-lg p-4 text-sm text-success-foreground">
              <p className="font-semibold text-success mb-1">Was passiert als nächstes?</p>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                <li>Ihr Vertrag ist jetzt aktiv.</li>
                <li>Ihr zuständiger Außendienstmitarbeiter meldet sich bei Ihnen.</li>
                <li>Sie erhalten in Kürze weitere Informationen per E-Mail.</li>
              </ul>
            </div>
          </div>
        )}

        {status === "already" && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="bg-primary/10 rounded-full p-6 w-fit mx-auto mb-4">
                <CheckCircle2 className="h-16 w-16 text-primary" />
              </div>
              <h1 className="text-2xl font-bold text-foreground">Bereits bestätigt</h1>
              <p className="text-muted-foreground mt-2 leading-relaxed">
                Ihr Vertrag wurde bereits bestätigt und ist aktiv.
              </p>
            </div>
            {contractInfo?.hfx_customer_number && (
              <p className="text-center text-sm text-muted-foreground">
                HFX-Nr.: <span className="font-mono font-medium text-foreground">{contractInfo.hfx_customer_number}</span>
              </p>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="space-y-6 text-center">
            <div className="bg-destructive/10 rounded-full p-6 w-fit mx-auto">
              <XCircle className="h-16 w-16 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Fehler</h1>
              <p className="text-muted-foreground mt-2">{errorMessage}</p>
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
