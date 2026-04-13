import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Lightbulb, Clock, CheckCircle, XCircle, Mail, Phone, Timer, Search, UserCheck, X } from "lucide-react";
import { format, isPast, formatDistanceToNow } from "date-fns";
import { de } from "date-fns/locale";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

const statusConfig: Record<string, { label: string; class: string; icon: typeof Clock }> = {
  neu: { label: "Neu", class: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300", icon: Clock },
  in_bearbeitung: { label: "In Bearbeitung", class: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300", icon: Loader2 },
  abgeschlossen: { label: "Abgeschlossen", class: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300", icon: CheckCircle },
  abgelehnt: { label: "Abgelehnt", class: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300", icon: XCircle },
};

function TimerBadge({ reservationUntil }: { reservationUntil: string | null }) {
  if (!reservationUntil) return null;
  const date = new Date(reservationUntil);
  const expired = isPast(date);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${expired ? "bg-destructive/10 text-destructive" : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"}`}>
      <Timer className="h-3 w-3" />
      {expired ? "Abgelaufen" : formatDistanceToNow(date, { locale: de, addSuffix: false })}
    </span>
  );
}

export default function AdminTippLeads() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  const { data: tips = [], isLoading } = useQuery({
    queryKey: ["admin-tipp-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tipp_leads" as any)
        .select("*, profiles:created_by(full_name, email)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // All profiles for AD assignment dropdown
  const { data: salesReps = [] } = useQuery({
    queryKey: ["all-profiles-for-ad"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .order("full_name");
      if (error) throw error;
      return data as { user_id: string; full_name: string; email: string | null }[];
    },
  });

  const assignAdMutation = useMutation({
    mutationFn: async ({ tippLeadId, adEmail }: { tippLeadId: string; adEmail: string | null }) => {
      setAssigningId(tippLeadId);
      const { error } = await supabase
        .from("tipp_leads" as any)
        .update({ ad_email: adEmail })
        .eq("id", tippLeadId);
      if (error) throw error;
    },
    onSuccess: (_, { adEmail }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tipp-leads"] });
      toast({
        title: adEmail ? "AD zugewiesen" : "Zuweisung entfernt",
        description: adEmail ? `${adEmail} als Ansprechpartner gesetzt.` : "AD-Zuweisung wurde entfernt.",
      });
    },
    onError: (e: Error) => toast({ title: "Fehler", description: e.message, variant: "destructive" }),
    onSettled: () => setAssigningId(null),
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ tippLeadId, newStatus }: { tippLeadId: string; newStatus: string }) => {
      setUpdatingId(tippLeadId);
      const { error } = await supabase.functions.invoke("notify-tipp-status", {
        body: { tippLeadId, newStatus },
      });
      if (error) throw error;
    },
    onSuccess: (_, { newStatus }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-tipp-leads"] });
      const label = statusConfig[newStatus]?.label ?? newStatus;
      toast({ title: "Status aktualisiert", description: `Tippgeber wurde per E-Mail über den neuen Status "${label}" informiert.` });
    },
    onError: (e: Error) => {
      toast({ title: "Fehler", description: e.message, variant: "destructive" });
    },
    onSettled: () => setUpdatingId(null),
  });

  const filtered = tips.filter((tip: any) => {
    const matchesSearch =
      !search ||
      tip.arzt_name?.toLowerCase().includes(search.toLowerCase()) ||
      tip.praxis_name?.toLowerCase().includes(search.toLowerCase()) ||
      tip.plz?.includes(search);
    const matchesStatus = filterStatus === "all" || tip.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const counts = {
    all: tips.length,
    neu: tips.filter((t: any) => t.status === "neu").length,
    in_bearbeitung: tips.filter((t: any) => t.status === "in_bearbeitung").length,
    abgeschlossen: tips.filter((t: any) => t.status === "abgeschlossen").length,
    abgelehnt: tips.filter((t: any) => t.status === "abgelehnt").length,
  };

  return (
    <MainLayout title="Tipp-Leads" subtitle="Übersicht aller eingereichten Lead-Tipps">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Lightbulb className="h-6 w-6 text-primary" />
              Tipp-Leads
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Statusverwaltung für alle eingereichten Tippgeber-Empfehlungen. Bei Statusänderung wird der Tippgeber automatisch benachrichtigt.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { key: "all", label: "Gesamt", color: "bg-muted text-muted-foreground" },
            { key: "neu", label: "Neu", color: "bg-blue-100 text-blue-700" },
            { key: "in_bearbeitung", label: "In Bearbeitung", color: "bg-amber-100 text-amber-700" },
            { key: "abgeschlossen", label: "Abgeschlossen", color: "bg-green-100 text-green-700" },
            { key: "abgelehnt", label: "Abgelehnt", color: "bg-red-100 text-red-700" },
          ].map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => setFilterStatus(key)}
              className={`stat-card text-left transition-all ${filterStatus === key ? "ring-2 ring-primary" : ""}`}
            >
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              <span className={`text-lg font-bold px-2 py-0.5 rounded-full ${color}`}>
                {counts[key as keyof typeof counts]}
              </span>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Arzt, Praxis oder PLZ suchen…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status filtern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Status</SelectItem>
              <SelectItem value="neu">Neu</SelectItem>
              <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
              <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
              <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="card-elevated overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Lightbulb className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">Keine Tipps gefunden</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr className="bg-accent/5">
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Tippgeber</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Arzt / Praxis</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">PLZ</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4">Bereich</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 max-w-[180px]">Dienstleistung</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 whitespace-nowrap">Reservierung</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 whitespace-nowrap">Ansprechpartner AD</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 text-center">Status</th>
                    <th className="text-xs font-semibold uppercase tracking-wider text-muted-foreground py-3 px-4 whitespace-nowrap">Eingereicht</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {filtered.map((tip: any) => {
                    const cfg = statusConfig[tip.status] ?? statusConfig.neu;
                    const Icon = cfg.icon;
                    const isUpdating = updatingId === tip.id;
                    const isAssigning = assigningId === tip.id;
                    const profile = tip.profiles as { full_name: string; email: string } | null;
                    const hasNoAd = !tip.ad_email && !tip.ad_telefon;

                    return (
                      <tr key={tip.id} className="hover:bg-muted/30 transition-colors">
                        <td className="py-3.5 px-4">
                          <p className="text-sm font-medium text-foreground">{profile?.full_name ?? "–"}</p>
                          {profile?.email && (
                            <a href={`mailto:${profile.email}`} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1">
                              <Mail className="h-3 w-3" />{profile.email}
                            </a>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="text-sm font-medium text-foreground whitespace-nowrap">{tip.arzt_name}</p>
                          <p className="text-xs text-muted-foreground">{tip.praxis_name}</p>
                        </td>
                        <td className="py-3.5 px-4 text-sm text-muted-foreground font-mono">{tip.plz}</td>
                        <td className="py-3.5 px-4">
                          <Badge variant="outline" className="text-xs">{tip.geschaeftsbereich}</Badge>
                        </td>
                        <td className="py-3.5 px-4 text-sm text-muted-foreground max-w-[180px]">
                          <p className="line-clamp-2">{tip.gewuenschte_dienstleistung}</p>
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <TimerBadge reservationUntil={tip.reservation_until ?? null} />
                        </td>

                        {/* AD Assignment Cell */}
                        <td className="py-3.5 px-4 text-sm">
                          <div className="flex flex-col gap-1.5">
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
                              <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.5 rounded">
                                <UserCheck className="h-3 w-3" />
                                Kein AD
                              </span>
                            )}

                            {/* Manual assignment popover */}
                            <Popover open={openPopoverId === tip.id} onOpenChange={(open) => setOpenPopoverId(open ? tip.id : null)}>
                              <PopoverTrigger asChild>
                                <button
                                  className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1 underline underline-offset-2"
                                  disabled={isAssigning}
                                >
                                  {isAssigning ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserCheck className="h-3 w-3" />}
                                  {hasNoAd ? "AD zuweisen" : "Ändern"}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-72 p-0" align="start">
                                <Command>
                                  <CommandInput placeholder="Mitarbeiter suchen…" className="h-9" />
                                  <CommandList>
                                    <CommandEmpty>Keine Treffer</CommandEmpty>
                                    <CommandGroup>
                                      {tip.ad_email && (
                                        <CommandItem
                                          onSelect={() => {
                                            assignAdMutation.mutate({ tippLeadId: tip.id, adEmail: null });
                                            setOpenPopoverId(null);
                                          }}
                                          className="text-destructive"
                                        >
                                          <X className="h-3.5 w-3.5 mr-2" />
                                          Zuweisung entfernen
                                        </CommandItem>
                                      )}
                                      {salesReps.map((rep) => (
                                        <CommandItem
                                          key={rep.user_id}
                                          value={`${rep.full_name} ${rep.email}`}
                                          onSelect={() => {
                                            assignAdMutation.mutate({ tippLeadId: tip.id, adEmail: rep.email });
                                            setOpenPopoverId(null);
                                          }}
                                        >
                                          <div className="flex flex-col">
                                            <span className="font-medium text-xs">{rep.full_name}</span>
                                            {rep.email && <span className="text-[11px] text-muted-foreground">{rep.email}</span>}
                                          </div>
                                          {tip.ad_email === rep.email && (
                                            <CheckCircle className="h-3.5 w-3.5 ml-auto text-primary" />
                                          )}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.class}`}>
                              <Icon className={`h-3 w-3 ${isUpdating ? "animate-spin" : ""}`} />
                              {cfg.label}
                            </span>
                            <Select
                              value={tip.status}
                              onValueChange={(v) => updateStatusMutation.mutate({ tippLeadId: tip.id, newStatus: v })}
                              disabled={isUpdating}
                            >
                              <SelectTrigger className="h-7 w-[130px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="neu">Neu</SelectItem>
                                <SelectItem value="in_bearbeitung">In Bearbeitung</SelectItem>
                                <SelectItem value="abgeschlossen">Abgeschlossen</SelectItem>
                                <SelectItem value="abgelehnt">Abgelehnt</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
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
