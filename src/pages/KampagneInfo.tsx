import { Info, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoUrl from "@/assets/fuchs-bildmarke.png";
import { ENTITY_TAGLINE } from "@/lib/entityCanon";

/**
 * KampagneInfo — Neutrale Info-Seite, auf die die öffentliche
 * `campaign-start`-Edge-Function bei allen nicht-eligiblen Fällen
 * weiterleitet (kein Token, ungültiges Format, nicht gefunden, Status
 * nicht in Allowlist, Promo abgelaufen, DB-/Booking-Fehler, bereits
 * aktiver Vertrag).
 *
 * Bewusst identischer Inhalt für alle Fälle — keine Enumeration,
 * kein Leak, ob ein Token existiert. Spiegelt MandateInfo.tsx 1:1.
 */
export default function KampagneInfo() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b367f] via-[#1a4a9e] to-[#0b367f] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-[#0b367f] px-8 pt-8 pb-6 text-center">
          <img
            src={logoUrl}
            alt="HFX Honorarfuchs Logo"
            className="w-16 h-16 rounded-full object-contain bg-white p-1 mx-auto mb-4"
          />
          <h1 className="text-white text-2xl font-bold">HFX Honorarfuchs</h1>
          <p className="text-blue-200 text-sm mt-1">Kampagnen-Angebot</p>
        </div>

        <div className="flex justify-center -mt-8 mb-2">
          <div className="bg-[#0b367f] rounded-full p-3 shadow-lg border-4 border-white">
            <Info className="h-10 w-10 text-white" />
          </div>
        </div>

        <div className="px-8 pb-8 pt-4 text-center space-y-4">
          <h2 className="text-xl font-bold text-gray-900">
            Dieser Link ist nicht mehr aktiv
          </h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Der Kampagnen-Link ist entweder abgelaufen, wurde bereits verwendet
            oder ist ungültig. Falls Ihr Vertrag bereits aktiv ist, ist keine
            weitere Aktion erforderlich.
          </p>

          <div className="flex items-start gap-3 bg-blue-50 rounded-lg p-3 text-left">
            <Mail className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                Sie haben Fragen?
              </p>
              <p className="text-xs text-blue-700 mt-0.5">
                Unser Team hilft Ihnen gerne weiter — kontaktieren Sie uns
                einfach per E-Mail.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <Button
              variant="outline"
              className="w-full gap-2 border-[#0b367f] text-[#0b367f] hover:bg-[#0b367f] hover:text-white transition-colors"
              asChild
            >
              <a href="mailto:info@hfx-honorarfuchs.de">
                info@hfx-honorarfuchs.de
                <ArrowRight className="h-4 w-4" />
              </a>
            </Button>
          </div>

          <p className="text-xs text-gray-300">
            {ENTITY_TAGLINE}
          </p>
        </div>
      </div>
    </div>
  );
}
