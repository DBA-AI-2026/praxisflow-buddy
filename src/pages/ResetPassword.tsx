import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { MfaChallenge } from "@/pages/MfaChallenge";
import logo from "@/assets/logo.png";
import { z } from "zod";

// Password policy: min 8 chars, at least one letter and one digit
const passwordSchema = z.object({
  password: z
    .string()
    .min(8, "Das Passwort muss mindestens 8 Zeichen lang sein")
    .regex(/[A-Za-z]/, "Das Passwort muss mindestens einen Buchstaben enthalten")
    .regex(/[0-9]/, "Das Passwort muss mindestens eine Zahl enthalten"),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwörter stimmen nicht überein",
  path: ["confirmPassword"],
});

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [needsMfa, setNeedsMfa] = useState(false);

  const checkMfaRequirement = async () => {
    const { data: { totp } } = await supabase.auth.mfa.listFactors();
    const verifiedFactor = totp?.find(f => f.status === "verified");
    if (verifiedFactor) {
      setMfaFactorId(verifiedFactor.id);
      setNeedsMfa(true);
    }
  };

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsValidSession(true);
        checkMfaRequirement();
      }
      setChecking(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setIsValidSession(true);
        checkMfaRequirement();
      }
      setChecking(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const validation = passwordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    }
    setIsLoading(false);
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isValidSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Ungültiger Link</CardTitle>
            <CardDescription>
              Dieser Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate("/auth")} variant="outline">
              Zurück zur Anmeldung
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img
              src={logo}
              alt="Honorarfuchs"
              className="h-20 w-20 rounded-full object-cover border-4 border-primary/20 shadow-lg"
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">Neues Passwort setzen</CardTitle>
            <CardDescription>Geben Sie Ihr neues Passwort ein</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success ? (
            <Alert className="border-green-500 bg-green-50 text-green-700">
              <CheckCircle2 className="h-4 w-4" />
              <AlertDescription>
                Passwort erfolgreich geändert. Sie werden weitergeleitet...
              </AlertDescription>
            </Alert>
          ) : (
            <form autoComplete="off" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">Neues Passwort</Label>
                <Input
                  id="new-password"
                  type="password"
                  placeholder="Mindestens 8 Zeichen, Buchstabe + Zahl"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground">Mindestens 8 Zeichen, ein Buchstabe und eine Zahl.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Passwort bestätigen</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird gespeichert...
                  </>
                ) : (
                  "Passwort ändern"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
