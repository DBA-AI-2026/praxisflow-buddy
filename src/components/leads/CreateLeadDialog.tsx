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
import { Loader2, UserPlus, Mail } from "lucide-react";

const schema = z.object({
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
  send_confirmation_email: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

interface CreateLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateLeadDialog({ open, onOpenChange }: CreateLeadDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      praxis_name: "",
      vorname: "",
      nachname: "",
      email: "",
      mobilnummer: "",
      plz: "",
      ort: "",
      adresse: "",
      abrechnungszentrum: "keins",
      mp_nummer: "",
      nachricht: "",
      send_confirmation_email: true,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      // Use the capture-lead Edge Function so the same email/Qodia/PLZ-assignment
      // flow runs for manual leads just as for homepage leads.
      const { data, error } = await supabase.functions.invoke("capture-lead", {
        body: {
          praxis_name: values.praxis_name,
          vorname: values.vorname,
          nachname: values.nachname,
          email: values.email,
          mobilnummer: values.mobilnummer || "",
          plz: values.plz,
          ort: values.ort || null,
          adresse: values.adresse || null,
          abrechnungszentrum: values.abrechnungszentrum,
          mp_nummer: values.mp_nummer || null,
          nachricht: values.nachricht || null,
          source: "manual",
          send_confirmation_email: values.send_confirmation_email,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.duplicate) {
        toast({
          title: "Bereits vorhanden",
          description: data.message,
        });
      } else {
        toast({
          title: "Interessent erstellt",
          description: `${values.vorname} ${values.nachname} (${values.praxis_name}) wurde angelegt. HFX-Nr.: ${data?.hfx_customer_number}${values.send_confirmation_email ? " – Bestätigungs-E-Mail versendet." : ""}`,
        });
      }

      form.reset();
      onOpenChange(false);
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-recent-leads"] });
    } catch (err: any) {
      toast({
        title: "Fehler",
        description: err.message || "Lead konnte nicht erstellt werden.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Interessent manuell anlegen
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            {/* Praxis */}
            <FormField
              control={form.control}
              name="praxis_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Praxisname *</FormLabel>
                  <FormControl>
                    <Input placeholder="Praxis Dr. Mustermann" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="vorname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Vorname *</FormLabel>
                    <FormControl>
                      <Input placeholder="Max" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nachname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nachname *</FormLabel>
                    <FormControl>
                      <Input placeholder="Mustermann" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Kontakt */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-Mail *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="max@praxis.de" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="mobilnummer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mobilnummer</FormLabel>
                    <FormControl>
                      <Input placeholder="+49 170 123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Adresse */}
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="adresse"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Straße & Hausnummer</FormLabel>
                    <FormControl>
                      <Input placeholder="Musterstraße 1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="plz"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>PLZ *</FormLabel>
                    <FormControl>
                      <Input placeholder="12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="ort"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ort</FormLabel>
                  <FormControl>
                    <Input placeholder="Musterstadt" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Weitere Infos */}
            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="abrechnungszentrum"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Abrechnungszentrum</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
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
                )}
              />
              <FormField
                control={form.control}
                name="mp_nummer"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>MP-Nummer</FormLabel>
                    <FormControl>
                      <Input placeholder="optional" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="nachricht"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notiz / Nachricht</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Interne Notiz oder Nachricht des Interessenten…"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Email option */}
            <FormField
              control={form.control}
              name="send_confirmation_email"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 rounded-lg border border-border p-3 bg-muted/30">
                  <FormControl>
                    <input
                      type="checkbox"
                      checked={field.value}
                      onChange={field.onChange}
                      className="h-4 w-4 accent-primary"
                    />
                  </FormControl>
                  <div className="flex-1">
                    <FormLabel className="flex items-center gap-2 cursor-pointer mb-0">
                      <Mail className="h-4 w-4 text-primary" />
                      Bestätigungs-E-Mail mit Zugangsdaten senden
                    </FormLabel>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Gleicher Flow wie Homepage-Lead: E-Mail, Qodia-Sync, PLZ-Zuweisung
                    </p>
                  </div>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => { form.reset(); onOpenChange(false); }}
                disabled={submitting}
              >
                Abbrechen
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Interessent anlegen
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
