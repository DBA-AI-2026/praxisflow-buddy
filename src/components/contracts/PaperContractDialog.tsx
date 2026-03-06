import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { addMonths } from "date-fns";
import { FileText, Loader2, CreditCard } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";

const schema = z.object({
  vorname: z.string().min(1, "Pflichtfeld"),
  nachname: z.string().min(1, "Pflichtfeld"),
  praxis: z.string().min(1, "Pflichtfeld"),
  email: z.string().email("Ungültige E-Mail").or(z.literal("")),
  telefon: z.string().optional(),
  adresse: z.string().optional(),
  plz: z.string().optional(),
  ort: z.string().optional(),
  product_name: z.string().min(1, "Pflichtfeld"),
  monthly_price: z.coerce.number().min(0, "Pflichtfeld"),
  license_count: z.coerce.number().min(1),
  start_date: z.string().min(1, "Pflichtfeld"),
  duration_months: z.coerce.number().min(1),
  rechnungs_email: z.string().email("Ungültige E-Mail").or(z.literal("")).optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaperContractDialog({ open, onOpenChange }: Props) {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { register, handleSubmit, setValue, reset, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      start_date: new Date().toISOString().split("T")[0],
      duration_months: 12,
      license_count: 1,
      monthly_price: 0,
    },
  });

  const onSubmit = async (data: FormData) => {
    if (!user?.id) return;
    setIsSubmitting(true);

    try {
      const endDate = addMonths(new Date(data.start_date), data.duration_months);
      const customerName = `${data.vorname} ${data.nachname}`.trim();
      const now = new Date().toISOString();

      const { data: inserted, error } = await supabase
        .from("contracts")
        .insert({
          customer_name: customerName,
          praxis: data.praxis,
          vorname: data.vorname,
          nachname: data.nachname,
          email: data.email || null,
          telefon: data.telefon || null,
          adresse: data.adresse || null,
          plz: data.plz || null,
          ort: data.ort || null,
          product_name: data.product_name,
          modules: [data.product_name],
          monthly_price: data.monthly_price,
          license_count: data.license_count,
          start_date: data.start_date,
          duration_months: data.duration_months,
          end_date: endDate.toISOString().split("T")[0],
          cancellation_period_months: 3,
          auto_renewal: true,
          one_time_fee: 0,
          discount_percent: 0,
          payment_interval: "monatlich",
          rechnungs_email: data.rechnungs_email || null,
          status: "aktiv",
          notes: `[Papier]${data.notes ? " " + data.notes : ""}`,
          created_by: user.id,
          sales_partner_id: user.id,
          sales_partner_name: profile?.full_name || "",
          approved_by: user.id,
          approved_at: now,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Create praxen entry
      await supabase.from("praxen").insert({
        name: data.praxis || customerName,
        adresse: data.adresse || null,
        plz: data.plz || null,
        ort: data.ort || null,
        telefon: data.telefon || null,
        email: data.email || null,
        produkt: data.product_name,
        module: [data.product_name],
        preis: data.monthly_price,
        buchungs_datum: data.start_date,
        status: "aktiv",
      });

      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["praxen"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] });

      toast({
        title: "✅ Papiervertrag erfasst",
        description: `${customerName} ist jetzt aktiv und wird ab dem ${new Date(data.start_date).toLocaleDateString("de-DE")} abgerechnet.`,
      });

      reset();
      onOpenChange(false);
    } catch (err: any) {
      toast({ title: "Fehler", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Papiervertrag nacherfassen
          </DialogTitle>
          <DialogDescription>
            Manuell unterzeichneter Vertrag direkt als <strong>aktiv</strong> anlegen. Die Abrechnung startet sofort ab dem eingetragenen Vertragsbeginn.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5 pt-2">
          {/* Kundendaten */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 pb-1 border-b border-border">Kundendaten</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="vorname">Vorname *</Label>
                <Input id="vorname" {...register("vorname")} placeholder="Elisabeth" className={errors.vorname ? "border-destructive" : ""} />
                {errors.vorname && <p className="text-xs text-destructive">{errors.vorname.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="nachname">Nachname *</Label>
                <Input id="nachname" {...register("nachname")} placeholder="Freitag" className={errors.nachname ? "border-destructive" : ""} />
                {errors.nachname && <p className="text-xs text-destructive">{errors.nachname.message}</p>}
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="praxis">Praxisname *</Label>
                <Input id="praxis" {...register("praxis")} placeholder="Praxis Dr. Freitag" className={errors.praxis ? "border-destructive" : ""} />
                {errors.praxis && <p className="text-xs text-destructive">{errors.praxis.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">E-Mail</Label>
                <Input id="email" type="email" {...register("email")} placeholder="praxis@example.de" className={errors.email ? "border-destructive" : ""} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="telefon">Telefon</Label>
                <Input id="telefon" {...register("telefon")} placeholder="+49 123 4567890" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="adresse">Adresse</Label>
                <Input id="adresse" {...register("adresse")} placeholder="Musterstraße 1" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="plz">PLZ</Label>
                <Input id="plz" {...register("plz")} placeholder="12345" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ort">Ort</Label>
                <Input id="ort" {...register("ort")} placeholder="Berlin" />
              </div>
            </div>
          </div>

          {/* Vertragsdetails */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 pb-1 border-b border-border">Vertragsdetails</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Produkt *</Label>
                <Select onValueChange={(v) => setValue("product_name", v)}>
                  <SelectTrigger className={errors.product_name ? "border-destructive" : ""}>
                    <SelectValue placeholder="Produkt auswählen..." />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((p: any) => (
                      <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.product_name && <p className="text-xs text-destructive">{errors.product_name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="monthly_price">Monatlicher Preis (€) *</Label>
                <Input id="monthly_price" type="number" step="0.01" {...register("monthly_price")} placeholder="179.00" className={errors.monthly_price ? "border-destructive" : ""} />
                {errors.monthly_price && <p className="text-xs text-destructive">{errors.monthly_price.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="license_count">Lizenzen</Label>
                <Input id="license_count" type="number" min={1} {...register("license_count")} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="start_date">Vertragsbeginn *</Label>
                <Input id="start_date" type="date" {...register("start_date")} className={errors.start_date ? "border-destructive" : ""} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="duration_months">Laufzeit (Monate)</Label>
                <Input id="duration_months" type="number" min={1} {...register("duration_months")} />
              </div>
            </div>
          </div>

          {/* Zahlung */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3 pb-1 border-b border-border">Zahlung</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-primary shrink-0" />
                  <span>Zahlung über <strong className="text-foreground">Stripe</strong> (Kreditkarte oder SEPA-Lastschrift)</span>
                </div>
              </div>
              <div className="col-span-2 space-y-1">
                <Label htmlFor="rechnungs_email">Rechnungs-E-Mail (falls abweichend)</Label>
                <Input id="rechnungs_email" type="email" {...register("rechnungs_email")} placeholder="buchhaltung@praxis.de" className={errors.rechnungs_email ? "border-destructive" : ""} />
                {errors.rechnungs_email && <p className="text-xs text-destructive">{errors.rechnungs_email.message}</p>}
              </div>
            </div>
          </div>

          {/* Notizen */}
          <div className="space-y-1">
            <Label htmlFor="notes">Notizen (optional)</Label>
            <Textarea id="notes" {...register("notes")} placeholder="z.B. Vertrag liegt im Ordner 2025/Freitag..." rows={2} />
          </div>

          <div className="rounded-md bg-warning/10 border border-warning/30 px-3 py-2 text-xs text-warning-foreground">
            <strong>Hinweis:</strong> Der Vertrag wird direkt als <em>Aktiv</em> gespeichert und der Kunde in der Kundenverwaltung angelegt. Die automatische Abrechnung startet am eingetragenen Vertragsbeginn.
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Vertrag aktivieren
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
