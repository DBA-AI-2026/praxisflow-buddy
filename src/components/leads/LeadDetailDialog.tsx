import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Save,
  Send,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Globe,
  UserPlus,
  FilePlus,
  Play,
} from "lucide-react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useNavigate } from "react-router-dom";

const editSchema = z.object({
  praxis_name: z.string().trim().min(2, "Pflichtfeld").max(200),
  vorname: z.string().trim().min(1, "Pflichtfeld").max(100),
  nachname: z.string().trim().min(1, "Pflichtfeld").max(100),
  email: z.string().trim().email("Ungültige E-Mail").max(255),
  mobilnummer: z.string().trim().max(50).default(""),
  plz: z.string().trim().min(4, "Pflichtfeld").max(10),
  ort: z.string().trim().max(100).default(""),
  adresse: z.string().trim().max(200).default(""),
  abrechnungszentrum: z.string().default("keins"),
  mp_nummer: z.string().trim().max(50).default(""),
  nachricht: z.string().trim().max(1000).default(""),
  status: z.string(),
});

type EditValues = z.infer<typeof editSchema>;

const statusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  neu: { label: "Neu", variant: "default" },
  kontaktiert: { label: "Kontaktiert", variant: "secondary" },
  qualifiziert: { label: "Qualifiziert", variant: "outline" },
  vertrag: { label: "Vertrag", variant: "outline" },
  kein_abschluss: { label: "Kein Abschluss", variant: "destructive" },
  abgelehnt: { label: "Abgelehnt", variant: "destructive" },
  kunde: { label: "Kunde", variant: "default" },
};

interface Props {
  lead: any;
  onClose: () => void;
  gebietsleiter?: any[];
  canAssign?: boolean;
}

