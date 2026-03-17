import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, UserPlus, Mail, Package, Users, Heart, ChevronsUpDown, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  interested_products: z.array(z.string()).default([]),
  assigned_to: z.string().nullable().default(null),
  tippgeber_id: z.string().nullable().default(null),
});

type FormValues = z.infer<typeof schema>;

interface CreateLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function UserSearchSelect({
  value,
  onChange,
  users,
  placeholder,
}: {
  value: string | null;
  onChange: (val: string | null) => void;
  users: { user_id: string; full_name: string; email: string | null }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    return (
      u.full_name.toLowerCase().includes(q) ||
      (u.email?.toLowerCase().includes(q) ?? false)
    );
  });

  const selected = users.find((u) => u.user_id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">{selected.full_name}</span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {value && (
              <X
                className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="p-2 border-b">
          <Input
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2 text-center">Keine Ergebnisse</p>
          ) : (
            filtered.map((u) => (
              <button
                key={u.user_id}
                type="button"
                className={cn(
                  "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                  value === u.user_id && "bg-accent"
                )}
                onClick={() => {
                  onChange(u.user_id === value ? null : u.user_id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check className={cn("h-4 w-4 shrink-0", value === u.user_id ? "opacity-100" : "opacity-0")} />
                <div className="text-left truncate">
                  <span>{u.full_name}</span>
                  {u.email && (
                    <span className="text-muted-foreground ml-1 text-xs">({u.email})</span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function CreateLeadDialog({ open, onOpenChange }: CreateLeadDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const { isAdmin, isSalesLead } = useUserRole();
  const canAssign = isAdmin || isSalesLead;

  const { data: products = [] } = useQuery({
    queryKey: ["active-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch sales partners (users with sales_partner or user role)
  const { data: salesPartners = [] } = useQuery({
    queryKey: ["sales-partners-for-lead"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["sales_partner", "user"]);
      if (error) throw error;
      if (!data?.length) return [];
      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      return profiles || [];
    },
    enabled: canAssign,
  });

  // Fetch tippgeber
  const { data: tippgeberList = [] } = useQuery({
    queryKey: ["tippgeber-for-lead"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "tippgeber");
      if (error) throw error;
      if (!data?.length) return [];
      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);
      return profiles || [];
    },
    enabled: canAssign,
  });

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
      interested_products: [],
      assigned_to: null,
      tippgeber_id: null,
    },
  });

  const onSubmit = async (values: FormValues) => {
    setSubmitting(true);
    try {
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
          interested_products: values.interested_products,
          assigned_to: values.assigned_to || undefined,
          tippgeber_id: values.tippgeber_id || undefined,
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
          <form autoComplete="off" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
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

            {/* Vertriebspartner & Tippgeber */}
            {canAssign && (
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
                  name="assigned_to"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-primary" />
                        Vertriebspartner
                      </FormLabel>
                      <FormControl>
                        <UserSearchSelect
                          value={field.value}
                          onChange={field.onChange}
                          users={salesPartners}
                          placeholder="Kein Vertriebspartner"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="tippgeber_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Heart className="h-4 w-4 text-primary" />
                        Tippgeber
                      </FormLabel>
                      <FormControl>
                        <UserSearchSelect
                          value={field.value}
                          onChange={field.onChange}
                          users={tippgeberList}
                          placeholder="Kein Tippgeber"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {/* Produktinteresse */}
            {products.length > 0 && (
              <FormField
                control={form.control}
                name="interested_products"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-primary" />
                      Produktinteresse
                    </FormLabel>
                    <div className="grid grid-cols-2 gap-2">
                      {products.map((product) => {
                        const values = field.value || [];
                        const checked = values.includes(product.name);
                        return (
                          <label
                            key={product.id}
                            className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                              checked
                                ? "border-primary bg-primary/5"
                                : "border-border hover:bg-muted/50"
                            }`}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(val) => {
                                const current = field.value || [];
                                const next = val
                                  ? [...current, product.name]
                                  : current.filter((p: string) => p !== product.name);
                                field.onChange(next);
                              }}
                            />
                            <span className="text-sm">{product.name}</span>
                          </label>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

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
