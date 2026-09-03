import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import fuchsLogo from "@/assets/fuchs-bildmarke.png";
import { ENTITY_TAGLINE } from "@/lib/entityCanon";

// Öffentliche Seite: Zugangsanfrage aus der HFX.GOÄ-Anwendung.
// Kein Login, kein Portal-Client, kein DB-Schreiben – roher fetch auf die
// Edge Function zugang-anfrage (Muster Buchen.tsx). Zuordnung macht ein Mensch.

const CONTACT_EMAIL = "info@hfx-honorarfuchs.de";

export default function Zugang() {
  const [searchParams] = useSearchParams();
  const src = (searchParams.get("src") ?? "").slice(0, 50);

  const [praxisName, setPraxisName] = useState("");
  const [vorname, setVorname] = useState("");
  const [nachname, setNachname] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [kundennummer, setKundennummer] = useState("");
  const [nachricht, setNachricht] = useState("");
  const [website, setWebsite] = useState(""); // Honeypot

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    praxisName.trim().length >= 2 &&
    vorname.trim().length > 0 &&
    nachname.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/zugang-anfrage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            praxis_name: praxisName.trim(),
            vorname: vorname.trim(),
            nachname: nachname.trim(),
            email: email.trim(),
            telefon: telefon.trim() || null,
            hfx_kundennummer: kundennummer.trim() || null,
            nachricht: nachricht.trim() || null,
            src: src || null,
            website,
          }),
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        throw new Error(json.error || "Unbekannter Fehler");
      }
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten.");
    } finally {
      setSubmitting(false);
    }
  }

  const Header = () => (
    <div className="text-center flex flex-col items-center gap-2">
      <div className="w-14 h-14 rounded-full bg-white shadow flex items-center justify-center border border-border">
        <img src={fuchsLogo} alt="HFX Honorarfuchs" className="w-10 h-10 object-contain" />
      </div>
      <p className="text-2xl font-bold text-primary">HFX Honorarfuchs</p>
      <p className="text-sm text-muted-foreground -mt-1">{ENTITY_TAGLINE}</p>
    </div>
  );

  if (success) {
    return (
      <div className="min-h-screen bg-background py-8 sm:py-12 px-4">
        <div className="max-w-lg mx-auto space-y-8">
          <Header />
          <div className="bg-card border rounded-xl p-8 sm:p-10 text-center space-y-4 shadow-sm">
            <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              Vielen Dank! Wir haben Ihre Anfrage erhalten und melden uns in Kürze bei Ihnen.
            </h1>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-8 sm:py-12 px-4">
      <div className="max-w-lg mx-auto space-y-8">
        <Header />

        <div className="bg-card border rounded-xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold text-foreground">Zugang zur HFX.GOÄ-Anwendung</h1>
            <p className="text-sm text-muted-foreground">
              Ihren Zugang erhalten Sie über HFX Honorarfuchs. Füllen Sie das Formular aus – wir richten Ihren Zugang ein und melden uns bei Ihnen. Wenn Ihre Praxis bereits Kundin ist, geht es besonders schnell, wenn Sie die HFX-Kundennummer angeben.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="praxis_name">Praxisname *</Label>
              <Input id="praxis_name" value={praxisName} onChange={(e) => setPraxisName(e.target.value)} required maxLength={200} autoComplete="organization" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="vorname">Vorname *</Label>
                <Input id="vorname" value={vorname} onChange={(e) => setVorname(e.target.value)} required maxLength={100} autoComplete="given-name" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nachname">Nachname *</Label>
                <Input id="nachname" value={nachname} onChange={(e) => setNachname(e.target.value)} required maxLength={100} autoComplete="family-name" />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">E-Mail *</Label>
              <Input id="email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} autoComplete="email" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="telefon">Telefon</Label>
              <Input id="telefon" type="tel" inputMode="tel" value={telefon} onChange={(e) => setTelefon(e.target.value)} maxLength={50} autoComplete="tel" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="kundennummer">HFX-Kundennummer</Label>
              <Input id="kundennummer" value={kundennummer} onChange={(e) => setKundennummer(e.target.value)} maxLength={50} placeholder="z. B. HFX-I01234" />
              <p className="text-xs text-muted-foreground">falls Ihre Praxis bereits Kundin ist</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="nachricht">Nachricht</Label>
              <Textarea id="nachricht" value={nachricht} onChange={(e) => setNachricht(e.target.value)} maxLength={2000} rows={4} />
            </div>

            {/* Honeypot – für Menschen unsichtbar */}
            <div className="absolute -left-[9999px] top-auto w-px h-px overflow-hidden" aria-hidden="true">
              <label htmlFor="website">Website</label>
              <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <p>
                  Ihre Anfrage konnte nicht gesendet werden ({error}). Bitte versuchen Sie es erneut oder schreiben Sie uns direkt an{" "}
                  <a href={`mailto:${CONTACT_EMAIL}`} className="underline font-medium">{CONTACT_EMAIL}</a>.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={!canSubmit || submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird gesendet…
                </>
              ) : (
                "Zugang anfragen"
              )}
            </Button>

            <p className="text-xs text-muted-foreground text-center">
              * Pflichtfelder · Fragen? <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
