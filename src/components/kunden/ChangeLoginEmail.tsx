import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { Mail, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ChangeLoginEmail({ hfxNumber, email, onChanged }: {
  hfxNumber: string | null | undefined; email: string | null | undefined;
  onChanged?: (email: string) => void | Promise<void>;
}) {
  const { roles } = useUserRole();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [repeatEmail, setRepeatEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!hfxNumber || !email || !roles.some(r => ["admin", "sales_lead", "regional_lead", "user"].includes(r))) return null;

  const submit = async () => {
    const normalized = newEmail.trim().toLowerCase();
    if (!z.string().email().max(255).safeParse(normalized).success) { setError("Ungültige E-Mail-Adresse."); return; }
    if (normalized !== repeatEmail.trim().toLowerCase()) { setError("Die E-Mail-Adressen stimmen nicht überein."); return; }
    setBusy(true); setError(null);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("change-login-email", {
        body: { hfx_customer_number: hfxNumber, newEmail: normalized },
      });
      if (invokeError || !data?.success) {
        let response = data;
        if (invokeError && "context" in invokeError && invokeError.context instanceof Response) {
          response = await invokeError.context.json().catch(() => null);
        }
        if (response?.changed) { await queryClient.invalidateQueries(); await onChanged?.(normalized); }
        setError(response?.error ?? "Änderung fehlgeschlagen: Das Login-Konto des Kunden konnte nicht umgestellt werden. Es wurde nichts geändert.");
        return;
      }
      await queryClient.invalidateQueries();
      await onChanged?.(normalized);
      setOpen(false);
      toast({ title: "Login-E-Mail geändert. Der Kunde meldet sich ab sofort mit der neuen Adresse an." });
    } catch { setError("Änderung fehlgeschlagen. Bitte Admin informieren."); }
    finally { setBusy(false); }
  };

  return <>
    <Button type="button" variant="outline" size="sm" className="mt-2 max-w-full whitespace-normal" onClick={() => { setNewEmail(""); setRepeatEmail(""); setError(null); setOpen(true); }}>
      <Mail className="mr-2 h-4 w-4 shrink-0" />Login-E-Mail ändern
    </Button>
    <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
      <DialogContent onEscapeKeyDown={event => { if (busy) event.preventDefault(); }} onInteractOutside={event => { if (busy) event.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Login-E-Mail ändern</DialogTitle>
          <DialogDescription>Die neue Adresse wird zuerst im Login-Konto des Kunden umgestellt und erst danach hier übernommen. Die Rechnungs-E-Mail bleibt unverändert.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor={`${id}-new`}>Neue E-Mail</Label><Input id={`${id}-new`} type="email" autoComplete="off" value={newEmail} onChange={event => setNewEmail(event.target.value)} disabled={busy} /></div>
          <div className="space-y-2"><Label htmlFor={`${id}-repeat`}>Neue E-Mail wiederholen</Label><Input id={`${id}-repeat`} type="email" autoComplete="off" value={repeatEmail} onChange={event => setRepeatEmail(event.target.value)} disabled={busy} /></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button type="button" disabled={busy || !newEmail || !repeatEmail} onClick={submit}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Login-E-Mail ändern</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}