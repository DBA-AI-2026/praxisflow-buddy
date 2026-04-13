import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { Loader2, Copy, Check, AlertTriangle, Mail } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CreatedCredentials {
  email: string;
  password: string;
  isExistingUser?: boolean;
}

interface ExistingUserInfo {
  email: string;
  fullName: string;
}

type DialogStep = "form" | "confirm-reset" | "credentials";

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("user");
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<DialogStep>("form");
  const [existingUserInfo, setExistingUserInfo] = useState<ExistingUserInfo | null>(null);
  const [notifyBeforeReset, setNotifyBeforeReset] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const checkUserMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("create-user", {
        body: { email, fullName, role, checkOnly: true },
      });

      if (response.error) {
        throw new Error(response.error.message || "Fehler beim Prüfen");
      }

      return response.data;
    },
    onSuccess: (data) => {
      if (data.userExists) {
        setExistingUserInfo({ email, fullName: data.existingUserName || fullName });
        setStep("confirm-reset");
      } else {
        // User doesn't exist, proceed with creation
        createUserMutation.mutate({ skipCheck: true });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async ({ skipCheck = false, confirmReset = false }: { skipCheck?: boolean; confirmReset?: boolean } = {}) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("create-user", {
        body: { 
          email, 
          fullName, 
          role, 
          confirmReset,
          notifyBeforeReset: confirmReset ? notifyBeforeReset : false,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to create user");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      if (!response.data?.success) {
        throw new Error("Unerwarteter Fehler beim Erstellen des Benutzers");
      }

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setCredentials({
        email: data.credentials.email,
        password: data.credentials.password,
        isExistingUser: data.isExistingUser,
      });
      setStep("credentials");
      const message = data.isExistingUser
        ? "Das Passwort wurde zurückgesetzt."
        : "Der Benutzer wurde angelegt.";
      toast({
        title: data.isExistingUser ? "Passwort zurückgesetzt" : "Benutzer erstellt",
        description: data.emailSent 
          ? `${message} Die Zugangsdaten wurden per E-Mail gesendet.`
          : `${message} E-Mail konnte nicht gesendet werden.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !fullName) return;
    checkUserMutation.mutate();
  };

  const handleConfirmReset = () => {
    createUserMutation.mutate({ confirmReset: true });
  };

  const handleClose = () => {
    setEmail("");
    setFullName("");
    setRole("user");
    setCredentials(null);
    setCopied(false);
    setStep("form");
    setExistingUserInfo(null);
    setNotifyBeforeReset(true);
    onOpenChange(false);
  };

  const handleBack = () => {
    setStep("form");
    setExistingUserInfo(null);
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = `E-Mail: ${credentials.email}\nPasswort: ${credentials.password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPending = checkUserMutation.isPending || createUserMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {step === "form" && (
          <>
            <DialogHeader>
              <DialogTitle>Benutzer anlegen</DialogTitle>
              <DialogDescription>
                Erstellen Sie einen neuen Benutzer mit E-Mail und Rolle.
              </DialogDescription>
            </DialogHeader>
            <form autoComplete="off" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Max Mustermann"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="max@example.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label>Rolle</Label>
                <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                   <SelectContent>
                    <SelectItem value="user">Gebietsleiter</SelectItem>
                    <SelectItem value="sales_partner">Vertriebspartner</SelectItem>
                    <SelectItem value="regional_lead">Regionalleiter</SelectItem>
                    <SelectItem value="sales_lead">Vertriebsleitung</SelectItem>
                    <SelectItem value="tippgeber">Tippgeber</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="gap-2 pt-4">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Abbrechen
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Wird geprüft...
                    </>
                  ) : (
                    "Benutzer anlegen"
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}

        {step === "confirm-reset" && existingUserInfo && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Benutzer existiert bereits
              </DialogTitle>
              <DialogDescription>
                Ein Benutzer mit dieser E-Mail-Adresse ist bereits registriert.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  <strong>{existingUserInfo.email}</strong> ist bereits als Benutzer registriert.
                  Möchten Sie das Passwort zurücksetzen und neue Zugangsdaten generieren?
                </p>
              </div>

              <div className="flex items-start space-x-3 p-3 bg-muted rounded-lg">
                <Checkbox
                  id="notify"
                  checked={notifyBeforeReset}
                  onCheckedChange={(checked) => setNotifyBeforeReset(checked === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="notify" className="text-sm font-medium cursor-pointer flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Benutzer vorher benachrichtigen
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Der Benutzer erhält eine E-Mail, dass sein Passwort zurückgesetzt wurde.
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={handleBack}>
                  Zurück
                </Button>
                <Button 
                  onClick={handleConfirmReset} 
                  disabled={isPending}
                  variant="default"
                >
                  {isPending ? (
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
                {credentials.isExistingUser ? "Passwort zurückgesetzt" : "Benutzer angelegt"}
              </DialogTitle>
              <DialogDescription>
                {credentials.isExistingUser
                  ? "Das Passwort wurde zurückgesetzt. Teilen Sie die neuen Zugangsdaten mit dem Benutzer."
                  : "Der Benutzer wurde erstellt. Teilen Sie die Zugangsdaten mit dem Benutzer."}
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
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Kopiert
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Zugangsdaten kopieren
                  </>
                )}
              </Button>
              <DialogFooter>
                <Button onClick={handleClose} className="w-full">
                  Schließen
                </Button>
              </DialogFooter>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
