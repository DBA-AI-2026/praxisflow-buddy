import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check, AlertTriangle, Mail } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

type PartnerRole = "sales_partner" | "tippgeber";

interface CreatePartnerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CreatedCredentials {
  email: string;
  password: string;
  isExistingUser?: boolean;
}

type DialogStep = "form" | "confirm-reset" | "credentials";

export function CreatePartnerDialog({ open, onOpenChange }: CreatePartnerDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<PartnerRole>("sales_partner");
  const [notes, setNotes] = useState("");
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<DialogStep>("form");
  const [notifyBeforeReset, setNotifyBeforeReset] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async ({ confirmReset = false }: { confirmReset?: boolean } = {}) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Nicht authentifiziert");

      const response = await supabase.functions.invoke("create-user", {
        body: {
          email,
          fullName,
          role,
          sendEmail: true,
          confirmReset,
          notifyBeforeReset: confirmReset ? notifyBeforeReset : false,
        },
      });

      if (response.error) throw new Error(response.error.message || "Fehler");
      if (response.data?.error) {
        if (response.data.userExists && !confirmReset) {
          return { ...response.data, _needsConfirm: true };
        }
        throw new Error(response.data.error);
      }
      if (!response.data?.success) throw new Error("Unerwarteter Fehler");
      return response.data;
    },
    onSuccess: (data) => {
      if (data._needsConfirm) {
        setStep("confirm-reset");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["vertriebler-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setCredentials({
        email: data.credentials.email,
        password: data.credentials.password,
        isExistingUser: data.isExistingUser,
      });
      setStep("credentials");
      toast({
        title: data.isExistingUser ? "Passwort zurückgesetzt" : "Partner angelegt",
        description: data.emailSent
          ? "Zugangsdaten wurden per E-Mail gesendet."
          : "Angelegt, E-Mail konnte nicht gesendet werden.",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Fehler", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName) return;
    createMutation.mutate({});
  };

  const handleConfirmReset = () => {
    createMutation.mutate({ confirmReset: true });
  };

  const handleClose = () => {
    setEmail("");
    setFullName("");
    setRole("sales_partner");
    setNotes("");
    setCredentials(null);
    setCopied(false);
    setStep("form");
    setNotifyBeforeReset(true);
    onOpenChange(false);
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = `E-Mail: ${credentials.email}\nPasswort: ${credentials.password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const roleLabel = role === "sales_partner" ? "Vertriebspartner" : "Tippgeber";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Neuen Partner anlegen</DialogTitle>
              <DialogDescription>
                Legen Sie einen neuen Vertriebspartner oder Tippgeber an. Die Zugangsdaten werden automatisch generiert und per E-Mail zugestellt.
              </DialogDescription>
            </DialogHeader>
            <form autoComplete="off" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="partner-name">Name *</Label>
                <Input
                  id="partner-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Vorname Nachname"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner-email">E-Mail *</Label>
                <Input
                  id="partner-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="partner@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Rolle *</Label>
                <Select value={role} onValueChange={(v) => setRole(v as PartnerRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales_partner">Vertriebspartner</SelectItem>
                    <SelectItem value="tippgeber">Tippgeber</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="partner-notes">Notiz (optional)</Label>
                <Textarea
                  id="partner-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="z. B. Provisionsmodell, externe Kennung..."
                  rows={2}
                />
              </div>

              <DialogFooter className="gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Wird angelegt...
                    </>
                  ) : (
                    `${roleLabel} anlegen`
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "confirm-reset" && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Benutzer existiert bereits
              </DialogTitle>
              <DialogDescription>
                Ein Benutzer mit dieser E-Mail ist bereits registriert.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>{email}</strong> existiert bereits. Möchten Sie das Passwort zurücksetzen und die Rolle auf <strong>{roleLabel}</strong> setzen?
                </p>
              </div>

              <div className="flex items-start space-x-3 p-3 bg-muted rounded-lg">
                <Checkbox
                  id="notify-partner"
                  checked={notifyBeforeReset}
                  onCheckedChange={(checked) => setNotifyBeforeReset(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="notify-partner" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Benutzer vorher benachrichtigen
                  </Label>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStep("form")}>
                  Zurück
                </Button>
                <Button onClick={handleConfirmReset} disabled={createMutation.isPending}>
                  {createMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Wird zurückgesetzt...
                    </>
                  ) : (
                    "Passwort zurücksetzen"
                  )}
                </Button>
              </DialogFooter>
            </div>
          </>
        )}

        {step === "credentials" && credentials && (
          <>
            <DialogHeader>
              <DialogTitle>
                {credentials.isExistingUser ? "Passwort zurückgesetzt" : "Partner angelegt"}
              </DialogTitle>
              <DialogDescription>
                {credentials.isExistingUser
                  ? "Neue Zugangsdaten wurden generiert."
                  : `${roleLabel} wurde erfolgreich angelegt.`}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">E-Mail</Label>
                  <p className="font-medium">{credentials.email}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Temporäres Passwort</Label>
                  <p className="font-mono text-sm bg-background p-2 rounded border">
                    {credentials.password}
                  </p>
                </div>
              </div>
              <Button onClick={copyCredentials} variant="outline" className="w-full">
                {copied ? (
                  <><Check className="h-4 w-4 mr-2" /> Kopiert</>
                ) : (
                  <><Copy className="h-4 w-4 mr-2" /> Zugangsdaten kopieren</>
                )}
              </Button>
              <DialogFooter>
                <Button onClick={handleClose} className="w-full">Schließen</Button>
              </DialogFooter>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
