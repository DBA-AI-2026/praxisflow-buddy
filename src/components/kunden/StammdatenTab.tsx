/**
 * StammdatenTab — Tab 1 im KundenDialog (Etappe 2b-i).
 *
 * Bearbeitet Praxis-, Person- und Kontaktdaten. Phase entscheidet, ob die
 * SSOT der Lead- oder Kunden-Datensatz ist (siehe useKundenDialogData).
 * Bei !canEdit sind alle Felder read-only und der Speichern-Button ist
 * deaktiviert mit Tooltip.
 */
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { useUserRole } from "@/hooks/useUserRole";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Lock, UserCog } from "lucide-react";
import { ReassignLeadAdDialog } from "@/components/leads/ReassignLeadAdDialog";
import type {
  StammdatenFormValues,
  UseKundenDialogDataResult,
} from "@/hooks/useKundenDialogData";

const schema = z.object({
  praxis_name: z.string().trim().min(2, "Pflichtfeld").max(200),
  vorname: z.string().trim().min(1, "Pflichtfeld").max(100),
  nachname: z.string().trim().min(1, "Pflichtfeld").max(100),
  email: z.string().trim().email("Ungültige E-Mail").max(255),
  telefon: z.string().trim().max(50).default(""),
  plz: z.string().trim().min(4, "Pflichtfeld").max(10),
  ort: z.string().trim().max(100).default(""),
  adresse: z.string().trim().max(200).default(""),
  abrechnungszentrum: z.string().default("nein"),
  mp_nr: z.string().trim().max(50).default(""),
  notes: z.string().trim().max(1000).default(""),
});

interface StammdatenTabProps {
  data: UseKundenDialogDataResult;
}

export function StammdatenTab({ data }: StammdatenTabProps) {
  const {
    isLoading,
    canEditStammdaten,
    canEditReason,
    initialValues,
    saveStammdaten,
    isSaving,
    ssot,
  } = data;

  const form = useForm<StammdatenFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initialValues,
  });

  // Form zurücksetzen, wenn Datenquelle nachgeladen wird
  useEffect(() => {
    form.reset(initialValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(initialValues)]);

  const disabled = !canEditStammdaten || isSaving;

  if (isLoading) {
    return (
      <div className="rounded-lg border p-6 text-sm text-muted-foreground">
        Lade Stammdaten…
      </div>
    );
  }

  const onSubmit = async (values: StammdatenFormValues) => {
    await saveStammdaten(values);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        {!canEditStammdaten && canEditReason && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <Lock className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Nur lesen</div>
              <div className="text-xs mt-0.5">{canEditReason}</div>
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground">
          Quelle: {ssot === "lead" ? "Interessenten-Datensatz" : "Kundendatensatz"}
          {ssot === "customer" && data.lead && " (Änderungen werden auf Interessent gespiegelt)"}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="praxis_name"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Praxisname *</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="vorname"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Vorname *</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
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
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-Mail *</FormLabel>
                <FormControl>
                  <Input type="email" {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="telefon"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Telefon</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="adresse"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Adresse</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
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
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="ort"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Ort</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="abrechnungszentrum"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Abrechnungszentrum</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="nein">Nein</SelectItem>
                    <SelectItem value="keins">Keins</SelectItem>
                    <SelectItem value="pvs">PVS</SelectItem>
                    <SelectItem value="medas">Medas</SelectItem>
                    <SelectItem value="pad">PAD</SelectItem>
                    <SelectItem value="sonstige">Sonstige</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="mp_nr"
            render={({ field }) => (
              <FormItem>
                <FormLabel>MP-Nummer</FormLabel>
                <FormControl>
                  <Input {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Notiz</FormLabel>
                <FormControl>
                  <Textarea rows={3} {...field} disabled={disabled} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-end pt-2">
          {!canEditStammdaten ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button type="button" disabled>
                      Speichern
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  {canEditReason ?? "Keine Berechtigung zum Bearbeiten."}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Speichere…" : "Speichern"}
            </Button>
          )}
        </div>
      </form>
    </Form>
  );
}
