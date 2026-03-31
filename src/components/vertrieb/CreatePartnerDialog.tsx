import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check, AlertTriangle, Mail, ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

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
  const [assignedPartnerId, setAssignedPartnerId] = useState<string>("");
  const [partnerSelectOpen, setPartnerSelectOpen] = useState(false);
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<DialogStep>("form");
  const [notifyBeforeReset, setNotifyBeforeReset] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch available sales partners for Tippgeber assignment
  const { data: salesPartners = [] } = useQuery({
    queryKey: ["sales-partners-for-assignment"],
    enabled: open && role === "tippgeber",
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("role", "sales_partner");
      if (rolesError) throw rolesError;
      if (!roles || roles.length === 0) return [];

      const userIds = roles.map((r) => r.user_id);
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds)
        .order("full_name");
      if (error) throw error;
      return profiles || [];
    },
  });

  const selectedPartner = salesPartners.find((p) => p.user_id === assignedPartnerId);

  const createMutation = useMutation({
    mutationFn: async ({ confirmReset = false }: { confirmReset?: boolean } = {}) => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Nicht authentifiziert");

      // Validate: Tippgeber needs assigned partner
      if (role === "tippgeber" && !assignedPartnerId) {
        throw new Error("Bitte wählen Sie einen zugehörigen Vertriebspartner aus.");
      }

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

      // If Tippgeber, create the partner assignment
      if (role === "tippgeber" && assignedPartnerId && response.data.user?.id) {
        const { error: assignError } = await supabase
          .from("tippgeber_partner_assignments" as any)
          .upsert({
            tippgeber_user_id: response.data.user.id,
            partner_user_id: assignedPartnerId,
            is_active: true,
            notes: notes || null,
          }, { onConflict: "tippgeber_user_id" });

        if (assignError) {
          console.error("Assignment error:", assignError);
          // Don't fail the whole operation, user was already created
        }
      }

      return response.data;
    },
    onSuccess: (data) => {
      if (data._needsConfirm) {
        setStep("confirm-reset");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["vertriebler-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      queryClient.invalidateQueries({ queryKey: ["tippgeber-assignments"] });
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
    if (role === "tippgeber" && !assignedPartnerId) {
      toast({ title: "Pflichtfeld", description: "Bitte wählen Sie einen zugehörigen Vertriebspartner.", variant: "destructive" });
      return;
    }
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
    setAssignedPartnerId("");
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
                <Select value={role} onValueChange={(v) => {
                  setRole(v as PartnerRole);
                  if (v === "sales_partner") setAssignedPartnerId("");
                }}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sales_partner">Vertriebspartner</SelectItem>
                    <SelectItem value="tippgeber">Tippgeber</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Pflichtfeld: Zugehöriger Vertriebspartner (nur bei Tippgeber) */}
              {role === "tippgeber" && (
                <div className="space-y-2">
                  <Label>Zugehöriger Vertriebspartner *</Label>
                  <Popover open={partnerSelectOpen} onOpenChange={setPartnerSelectOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={partnerSelectOpen}
                        className={cn(
                          "w-full justify-between font-normal",
                          !assignedPartnerId && "text-muted-foreground"
                        )}
                      >
                        {selectedPartner
                          ? `${selectedPartner.full_name} — Vertriebspartner`
                          : "Vertriebspartner auswählen..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Name suchen..." />
                        <CommandList>
                          <CommandEmpty>Keine Vertriebspartner gefunden.</CommandEmpty>
                          <CommandGroup>
                            {salesPartners.map((p) => (
                              <CommandItem
                                key={p.user_id}
                                value={p.full_name}
                                onSelect={() => {
                                  setAssignedPartnerId(p.user_id === assignedPartnerId ? "" : p.user_id);
                                  setPartnerSelectOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4 shrink-0",
                                    assignedPartnerId === p.user_id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col min-w-0">
                                  <span className="font-medium truncate">{p.full_name}</span>
                                  <span className="text-xs text-muted-foreground truncate">
                                    {p.email || "–"} · Vertriebspartner
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <p className="text-xs text-muted-foreground">
                    Tippgeber müssen einem Vertriebspartner zugeordnet sein.
                  </p>
                </div>
              )}

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
