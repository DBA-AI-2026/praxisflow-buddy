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
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Copy, Check } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CreatedCredentials {
  email: string;
  password: string;
}

export function CreateUserDialog({ open, onOpenChange }: CreateUserDialogProps) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<AppRole>("user");
  const [credentials, setCredentials] = useState<CreatedCredentials | null>(null);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("create-user", {
        body: { email, fullName, role },
      });

      if (response.error) {
        throw new Error(response.error.message || "Failed to create user");
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      setCredentials(data.credentials);
      toast({
        title: "Benutzer erstellt",
        description: "Der Benutzer wurde erfolgreich angelegt.",
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
    createUserMutation.mutate();
  };

  const handleClose = () => {
    setEmail("");
    setFullName("");
    setRole("user");
    setCredentials(null);
    setCopied(false);
    onOpenChange(false);
  };

  const copyCredentials = async () => {
    if (!credentials) return;
    const text = `E-Mail: ${credentials.email}\nPasswort: ${credentials.password}`;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Benutzer anlegen</DialogTitle>
          <DialogDescription>
            {credentials
              ? "Der Benutzer wurde erstellt. Teilen Sie die Zugangsdaten mit dem Benutzer."
              : "Erstellen Sie einen neuen Benutzer mit E-Mail und Rolle."}
          </DialogDescription>
        </DialogHeader>

        {credentials ? (
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
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
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
                  <SelectItem value="user">Benutzer</SelectItem>
                  <SelectItem value="sales_partner">Vertriebspartner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="gap-2 pt-4">
              <Button type="button" variant="outline" onClick={handleClose}>
                Abbrechen
              </Button>
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Wird erstellt...
                  </>
                ) : (
                  "Benutzer anlegen"
                )}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
