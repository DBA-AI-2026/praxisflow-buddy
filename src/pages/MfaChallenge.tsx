import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";

interface MfaChallengeProps {
  factorId: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export function MfaChallenge({ factorId, onSuccess, onCancel }: MfaChallengeProps) {
  const [otp, setOtp] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const verify = async () => {
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
      onSuccess();
    } catch {
      toast({
        title: "Falscher Code",
        description: "Der eingegebene Code ist ungültig.",
        variant: "destructive",
      });
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Zwei-Faktor-Authentifizierung</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Geben Sie den 6-stelligen Code aus Ihrer Authenticator-App ein.
          </p>
        </div>

        <div className="card-elevated p-6 space-y-5">
          <div className="space-y-3">
            <Label>Einmalcode</Label>
            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                pattern={REGEXP_ONLY_DIGITS}
                value={otp}
                onChange={setOtp}
                autoFocus
              >
                <InputOTPGroup>
                  {[0, 1, 2, 3, 4, 5].map((i) => (
                    <InputOTPSlot key={i} index={i} />
                  ))}
                </InputOTPGroup>
              </InputOTP>
            </div>
          </div>

          <Button
            onClick={verify}
            disabled={otp.length !== 6 || isLoading}
            className="w-full"
          >
            {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Verifizieren
          </Button>

          <button
            onClick={onCancel}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Abmelden
          </button>
        </div>
      </div>
    </div>
  );
}
