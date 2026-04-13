import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, User, Lock, ShieldCheck, ShieldOff, AlertCircle, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { z } from "zod";

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

export default function MeinKonto() {
  const { user, profile } = useAuth();
  const { role } = useUserRole();
  const { toast } = useToast();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);

  // Check MFA status on mount
  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data }) => {
      const verified = data?.totp?.filter(f => f.status === "verified") ?? [];
      setMfaEnabled(verified.length > 0);
    });
  }, []);

  const roleLabels: Record<string, string> = {
    admin: "Administrator",
    sales_lead: "Vertriebsleitung",
    regional_lead: "Regionalleiter",
    sales_partner: "Vertriebspartner",
    user: "Gebietsleiter",
    tippgeber: "Tippgeber",
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsLoading(true);

    const validation = passwordSchema.safeParse({ password, confirmPassword });
    if (!validation.success) {
      setError(validation.error.errors[0].message);
      setIsLoading(false);
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      // Handle MFA requirement
      if (updateError.message?.includes("AAL2")) {
        setError("Bitte verifizieren Sie zuerst Ihre 2FA, bevor Sie das Passwort ändern. Melden Sie sich ab und erneut an.");
      } else {
        setError(updateError.message);
      }
    } else {
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
      toast({ title: "Passwort geändert", description: "Ihr Passwort wurde erfolgreich aktualisiert." });
    }
    setIsLoading(false);
  };

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "Benutzer";

  return (
    <MainLayout title="Mein Konto" subtitle="Persönliche Einstellungen und Kontosicherheit">
      <div className="max-w-2xl space-y-6">
        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-muted-foreground" />
              Profil
            </CardTitle>
            <CardDescription>Ihre persönlichen Kontodaten</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Name</Label>
                <p className="text-sm font-medium text-foreground">{displayName}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">E-Mail</Label>
                <p className="text-sm font-medium text-foreground">{user?.email || "–"}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Rolle</Label>
                <p className="text-sm font-medium text-foreground">
                  {role ? roleLabels[role] || role : "–"}
                </p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">2FA-Status</Label>
                <div className="flex items-center gap-2 mt-0.5">
                  {mfaEnabled === null ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : mfaEnabled ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-primary" />
                      <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">Aktiv</Badge>
                    </>
                  ) : (
                    <>
                      <ShieldOff className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="secondary" className="text-xs">Inaktiv</Badge>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="pt-2">
              <Button variant="outline" size="sm" asChild>
                <Link to="/sicherheit">
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  2FA verwalten
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Password Change */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Lock className="h-5 w-5 text-muted-foreground" />
              Passwort ändern
            </CardTitle>
            <CardDescription>Legen Sie ein neues Passwort für Ihr Konto fest</CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {success && (
              <Alert className="mb-4 border-primary/30 bg-primary/5 text-primary">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>Passwort erfolgreich geändert.</AlertDescription>
              </Alert>
            )}
            <form autoComplete="off" onSubmit={handleChangePassword} className="space-y-4">
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
              <Button type="submit" disabled={isLoading}>
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
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
