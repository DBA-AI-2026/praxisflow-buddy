import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, ShieldOff, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { MfaSetup } from "@/pages/MfaSetup";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export default function Sicherheit() {
  const { toast } = useToast();

  const [mfaEnabled, setMfaEnabled] = useState(false);
  const [mfaLoading, setMfaLoading] = useState(true);
  const [mfaFactorId, setMfaFactorId] = useState<string | null>(null);
  const [showMfaSetup, setShowMfaSetup] = useState(false);
  const [disablingMfa, setDisablingMfa] = useState(false);

  useEffect(() => {
    loadMfaStatus();
  }, []);

  const loadMfaStatus = async () => {
    setMfaLoading(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp?.filter(f => f.status === "verified") ?? [];
      setMfaEnabled(verified.length > 0);
      setMfaFactorId(verified[0]?.id ?? null);
    } finally {
      setMfaLoading(false);
    }
  };

  const handleDisableMfa = async () => {
    if (!mfaFactorId) return;
    setDisablingMfa(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactorId });
      if (error) throw error;
      setMfaEnabled(false);
      setMfaFactorId(null);
      toast({ title: "2FA deaktiviert", description: "Zwei-Faktor-Authentifizierung wurde deaktiviert." });
    } catch (err: unknown) {
      toast({
        title: "Fehler",
        description: err instanceof Error ? err.message : "2FA konnte nicht deaktiviert werden.",
        variant: "destructive",
      });
    } finally {
      setDisablingMfa(false);
    }
  };

  return (
    <MainLayout title="Sicherheit" subtitle="Kontosicherheit & Zwei-Faktor-Authentifizierung">
      <div className="max-w-xl space-y-6">
        <div className="card-elevated p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Zwei-Faktor-Authentifizierung</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Schützen Sie Ihr Konto mit einer zusätzlichen Sicherheitsebene. Nach der Aktivierung
              wird bei jeder Anmeldung ein Code aus Ihrer Authenticator-App verlangt.
            </p>
          </div>

          {mfaLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Status wird geladen...</span>
            </div>
          ) : (
            <div className="flex items-start justify-between p-4 border rounded-xl bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${mfaEnabled ? "bg-primary/10" : "bg-muted"}`}>
                  {mfaEnabled
                    ? <ShieldCheck className="h-5 w-5 text-primary" />
                    : <ShieldOff className="h-5 w-5 text-muted-foreground" />
                  }
                </div>
                <div>
                  <p className="font-medium text-foreground text-sm">Authenticator-App (TOTP)</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {mfaEnabled ? "Aktiv – Ihr Konto ist zusätzlich geschützt." : "Nicht aktiviert"}
                  </p>
                </div>
              </div>
              <Badge variant="secondary" className={mfaEnabled ? "bg-primary/10 text-primary" : ""}>
                {mfaEnabled ? "Aktiv" : "Inaktiv"}
              </Badge>
            </div>
          )}

          <div className="flex gap-3">
            {!mfaEnabled ? (
              <Button onClick={() => setShowMfaSetup(true)}>
                <ShieldCheck className="h-4 w-4 mr-2" />
                2FA aktivieren
              </Button>
            ) : (
              <Button
                variant="outline"
                onClick={handleDisableMfa}
                disabled={disablingMfa}
                className="text-destructive hover:text-destructive"
              >
                {disablingMfa
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <ShieldOff className="h-4 w-4 mr-2" />
                }
                2FA deaktivieren
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground border-t pt-4">
            Unterstützte Apps: Google Authenticator, Authy, Microsoft Authenticator, 1Password u.v.m.
          </p>
        </div>

        <div className="card-elevated p-6">
          <div className="flex items-center gap-3 mb-3">
            <Shield className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold text-foreground">Empfehlung</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Wir empfehlen allen Dashboard-Nutzern, die Zwei-Faktor-Authentifizierung zu aktivieren.
            Dies schützt Ihren Zugang auch dann, wenn Ihr Passwort in fremde Hände gelangt.
          </p>
        </div>
      </div>

      {/* MFA Setup Dialog */}
      <Dialog open={showMfaSetup} onOpenChange={setShowMfaSetup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>2FA einrichten</DialogTitle>
            <DialogDescription>
              Verbinden Sie Ihren Account mit einer Authenticator-App.
            </DialogDescription>
          </DialogHeader>
          <MfaSetup
            onComplete={() => {
              setShowMfaSetup(false);
              loadMfaStatus();
            }}
            onCancel={() => setShowMfaSetup(false)}
          />
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
