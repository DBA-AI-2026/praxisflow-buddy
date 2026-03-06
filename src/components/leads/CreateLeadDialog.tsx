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
import { Loader2, UserPlus } from "lucide-react";

const schema = z.object({
  praxis_name: z.string().trim().min(2, "Pflichtfeld").max(200),
  vorname: z.string().trim().min(1, "Pflichtfeld").max(100),
  nachname: z.string().trim().min(1, "Pflichtfeld").max(100),
  email: z.string().trim().email("Ungültige E-Mail").max(255),
  mobilnummer: z.string().trim().max(50).default(""),
  plz: z.string().trim().min(4, "Pflichtfeld").max(10),
  ort: z.string().trim().max(100).default(""),
  adresse: z.string().trim().max(200).default(""),
  abrechnungszentrum: z.string().default("nein"),
  mp_nummer: z.string().trim().max(50).default(""),
  nachricht: z.string().trim().max(1000).default(""),
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
      abrechnungszentrum: "nein",
      mp_nummer: "",
      nachricht: "",
    },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from("leads").insert({
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
        status: "neu",
      });

      if (error) throw error;

      toast({
        title: "Interessent erstellt",
        description: `${values.vorname} ${values.nachname} (${values.praxis_name}) wurde erfolgreich angelegt.`,
      });

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
                        <SelectItem value="nein">Nein</SelectItem>
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
