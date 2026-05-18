import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { LEAD_STATUS_TOOLTIPS } from "@/lib/statusGlossary";
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
  Mail,
  Package,
  Users,
  Lightbulb,
  Trash2,
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
  vertrag: { label: "In Vertragserstellung", variant: "outline" },
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
  const { isAdmin, isSalesLead, isRegionalLead } = useUserRole();
  const canSeePartnerInfo = isAdmin || isSalesLead || isRegionalLead;
  const [saving, setSaving] = useState(false);
  const [resending, setResending] = useState(false);
  const [syncingQodia, setSyncingQodia] = useState(false);
  const [sendingConfirmEmail, setSendingConfirmEmail] = useState(false);
  const [sendingCredentials, setSendingCredentials] = useState(false);
  const [sendingBuchungsmail, setSendingBuchungsmail] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Fetch assigned profile name
  const { data: assignedProfile } = useQuery({
    queryKey: ["profile", lead.assigned_to],
    queryFn: async () => {
      if (!lead.assigned_to) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("user_id", lead.assigned_to)
        .maybeSingle();
      return data;
    },
    enabled: !!lead.assigned_to && canSeePartnerInfo,
  });

  // Check if there's a linked Tippgeber lead
  const { data: tippLeadMatch } = useQuery({
    queryKey: ["tipp-lead-match", lead.email, lead.praxis_name],
    queryFn: async () => {
      const { data } = await supabase
        .from("tipp_leads")
        .select("id, arzt_name, praxis_name, created_by")
        .or(`email.eq.${lead.email},praxis_name.eq.${lead.praxis_name}`)
        .limit(1);
      if (!data || data.length === 0) return null;
      // Fetch tippgeber profile
      const tipp = data[0];
      const { data: tippProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", tipp.created_by)
        .maybeSingle();
      return { ...tipp, tippgeber_name: tippProfile?.full_name || "Unbekannt" };
    },
    enabled: canSeePartnerInfo,
  });

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
      queryClient.invalidateQueries({ queryKey: ["leads"] });
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

  const sendCredentialsSync = async () => {
    setSendingCredentials(true);
    try {
      const { data, error } = await supabase.functions.invoke("resend-lead-credentials", {
        body: { leadId: lead.id },
      });
      if (error) throw error;
      toast({ title: "Zugangsdaten versendet", description: data?.message });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Versand fehlgeschlagen", variant: "destructive" });
    } finally {
      setSendingCredentials(false);
    }
  };

  const sendBuchungsmail = async () => {
    setSendingBuchungsmail(true);
    try {
      // Find the contract with status 'eingegangen' linked to this lead's email or hfx_customer_number
      const { data: contracts, error: contractError } = await supabase
        .from("contracts")
        .select("id, product_name, email, hfx_customer_number")
        .eq("status", "eingegangen")
        .or(`email.eq.${lead.email},hfx_customer_number.eq.${lead.hfx_customer_number}`)
        .order("created_at", { ascending: false })
        .limit(1);

      if (contractError) throw contractError;

      if (!contracts || contracts.length === 0) {
        toast({
          title: "Kein Vertrag gefunden",
          description: "Es wurde kein Vertrag mit Status 'Eingegangen' für diesen Interessenten gefunden. Bitte zuerst einen Vertrag anlegen.",
          variant: "destructive",
        });
        return;
      }

      const contract = contracts[0];

      const { data, error } = await supabase.functions.invoke("send-mandate-setup", {
        body: { contract_id: contract.id },
      });

      if (error) throw error;

      toast({
        title: "SEPA-Mandat-Mail gesendet",
        description: `Die SEPA-Mandat-Mail wurde erfolgreich an ${contract.email} gesendet.`,
      });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
    } catch (err: any) {
      toast({
        title: "Fehler beim E-Mail-Versand",
        description: err.message || "E-Mail konnte nicht gesendet werden.",
        variant: "destructive",
      });
    } finally {
      setSendingBuchungsmail(false);
    }
  };

  const deleteLead = async () => {
    setDeleting(true);
    try {
      const { error } = await supabase.from("leads").delete().eq("id", lead.id);
      if (error) throw error;
      toast({ title: "Gelöscht", description: "Interessent wurde endgültig gelöscht." });
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-leads"] });
      onClose();
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message || "Löschen fehlgeschlagen.", variant: "destructive" });
    } finally {
      setDeleting(false);
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
    value?: boolean | null;
    timestamp?: string | null;
    onTrigger?: () => void;
    triggering?: boolean;
    triggerLabel?: string;
  }> = [
    {
      key: "confirmation_email_sent",
      label: "Bestätigungs-E-Mail mit Zugangsdaten",
      value: lead.confirmation_email_sent,
      onTrigger: sendConfirmationEmail,
      triggering: sendingConfirmEmail,
      triggerLabel: "E-Mail senden",
    },
    {
      key: "qodia_synced",
      label: "Qodia",
      value: lead.qodia_synced,
      onTrigger: syncToQodia,
      triggering: syncingQodia,
      triggerLabel: "Registrieren",
    },
    {
      key: "salesforce_synced",
      label: "Salesforce",
      value: lead.salesforce_synced,
    },
    {
      key: "credentials_resend",
      label: "Zugangsdaten erneut zusenden",
      value: !!lead.credentials_sent_at,
      timestamp: lead.credentials_sent_at,
      onTrigger: sendCredentialsSync,
      triggering: sendingCredentials,
      triggerLabel: "Zusenden",
    },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span className="font-mono text-primary">{lead.hfx_customer_number}</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant={sc.variant} className="text-xs cursor-help">{sc.label}</Badge>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {LEAD_STATUS_TOOLTIPS[lead.status] ?? sc.label}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
              lead.source === "manual"
                ? "bg-accent/10 text-accent border-accent/30"
                : "bg-primary/10 text-primary border-primary/30"
            }`}>
              {sourceIcon}
              {sourceLabel}
            </span>
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteConfirm(true)}
                title="Interessent löschen"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
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
              <form autoComplete="off" onSubmit={form.handleSubmit(onSave)} className="space-y-4">
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
              {canSeePartnerInfo && !canAssign && (
                <div className="rounded-lg border border-border p-3 col-span-2">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Users className="h-3 w-3" /> Vertriebspartner / AD-Zuteilung
                  </p>
                  <p className="font-medium">
                    {assignedProfile
                      ? `${assignedProfile.full_name} (${assignedProfile.email})`
                      : lead.assigned_to ? "–" : "Nicht zugewiesen"}
                  </p>
                </div>
              )}
              {canSeePartnerInfo && tippLeadMatch && (
                <div className="rounded-lg border border-border p-3 col-span-2">
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Lightbulb className="h-3 w-3" /> Tippgeber
                  </p>
                  <p className="font-medium">{tippLeadMatch.tippgeber_name}</p>
                </div>
              )}
            </div>

            {/* Produktinteresse */}
            {lead.interested_products && lead.interested_products.length > 0 && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide flex items-center gap-1">
                  <Package className="h-3 w-3" /> Produktinteresse
                </p>
                <div className="flex flex-wrap gap-2">
                  {lead.interested_products.map((product: string) => (
                    <Badge key={product} variant="secondary" className="text-xs">
                      {product}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Sync-Status – each row is clickable if an action exists */}
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wide">Sync-Status</p>
              <div className="space-y-2">
                {syncItems.map(({ key, label, value, timestamp, onTrigger, triggering, triggerLabel }) => {
                  const isSynced = !!value;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isSynced
                          ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                          : <XCircle className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                        }
                        <div className="min-w-0">
                          <span className={isSynced ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                          {isSynced && timestamp && (
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(timestamp), "dd.MM.yyyy HH:mm", { locale: de })}
                            </p>
                          )}
                        </div>
                      </div>
                      {onTrigger && !isSynced && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 text-primary hover:text-primary hover:bg-muted shrink-0"
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
                className="w-full justify-start gap-2"
                onClick={() => {
                  // Pass tippgeber_id so it can be set on the contract
                  const params = new URLSearchParams({ leadId: lead.id });
                  if (lead.tippgeber_id) params.set("tippgeberId", lead.tippgeber_id);
                  onClose();
                  navigate(`/vertrieb/vertraege?${params.toString()}`);
                }}
              >
                <FilePlus className="h-4 w-4" />
                Digitalen Vertragsabschluss starten
              </Button>

              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                disabled={sendingBuchungsmail}
                onClick={sendBuchungsmail}
              >
                {sendingBuchungsmail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                SEPA-Mandat-Mail senden (nur bei bestehenden Verträgen)
              </Button>

            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Interessent endgültig löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Interessent <strong>{lead.praxis_name}</strong> ({lead.hfx_customer_number}) wird unwiderruflich gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteLead}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Endgültig löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
