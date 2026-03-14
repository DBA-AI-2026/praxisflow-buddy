import { useEffect, useState } from "react";
import { CheckCircle2, Building2, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/logo.png";

export default function MandateSuccess() {
  const [countdown, setCountdown] = useState(10);

  // Auto-redirect after 10 seconds to a generic thank-you URL
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b367f] via-[#1a4a9e] to-[#0b367f] flex items-center justify-center p-4">
      {/* Card */}
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#0b367f] px-8 pt-8 pb-6 text-center">
          <img
            src={logoUrl}
            alt="HFX Honorarfuchs Logo"
            className="w-16 h-16 rounded-full object-cover mx-auto mb-4 border-2 border-white/30"
          />
          <h1 className="text-white text-2xl font-bold">HFX Honorarfuchs</h1>
          <p className="text-blue-200 text-sm mt-1">SEPA-Lastschriftmandat</p>
        </div>

        {/* Success icon */}
        <div className="flex justify-center -mt-8 mb-2">
          <div className="bg-green-500 rounded-full p-3 shadow-lg border-4 border-white">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
        </div>

        {/* Content */}
        <div className="px-8 pb-8 pt-4 text-center space-y-4">
          <h2 className="text-xl font-bold text-gray-900">
            Zahlungsmethode erfolgreich eingerichtet
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Vielen Dank! Ihre SEPA-Lastschrift-Ermächtigung wurde erfolgreich hinterlegt.
            Zukünftige Rechnungen werden automatisch von Ihrem Konto eingezogen.
          </p>

          {/* Info boxes */}
          <div className="space-y-2 text-left">
            <div className="flex items-start gap-3 bg-blue-50 rounded-lg p-3">
              <Building2 className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-900">Automatischer Einzug aktiv</p>
                <p className="text-xs text-blue-700 mt-0.5">
                  Ihre Rechnungen werden künftig automatisch 3 Werktage nach Rechnungsdatum eingezogen.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 bg-green-50 rounded-lg p-3">
              <Mail className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-900">Rechnungen per E-Mail</p>
                <p className="text-xs text-green-700 mt-0.5">
                  Sie erhalten jede Rechnung vorab per E-Mail als PDF zugesendet.
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 pt-2">
            Sie können dieses Fenster nun schließen.
          </p>

          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full gap-2 border-[#0b367f] text-[#0b367f] hover:bg-[#0b367f] hover:text-white transition-colors"
              onClick={() => window.close()}
            >
              Fenster schließen
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-gray-300">
            Bei Fragen wenden Sie sich an{" "}
            <a href="mailto:info@hfx-honorarfuchs.de" className="text-[#0b367f] underline">
              info@hfx-honorarfuchs.de
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
