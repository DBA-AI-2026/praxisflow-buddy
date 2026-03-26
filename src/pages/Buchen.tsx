import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle, ExternalLink, CreditCard, FileText, PartyPopper, Eye, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import fuchsLogo from "@/assets/fuchs-bildmarke.png";

const FACHRICHTUNGEN = [
  "Allgemeinmedizin",
  "Anästhesiologie",
  "Augenheilkunde",
  "Chirurgie",
  "Dermatologie",
  "Gastroenterologie",
  "Geriatrie",
  "Gynäkologie",
  "Hämatologie / Onkologie",
  "HNO",
  "Innere Medizin",
  "Kardiologie",
  "Mund-, Kiefer- und Gesichtschirurgie",
  "Nephrologie",
  "Neurologie",
  "Notfallmedizin",
  "Orthopädie",
  "Orthopädie & Unfallchirurgie",
  "Pädiatrie",
  "Physikalische & Rehabilitative Medizin",
  "Pneumologie",
  "Psychiatrie",
  "Psychosomatik & Psychotherapie",
  "Radiologie",
  "Rheumatologie",
  "Sportmedizin",
  "Unfallchirurgie",
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

const DEFAULT_AGB_URL = "https://praxisflow-buddy.lovable.app/templates/vertrag-honorarfuchs.pdf";

interface ContractSummary {
  praxis: string | null;
  customer_name: string;
  product_name: string;
  modules: string[] | null;
  monthly_price: number;
  hfx_customer_number: string | null;
  fachrichtung: string | null;
  rechtsform: string | null;
}

interface ProductAgb {
  name: string;
  agb_pdf_path: string | null;
}

const normalizeProductKey = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

function findBestProductMatch(products: ProductAgb[], candidates: Array<string | null | undefined>) {
  const preparedCandidates = candidates
    .flatMap((candidate) => String(candidate || "").split(","))
    .map((item) => item.trim())
    .filter(Boolean);

  if (preparedCandidates.length === 0) return null;

  const exactMatch = products.find((product) =>
    preparedCandidates.some((candidate) => candidate.toLowerCase() === product.name.toLowerCase())
  );
  if (exactMatch) return exactMatch;

  return products.find((product) => {
    const normalizedProduct = normalizeProductKey(product.name);
    return preparedCandidates.some((candidate) => {
      const normalizedCandidate = normalizeProductKey(candidate);
      return (
        normalizedCandidate === normalizedProduct ||
        normalizedCandidate.includes(normalizedProduct) ||
        normalizedProduct.includes(normalizedCandidate)
      );
    });
  }) ?? null;
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
  const navigate = useNavigate();
  const contractId = searchParams.get("contract_id");
  const productParam = searchParams.get("product");
  const isPreview = searchParams.get("preview") === "true";

  const [contract, setContract] = useState<ContractSummary | null>(null);
  const [agbUrl, setAgbUrl] = useState<string | null>(null);
  const [hasProductSpecificAgb, setHasProductSpecificAgb] = useState(false);
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
    // Preview mode: show mock data without a real contract
    if (isPreview) {
      setContract({
        praxis: "Musterpraxis Dr. Müller",
        customer_name: "Dr. Anna Müller",
        product_name: "HFX GOÄ - die KI für ihre Privatabrechnung",
        modules: null,
        monthly_price: 49,
        hfx_customer_number: "HFX-2024-0042",
        fachrichtung: null,
        rechtsform: null,
      });
      setAgbUrl(DEFAULT_AGB_URL);
      setHasProductSpecificAgb(false);
      setLoading(false);
      return;
    }

    if (!contractId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    supabase
      .rpc("get_public_contract_booking", { p_contract_id: contractId })
      .maybeSingle()
      .then(async ({ data, error: err }) => {
        if (err || !data) {
          setNotFound(true);
        } else {
          setContract(data as ContractSummary);
          if (data.fachrichtung) setFachrichtung(data.fachrichtung);
          if (data.rechtsform) setRechtsform(data.rechtsform);

          // Fetch product-specific AGB PDF (supports legacy product labels like "HFX.GOÄ")
          const { data: products } = await supabase
            .from("products")
            .select("name, agb_pdf_path")
            .eq("is_active", true)
            .not("agb_pdf_path", "is", null);

          const matchedProduct = findBestProductMatch((products ?? []) as ProductAgb[], [
            data.product_name,
            productParam,
            ...((data.modules as string[] | null) ?? []),
          ]);

          if (matchedProduct?.agb_pdf_path) {
            setHasProductSpecificAgb(true);
            const { data: signed } = await supabase.storage
              .from("contracts")
              .createSignedUrl(matchedProduct.agb_pdf_path, 3600);
            setAgbUrl(signed?.signedUrl ?? null);
          } else {
            setHasProductSpecificAgb(false);
            setAgbUrl(DEFAULT_AGB_URL);
          }
        }
        setLoading(false);
      });
  }, [contractId, productParam, isPreview]);

  const productName = contract?.product_name || productParam || "";
  const monthlyNet = contract?.monthly_price ?? 0;
  const monthlyGross = monthlyNet * 1.19;

  const canSubmit =
    isPreview ||
    (fachrichtung &&
    rechtsform &&
    agbAccepted &&
    (!isEBM || (bsnr.trim() && lanr.trim())));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Preview: just advance steps without API call
    if (isPreview) {
      setCurrentStep(2);
      setTimeout(() => setCurrentStep(3), 1500);
      return;
    }
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
  if (currentStep === 2) {
    return (
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-lg mx-auto space-y-8">
          <div className="text-center flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-white shadow flex items-center justify-center border border-border">
              <img src={fuchsLogo} alt="HFX Honorarfuchs" className="w-10 h-10 object-contain" />
            </div>
            <p className="text-2xl font-bold text-primary">HFX Honorarfuchs</p>
            <p className="text-sm text-muted-foreground -mt-1">Verbindliche Buchung</p>
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

  // ── Step 3: Bestätigung (Preview only) ───────────────────────────────────
  if (currentStep === 3 && isPreview) {
    return (
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-lg mx-auto space-y-8">
          <div className="text-center flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-full bg-white shadow flex items-center justify-center border border-border">
              <img src={fuchsLogo} alt="HFX Honorarfuchs" className="w-10 h-10 object-contain" />
            </div>
            <p className="text-2xl font-bold text-primary">HFX Honorarfuchs</p>
            <p className="text-sm text-muted-foreground -mt-1">Verbindliche Buchung</p>
          </div>
          <StepIndicator currentStep={3} />

          {/* Preview banner */}
          <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-warning">
            <Eye className="h-4 w-4 shrink-0" />
            <span><strong>Vorschau-Modus</strong> – Musterdaten, keine echte Buchung</span>
          </div>

          <div className="bg-card border rounded-xl p-8 text-center space-y-5 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-foreground">Vielen Dank für Ihre Buchung!</h2>
              <p className="text-sm text-muted-foreground">Ihr Vertrag wurde erfolgreich abgeschlossen.</p>
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Praxis</span>
                <span className="font-medium">Musterpraxis Dr. Müller</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Produkt</span>
                <span className="font-medium">HFX GOÄ</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">HFX-Nr.</span>
                <span className="font-mono">HFX-2024-0042</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monatspreis brutto</span>
                <span className="font-bold text-primary">58,31 €</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Zahlungsart</span>
                <span>SEPA-Lastschrift</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Eine Bestätigungs-E-Mail wurde an <strong>dr.mueller@musterpraxis.de</strong> gesendet.
            </p>
          </div>

          <button
            onClick={() => setCurrentStep(1)}
            className="w-full flex items-center justify-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Zurück zur Vorschau (Schritt 1)
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Preview banner */}
        {isPreview && (
          <div className="space-y-2">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Zurück
            </button>
            <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-warning">
              <Eye className="h-4 w-4 shrink-0" />
              <span><strong>Vorschau-Modus</strong> – Musterdaten, keine echte Buchung möglich</span>
            </div>
          </div>
        )}

        {/* Brand header */}
        <div className="text-center flex flex-col items-center gap-2">
          <div className="w-14 h-14 rounded-full bg-white shadow flex items-center justify-center border border-border">
            <img src={fuchsLogo} alt="HFX Honorarfuchs" className="w-10 h-10 object-contain" />
          </div>
          <p className="text-2xl font-bold text-primary">HFX Honorarfuchs</p>
          <p className="text-sm text-muted-foreground -mt-1">Verbindliche Buchung</p>
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
                href={agbUrl || (hasProductSpecificAgb ? "#" : DEFAULT_AGB_URL)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-0.5"
                onClick={(e) => {
                  if (!agbUrl && hasProductSpecificAgb) {
                    e.preventDefault();
                    return;
                  }
                  e.stopPropagation();
                }}
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
