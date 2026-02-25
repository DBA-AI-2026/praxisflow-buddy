import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldOff, Copy, Check } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";

interface MfaSetupProps {
  onComplete?: () => void;
  onCancel?: () => void;
}

export function MfaSetup({ onComplete, onCancel }: MfaSetupProps) {
  const [step, setStep] = useState<"enroll" | "verify" | "done">("enroll");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [factorId, setFactorId] = useState("");
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const startEnrollment = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "HFX Dashboard",
      });
      if (error) throw error;
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setFactorId(data.id);
      setStep("verify");
    } catch (err: unknown) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "2FA konnte nicht eingerichtet werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setIsLoading(true);
    try {
      const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;

      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challengeData.id,
        code: otp,
      });
      if (verifyError) throw verifyError;

      setStep("done");
      toast({ title: "2FA aktiviert", description: "Zwei-Faktor-Authentifizierung wurde erfolgreich eingerichtet." });
      onComplete?.();
    } catch (err: unknown) {
      toast({
        title: "Falscher Code",
        description: "Der eingegebene Code ist ungültig. Bitte versuchen Sie es erneut.",
        variant: "destructive",
      });
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  const copySecret = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (step === "enroll") startEnrollment();
  }, []);

  if (step === "enroll" || isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="text-center py-6 space-y-4">
      <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
          <ShieldCheck className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">2FA aktiviert</h3>
        <p className="text-sm text-muted-foreground">
          Ihre zwei-Faktor-Authentifizierung ist jetzt aktiv.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-base font-semibold text-foreground">Authenticator-App einrichten</h3>
        <p className="text-sm text-muted-foreground">
          Scannen Sie den QR-Code mit einer Authenticator-App (z.B. Google Authenticator, Authy).
        </p>
      </div>

      {qrCode && (
        <div className="flex flex-col items-center gap-4">
          <div className="p-3 bg-white border rounded-xl shadow-sm">
            <img src={qrCode} alt="2FA QR-Code" className="w-44 h-44" />
          </div>
          <div className="w-full">
            <Label className="text-xs text-muted-foreground mb-1 block">Manueller Schlüssel</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-muted p-2 rounded font-mono break-all">
                {secret}
              </code>
              <Button variant="outline" size="icon" onClick={copySecret} className="shrink-0">
                {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <Label>6-stelligen Code eingeben</Label>
        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            value={otp}
            onChange={setOtp}
          >
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        {onCancel && (
          <Button variant="outline" onClick={onCancel} className="flex-1">
            Abbrechen
          </Button>
        )}
        <Button onClick={verifyOtp} disabled={otp.length !== 6 || isLoading} className="flex-1">
          {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Bestätigen & Aktivieren
        </Button>
      </div>
    </div>
  );
}