export function LeadDetailDialog({ lead, onClose, gebietsleiter = [], canAssign = false }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [syncingQodia, setSyncingQodia] = useState(false);
  const [sendingConfirmEmail, setSendingConfirmEmail] = useState(false);

  const form = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      praxis_name: lead.praxis_name || "",
      vorname: lead.vorname || "",
      nachname: lead.nachname || "",
      email: lead.email || "",
      mobilnummer: lead.mobilnummer || "",
      plz: lead.plz || "",
      ort: lead.ort || "",
      adresse: lead.adresse || "",
      abrechnungszentrum: lead.abrechnungszentrum || "keins",
      mp_nummer: lead.mp_nummer || "",
      nachricht: lead.nachricht || "",
      status: lead.status || "neu",
    },
  });

  const onSave = async (values: EditValues) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({
          praxis_name: values.praxis_name,
          vorname: values.vorname,
          nachname: values.nachname,
          email: values.email,
          mobilnummer: values.mobilnummer || "–",
          plz: values.plz,
          ort: values.ort || null,
          adresse: values.adresse || null,
          abrechnungszentrum: values.abrechnungszentrum,
          mp_nummer: values.mp_nummer || null,
          nachricht: values.nachricht || null,
          status: values.status,
        })
        .eq("id", lead.id);

      if (error) throw error;

      toast({ title: "Gespeichert", description: "Interessent wurde aktualisiert." });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-leads"] });
      onClose();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Speichern fehlgeschlagen.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const resendCredentials = async () => {
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-lead-credentials", {
        body: { leadId: lead.id },
      });
      if (error) throw error;
      toast({ title: "Zugangsdaten versendet", description: data?.message });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Versand fehlgeschlagen", variant: "destructive" });
    } finally {
      setResending(false);
    }
  };

  const syncToQodia = async () => {
    setSyncingQodia(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-lead-qodia", {
        body: { leadId: lead.id },
      });
      if (error) throw error;
      if (data?.already_synced) {
        toast({ title: "Bereits synchronisiert", description: data.message });
      } else if (data?.success) {
        toast({ title: "Qodia-Sync erfolgreich", description: data.message });
        queryClient.invalidateQueries({ queryKey: ["leads"] });
      } else {
        toast({ title: "Qodia-Fehler", description: data?.error || "Unbekannter Fehler", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Sync fehlgeschlagen", variant: "destructive" });
    } finally {
      setSyncingQodia(false);
    }
  };

  const sendConfirmationEmail = async () => {
    setSendingConfirmEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-lead-credentials", {
        body: { leadId: lead.id },
      });
      if (error) throw error;
      // Mark as sent in DB
      await supabase
        .from("leads")
        .update({ confirmation_email_sent: true })
        .eq("id", lead.id);
      toast({ title: "Bestätigungs-E-Mail gesendet", description: data?.message || "E-Mail wurde erfolgreich verschickt." });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      onClose();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "E-Mail-Versand fehlgeschlagen", variant: "destructive" });
    } finally {
      setSendingConfirmEmail(false);
    }
  };

  const sc = statusConfig[lead.status] || statusConfig.neu;
  const sourceLabel = lead.source === "manual" ? "Manuell erfasst" : "Homepage";
  const sourceIcon = lead.source === "manual"
    ? <UserPlus className="h-3 w-3" />
    : <Globe className="h-3 w-3" />;

  const getAssigneeName = (assigned_to: string | null) => {
    if (!assigned_to) return "Nicht zugewiesen";
    const p = gebietsleiter.find((g: any) => g.user_id === assigned_to);
    return p ? p.full_name : "–";
  };

  // Sync items definition: key, label, trigger action (null = not triggerable)
  const syncItems: Array<{
    key: string;
    label: string;
    onTrigger?: () => void;
    triggering?: boolean;
    triggerLabel?: string;
  }> = [
    {
      key: "confirmation_email_sent",
      label: "Bestätigungs-E-Mail",
      onTrigger: sendConfirmationEmail,
      triggering: sendingConfirmEmail,
      triggerLabel: "E-Mail senden",
    },
    {
      key: "qodia_synced",
      label: "Qodia",
      onTrigger: !lead.qodia_synced ? syncToQodia : undefined,
      triggering: syncingQodia,
      triggerLabel: "Registrieren",
    },
    {
      key: "salesforce_synced",
      label: "Salesforce",
    },
    {
      key: "honorarplus_synced",
      label: "HonorarPlus",
    },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="font-mono text-primary">{lead.hfx_customer_number}</span>
            <Badge variant={sc.variant} className="text-xs">{sc.label}</Badge>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
              lead.source === "manual"
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-primary/10 text-primary border-primary/30"
            }`}>
              {sourceIcon}
              {sourceLabel}
            </span>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="details">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Stammdaten bearbeiten</TabsTrigger>
            <TabsTrigger value="info" className="flex-1">Sync-Status & Aktionen</TabsTrigger>
          </TabsList>

          {/* ── Tab: Bearbeiten ── */}
          <TabsContent value="details" className="mt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSave)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="status" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {Object.entries(statusConfig).filter(([k]) => k !== "kunde").map(([key, cfg]) => (
                            <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="praxis_name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Praxisname *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="vorname" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Vorname *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="nachname" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nachname *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem>
                      <FormLabel>E-Mail *</FormLabel>
                      <FormControl><Input type="email" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="mobilnummer" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobilnummer</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <FormField control={form.control} name="adresse" render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Straße & Nr.</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="plz" render={({ field }) => (
                    <FormItem>
                      <FormLabel>PLZ *</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="ort" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ort</FormLabel>
                    <FormControl><Input {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-2 gap-3">
                  <FormField control={form.control} name="abrechnungszentrum" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Abrechnungszentrum</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value="keins">Keins</SelectItem>
                          <SelectItem value="CareCapital">CareCapital</SelectItem>
                          <SelectItem value="privadis">privadis</SelectItem>
                          <SelectItem value="ZAB">ZAB</SelectItem>
                          <SelectItem value="PVS">PVS</SelectItem>
                          <SelectItem value="DZR">DZR</SelectItem>
                          <SelectItem value="ARZ">ARZ</SelectItem>
                          <SelectItem value="Sonstiges">Sonstiges</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="mp_nummer" render={({ field }) => (
                    <FormItem>
                      <FormLabel>MP-Nummer</FormLabel>
                      <FormControl><Input placeholder="optional" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="nachricht" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notiz / Nachricht</FormLabel>
                    <FormControl><Textarea rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="flex justify-end gap-3 pt-2 border-t">
                  <Button type="button" variant="outline" onClick={onClose}>Abbrechen</Button>
                  <Button type="submit" disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    <Save className="h-4 w-4 mr-2" />
                    Speichern
                  </Button>
                </div>
              </form>
            </Form>
          </TabsContent>

          {/* ── Tab: Sync & Aktionen ── */}
          <TabsContent value="info" className="mt-4 space-y-4">
            {/* Meta */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">Erstellt am</p>
                <p className="font-medium">{format(new Date(lead.created_at), "dd.MM.yyyy HH:mm", { locale: de })}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground mb-1">Registrierungsversuche</p>
                <p className="font-medium">{lead.registration_attempts ?? 1}×</p>
              </div>
              {lead.hfx_customer_number && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">HFX-Kundennummer</p>
                  <p className="font-mono font-semibold text-primary">{lead.hfx_customer_number}</p>
                </div>
              )}
              {lead.mp_nummer && (
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs text-muted-foreground mb-1">MP-Nummer</p>
                  <p className="font-mono font-medium">{lead.mp_nummer}</p>
                </div>
              )}
              {canAssign && (
                <div className="rounded-lg border border-border p-3 col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">AD-Zuteilung</p>
                  <p className="font-medium">{getAssigneeName(lead.assigned_to)}</p>
                </div>
              )}
            </div>

            {/* Sync-Status – each row is clickable if an action exists */}
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Sync-Status</p>
              <div className="space-y-2">
                {syncItems.map(({ key, label, onTrigger, triggering, triggerLabel }) => {
                  const isSynced = !!(lead as any)[key];
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isSynced
                          ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          : <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        }
                        <span className={isSynced ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                      </div>
                      {onTrigger && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary hover:bg-muted"
                          onClick={onTrigger}
                          disabled={triggering}
                        >
                          {triggering
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Play className="h-3 w-3" />
                          }
                          {triggerLabel}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Aktionen */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={resending}
                onClick={resendCredentials}
              >
                {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Zugangsdaten erneut senden
              </Button>

              {!lead.qodia_synced && (
                <Button
                  variant="outline"
                  className="w-full justify-start gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                  disabled={syncingQodia}
                  onClick={syncToQodia}
                >
                  <RefreshCw className={`h-4 w-4 ${syncingQodia ? "animate-spin" : ""}`} />
                  Bei Qodia registrieren
                </Button>
              )}

              <Button
                className="w-full justify-start gap-2"
                onClick={() => {
                  onClose();
                  navigate("/vertrieb/vertraege", {
                    state: {
                      fromLead: {
                        lead_id: lead.id,
                        hfx_customer_number: lead.hfx_customer_number,
                        praxis: lead.praxis_name,
                        vorname: lead.vorname,
                        nachname: lead.nachname,
                        email: lead.email,
                        plz: lead.plz,
                        ort: lead.ort || "",
                        adresse: lead.adresse || "",
                        telefon: lead.mobilnummer,
                        mp_nr: lead.mp_nummer || "",
                        nachricht: lead.nachricht || "",
                      },
                    },
                  });
                }}
              >
                <FilePlus className="h-4 w-4" />
                Digitalen Vertrag erstellen
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
