import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2, Plus, Lightbulb, Clock, CheckCircle, XCircle,
  Mail, Phone, Timer,
} from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { de } from "date-fns/locale";

const GESCHAEFTSBEREICHE = ["MCC", "privadis", "ZAB"] as const;

const statusConfig: Record<string, { label: string; class: string; icon: typeof Clock }> = {
  neu: { label: "Neu", class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", icon: Clock },
  in_bearbeitung: { label: "In Bearbeitung", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: Loader2 },
  abgeschlossen: { label: "Abgeschlossen", class: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle },
  abgelehnt: { label: "Abgelehnt", class: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", icon: XCircle },
};

const emptyForm = {
  arzt_name: "",
  praxis_name: "",
  email: "",
  telefon: "",
  plz: "",
  geschaeftsbereich: "",
  gewuenschte_dienstleistung: "",
};

function TimerBadge({ reservationUntil }: { reservationUntil: string | null }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceUpdate(n => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  if (!reservationUntil) return null;
  const date = new Date(reservationUntil);
  const expired = isPast(date);

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${
        expired
          ? "bg-destructive/10 text-destructive"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
      }`}
      title={format(date, "dd.MM.yyyy HH:mm", { locale: de })}
    >
      <Timer className="h-3 w-3" />
      {expired ? "Abgelaufen" : formatDistanceToNow(date, { locale: de, addSuffix: false })}
    </span>
  );
}

export default function TippgeberPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: tips = [], isLoading } = useQuery({
    queryKey: ["tipp-leads", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipp_leads" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: !!user,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Nicht angemeldet");

      // 1. Insert into DB
      const { data: inserted, error } = await supabase.from("tipp_leads" as any).insert({
        created_by: user.id,
        arzt_name: form.arzt_name.trim(),
        praxis_name: form.praxis_name.trim(),
        email: form.email.trim() || null,
        telefon: form.telefon.trim() || null,
        plz: form.plz.trim(),
        geschaeftsbereich: form.geschaeftsbereich,
        gewuenschte_dienstleistung: form.gewuenschte_dienstleistung.trim(),
      }).select("id").single();
      if (error) throw error;

      // 2. Trigger edge function (SF sync + confirmation email) – fire & forget
      if ((inserted as any)?.id) {
        supabase.functions.invoke("submit-tipp-lead", {
          body: { tippLeadId: (inserted as any).id },
        }).then(({ error: fnErr }) => {
          if (fnErr) console.warn("submit-tipp-lead warning:", fnErr.message);
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tipp-leads"] });
      setForm(emptyForm);
      setShowForm(false);
      toast({
        title: "Tipp eingereicht",
        description: "Ihr Lead-Tipp wurde übermittelt und eine Bestätigungsmail wurde versendet.",
      });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.arzt_name || !form.praxis_name || !form.plz || !form.geschaeftsbereich || !form.gewuenschte_dienstleistung) {
      toast({ title: "Pflichtfelder", description: "Bitte füllen Sie alle Pflichtfelder aus.", variant: "destructive" });
      return;
    }
    submitMutation.mutate();
  };

  return (
    <MainLayout title="Lead-Tipps" subtitle="Ihre eingereichten Kontakte an das Vertriebsteam">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Lightbulb className="h-6 w-6 text-primary" />
              Meine Lead-Tipps
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Übermitteln Sie interessante Kontakte an unser Vertriebsteam.
            </p>
          </div>
          <Button onClick={() => setShowForm(!showForm)} className="gap-2">
            <Plus className="h-4 w-4" />
            Neuer Tipp
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <Card className="border-primary/20">
            <CardHeader>
              <CardTitle className="text-base">Lead-Tipp einreichen</CardTitle>
              <CardDescription>Felder mit * sind Pflichtfelder. Nach dem Speichern erhalten Sie eine Bestätigungsmail.</CardDescription>
            </CardHeader>
            <CardContent>
              <form autoComplete="off" onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="arzt_name">Name des Arztes *</Label>
                  <Input
                    id="arzt_name"
                    placeholder="Dr. Max Mustermann"
                    value={form.arzt_name}
                    onChange={e => setForm(f => ({ ...f, arzt_name: e.target.value }))}
                    maxLength={200}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="praxis_name">Praxisname *</Label>
                  <Input
                    id="praxis_name"
                    placeholder="Praxis Mustermann"
                    value={form.praxis_name}
                    onChange={e => setForm(f => ({ ...f, praxis_name: e.target.value }))}
                    maxLength={200}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">E-Mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="praxis@example.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    maxLength={255}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="telefon">Telefon</Label>
                  <Input
                    id="telefon"
                    placeholder="+49 30 1234567"
                    value={form.telefon}
                    onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))}
                    maxLength={50}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="plz">Postleitzahl *</Label>
                  <Input
                    id="plz"
                    placeholder="12345"
                    value={form.plz}
                    onChange={e => setForm(f => ({ ...f, plz: e.target.value.replace(/\D/g, "").slice(0, 5) }))}
                    maxLength={5}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Geschäftsbereich *</Label>
                  <Select value={form.geschaeftsbereich} onValueChange={v => setForm(f => ({ ...f, geschaeftsbereich: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Bitte wählen..." />
                    </SelectTrigger>
                    <SelectContent>
                      {GESCHAEFTSBEREICHE.map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="dienstleistung">Art der gewünschten Dienstleistung *</Label>
                  <Textarea
                    id="dienstleistung"
                    placeholder="Beschreiben Sie kurz, was die Praxis benötigt oder woran sie Interesse gezeigt hat…"
                    value={form.gewuenschte_dienstleistung}
                    onChange={e => setForm(f => ({ ...f, gewuenschte_dienstleistung: e.target.value }))}
                    maxLength={1000}
                    rows={3}
                    required
                  />
                  <p className="text-xs text-muted-foreground text-right">{form.gewuenschte_dienstleistung.length}/1000</p>
                </div>

                <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm); }}>
                    Abbrechen
                  </Button>
                  <Button type="submit" disabled={submitMutation.isPending}>
                    {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Speichern & einreichen
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* List */}
        <div className="card-elevated overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : tips.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Lightbulb className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Noch keine Tipps eingereicht</p>
              <p className="text-sm mt-1">Klicken Sie auf „Neuer Tipp", um einen Lead zu übermitteln.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr className="bg-accent/5">
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Arzt</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Praxis</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">PLZ</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Bereich</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 max-w-[200px]">Dienstleistung</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 text-center">Status</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 whitespace-nowrap">Reservierung</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 whitespace-nowrap">Ansprechpartner AD</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 whitespace-nowrap">Eingereicht</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {tips.map((tip: any) => {
                    const cfg = statusConfig[tip.status] ?? statusConfig.neu;
                    const Icon = cfg.icon;
                    return (
                      <tr key={tip.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-foreground whitespace-nowrap">{tip.arzt_name}</td>
                        <td className="py-3.5 px-4 text-sm text-foreground">{tip.praxis_name}</td>
                        <td className="py-3.5 px-4 text-sm text-muted-foreground font-mono">{tip.plz}</td>
                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className="text-xs">{tip.geschaeftsbereich}</Badge>
                        </td>
                        <td className="py-3.5 px-4 text-sm text-muted-foreground max-w-[200px]">
                          <p className="line-clamp-2">{tip.gewuenschte_dienstleistung}</p>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.class}`}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <TimerBadge reservationUntil={tip.reservation_until ?? null} />
                        </td>
                        <td className="py-3.5 px-4 text-sm">
                          {(tip.ad_email || tip.ad_telefon) ? (
                            <div className="space-y-0.5">
                              {tip.ad_email && (
                                <a href={`mailto:${tip.ad_email}`} className="flex items-center gap-1 text-primary hover:underline text-xs">
                                  <Mail className="h-3 w-3" />{tip.ad_email}
                                </a>
                              )}
                              {tip.ad_telefon && (
                                <a href={`tel:${tip.ad_telefon}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground text-xs">
                                  <Phone className="h-3 w-3" />{tip.ad_telefon}
                                </a>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground/40">–</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(tip.created_at), "dd.MM.yy HH:mm", { locale: de })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </MainLayout>
  );
}
