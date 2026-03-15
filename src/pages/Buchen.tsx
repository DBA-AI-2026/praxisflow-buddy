import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle, ExternalLink, CreditCard, FileText, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";

const FACHRICHTUNGEN = [
  "Allgemeinmedizin",
  "Innere Medizin",
  "Chirurgie",
  "Gynäkologie",
  "HNO",
  "Pädiatrie",
  "Psychiatrie",
  "Radiologie",
  "Urologie",
  "Zahnmedizin",
  "Sonstiges",
];

const RECHTSFORMEN = [
  "Einzelpraxis",
  "Berufsausübungsgemeinschaft",
  "MVZ",
  "GmbH",
  "Sonstiges",
];

interface ContractSummary {
  praxis: string | null;
  customer_name: string;
  product_name: string;
  monthly_price: number;
  hfx_customer_number: string | null;
  fachrichtung: string | null;
  rechtsform: string | null;
}

interface ProductAgb {
  agb_pdf_path: string | null;
}

const STEPS = [
  { id: 1, label: "Angaben", icon: FileText },
  { id: 2, label: "Zahlung", icon: CreditCard },
  { id: 3, label: "Bestätigung", icon: PartyPopper },
];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="w-full flex items-center justify-center mb-8">
      {STEPS.map((step, idx) => {
        const isDone = currentStep > step.id;
        const isActive = currentStep === step.id;
        const Icon = step.icon;

        return (
          <div key={step.id} className="flex items-center">
            {/* Step circle */}
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={[
                  "w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 border-2",
                  isDone
                    ? "bg-primary border-primary text-primary-foreground"
                    : isActive
                    ? "bg-primary/10 border-primary text-primary"
                    : "bg-muted border-border text-muted-foreground",
                ].join(" ")}
              >
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span
                className={[
                  "text-xs font-medium whitespace-nowrap",
                  isActive ? "text-primary" : isDone ? "text-primary/70" : "text-muted-foreground",
                ].join(" ")}
              >
                {step.label}
              </span>
            </div>

            {/* Connector */}
            {idx < STEPS.length - 1 && (
              <div
                className={[
                  "h-0.5 w-16 sm:w-24 mx-2 mb-5 transition-all duration-500",
                  currentStep > step.id ? "bg-primary" : "bg-border",
                ].join(" ")}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function Buchen() {
  const [searchParams] = useSearchParams();
  const contractId = searchParams.get("contract_id");
  const productParam = searchParams.get("product");

  const [contract, setContract] = useState<ContractSummary | null>(null);
  const [agbUrl, setAgbUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // currentStep: 1 = Angaben, 2 = Zahlung (redirecting), 3 = Bestätigung
  const [currentStep, setCurrentStep] = useState(1);

  // Form state
  const [fachrichtung, setFachrichtung] = useState("");
  const [rechtsform, setRechtsform] = useState("");
  const [bsnr, setBsnr] = useState("");
  const [lanr, setLanr] = useState("");
  const [agbAccepted, setAgbAccepted] = useState(false);

  const isEBM = (contract?.product_name || productParam || "").includes("EBM");

  useEffect(() => {
    if (!contractId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    supabase
      .from("contracts")
      .select("praxis, customer_name, product_name, monthly_price, hfx_customer_number, fachrichtung, rechtsform")
      .eq("id", contractId)
      .eq("status", "eingegangen")
      .maybeSingle()
      .then(async ({ data, error: err }) => {
        if (err || !data) {
          setNotFound(true);
        } else {
          setContract(data as ContractSummary);
          if (data.fachrichtung) setFachrichtung(data.fachrichtung);
          if (data.rechtsform) setRechtsform(data.rechtsform);

          // Fetch product-specific AGB PDF
          const { data: product } = await supabase
            .from("products")
            .select("agb_pdf_path")
            .eq("name", data.product_name)
            .maybeSingle();

          if ((product as any)?.agb_pdf_path) {
            const { data: signed } = await supabase.storage
              .from("contracts")
              .createSignedUrl((product as any).agb_pdf_path, 3600);
            if (signed?.signedUrl) {
              setAgbUrl(signed.signedUrl);
            }
          }
        }
        setLoading(false);
      });
  }, [contractId]);

  const productName = contract?.product_name || productParam || "";
  const monthlyNet = contract?.monthly_price ?? 0;
  const monthlyGross = monthlyNet * 1.19;

  const canSubmit =
    fachrichtung &&
    rechtsform &&
    agbAccepted &&
    (!isEBM || (bsnr.trim() && lanr.trim()));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || !contractId) return;

    setSubmitting(true);
    setError(null);
    setCurrentStep(2);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/initiate-booking`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contract_id: contractId,
            fachrichtung,
            rechtsform,
            bsnr: bsnr.trim() || null,
            lanr: lanr.trim() || null,
            agb_accepted: true,
            agb_version: "1.0",
            user_agent: navigator.userAgent,
          }),
        }
      );

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || "Unbekannter Fehler");
      }

      if (json.stripe_url) {
        window.location.href = json.stripe_url;
      } else {
        throw new Error("Kein Zahlungslink erhalten. Bitte versuchen Sie es erneut.");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten.");
      setSubmitting(false);
      setCurrentStep(1);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="bg-destructive/10 rounded-full p-6 w-fit mx-auto">
            <AlertCircle className="h-14 w-14 text-destructive" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Link nicht gültig</h1>
          <p className="text-muted-foreground text-sm">
            Dieser Buchungslink ist nicht mehr gültig oder wurde bereits verwendet.
            Bitte prüfen Sie Ihre E-Mail oder wenden Sie sich an uns.
          </p>
          <a
            href="mailto:info@hfx-honorarfuchs.de"
            className="text-primary hover:underline text-sm"
          >
            info@hfx-honorarfuchs.de
          </a>
        </div>
      </div>
    );
  }

  // ── Step 2: Redirecting to Stripe ─────────────────────────────────────────
  if (currentStep === 2 && submitting) {
    return (
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-lg mx-auto space-y-8">
          <div className="text-center">
            <p className="text-2xl font-bold text-primary">🦊 HFX Honorarfuchs</p>
            <p className="text-sm text-muted-foreground mt-1">Verbindliche Buchung</p>
          </div>
          <StepIndicator currentStep={2} />
          <div className="bg-card border rounded-xl p-10 text-center space-y-4 shadow-sm">
            <div className="flex items-center justify-center">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-7 w-7 text-primary" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                  <Loader2 className="h-3.5 w-3.5 text-primary-foreground animate-spin" />
                </div>
              </div>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Weiterleitung zu Stripe</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Sie werden zur sicheren Zahlungsseite weitergeleitet…
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>🔒</span>
              <span>SSL-verschlüsselt · Kreditkarte & SEPA-Lastschrift</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 1: Form ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Brand header */}
        <div className="text-center">
          <p className="text-2xl font-bold text-primary">🦊 HFX Honorarfuchs</p>
          <p className="text-sm text-muted-foreground mt-1">Verbindliche Buchung</p>
        </div>

        {/* Step indicator */}
        <StepIndicator currentStep={currentStep} />

        {/* Contract summary card */}
        <div className="bg-card border rounded-lg overflow-hidden shadow-sm">
          <div className="bg-primary px-5 py-3">
            <p className="text-primary-foreground text-sm font-semibold">📋 Ihre Vertragsübersicht</p>
          </div>
          <div className="p-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Praxis</span>
              <span className="font-medium text-foreground">{contract?.praxis || contract?.customer_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Produkt</span>
              <span className="font-medium text-foreground">{productName}</span>
            </div>
            {contract?.hfx_customer_number && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">HFX-Nr.</span>
                <span className="font-mono text-foreground">{contract.hfx_customer_number}</span>
              </div>
            )}
            <div className="border-t pt-2 flex justify-between">
              <span className="text-muted-foreground">Monatspreis netto</span>
              <span className="font-medium text-foreground">
                {monthlyNet.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Monatspreis brutto</span>
              <span className="font-bold text-primary">
                {monthlyGross.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Kündigung</span>
              <span>Unbefristet · 6 Monate Frist zum Monatsende</span>
            </div>
          </div>
        </div>

        {/* Booking form */}
        <form autoComplete="off" onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-card border rounded-lg p-5 space-y-4">
            <p className="text-sm font-semibold text-foreground">Bitte vervollständigen Sie Ihre Angaben</p>

            <div className="space-y-2">
              <Label htmlFor="fachrichtung">Fachrichtung *</Label>
              <Select value={fachrichtung} onValueChange={setFachrichtung}>
                <SelectTrigger id="fachrichtung">
                  <SelectValue placeholder="Bitte wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {FACHRICHTUNGEN.map((f) => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rechtsform">Rechtsform *</Label>
              <Select value={rechtsform} onValueChange={setRechtsform}>
                <SelectTrigger id="rechtsform">
                  <SelectValue placeholder="Bitte wählen…" />
                </SelectTrigger>
                <SelectContent>
                  {RECHTSFORMEN.map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isEBM && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="bsnr">BSNR (Betriebsstättennummer) *</Label>
                  <Input
                    id="bsnr"
                    value={bsnr}
                    onChange={(e) => setBsnr(e.target.value)}
                    placeholder="z.B. 012345600"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lanr">LANR (Arztnummer) *</Label>
                  <Input
                    id="lanr"
                    value={lanr}
                    onChange={(e) => setLanr(e.target.value)}
                    placeholder="z.B. 123456789"
                    maxLength={20}
                  />
                </div>
              </>
            )}
          </div>

          {/* AGB checkbox */}
          <div className="flex items-start gap-3 bg-card border rounded-lg p-4">
            <Checkbox
              id="agb"
              checked={agbAccepted}
              onCheckedChange={(v) => setAgbAccepted(!!v)}
              className="mt-0.5"
            />
            <label htmlFor="agb" className="text-sm text-muted-foreground leading-relaxed cursor-pointer">
              Ich akzeptiere die{" "}
              <a
                href={agbUrl || "https://praxisflow-buddy.lovable.app/templates/vertrag-honorarfuchs.pdf"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                Allgemeinen Geschäftsbedingungen (AGB)
                <ExternalLink className="h-3 w-3" />
              </a>{" "}
              der HFX Honorarfuchs GmbH. Mit der Zahlung schließe ich den Vertrag verbindlich ab.
            </label>
          </div>

          {error && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={!canSubmit || submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Weiterleitung zu Stripe…
              </>
            ) : (
              "Weiter zur Zahlung →"
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Sichere Zahlung via Stripe · Kreditkarte oder SEPA-Lastschrift · SSL-verschlüsselt
          </p>
        </form>

        <div className="pt-4 border-t text-center">
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
