/**
 * Vermittler / Tippgeber im KundenDialog (Stammdaten).
 * Anzeige für alle; Bearbeitung nur Admin/Vertriebsleitung über RPC set_lead_referrer.
 * Nach Vertragsanlage schreibgeschützt (die RPC erzwingt das zusätzlich serverseitig).
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useUserRole } from "@/hooks/useUserRole";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none__";

interface Props {
  leadId: string;
  hfxNumber: string | null;
  vermittlerId: string | null;
  tippgeberId: string | null;
  hasContract: boolean;
}

type Person = { user_id: string; full_name: string };

async function activeByRole(role: "sales_partner" | "tippgeber"): Promise<Person[]> {
  const { data: roles, error } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("role", role)
    .eq("is_active", true);
  if (error) throw error;
  const ids = (roles ?? []).map((r) => r.user_id);
  if (!ids.length) return [];
  const { data: profiles } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
  return ((profiles ?? []) as Person[]).sort((a, b) => a.full_name.localeCompare(b.full_name, "de"));
}

export function LeadReferrerSection({ leadId, hfxNumber, vermittlerId, tippgeberId, hasContract }: Props) {
  const qc = useQueryClient();
  const { isAdmin, isSalesLead } = useUserRole();
  const canEdit = (isAdmin || isSalesLead) && !hasContract;
  const [vermittler, setVermittler] = useState(vermittlerId ?? NONE);
  const [tippgeber, setTippgeber] = useState(tippgeberId ?? NONE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setVermittler(vermittlerId ?? NONE);
    setTippgeber(tippgeberId ?? NONE);
  }, [vermittlerId, tippgeberId]);

  const { data: names = {} } = useQuery({
    queryKey: ["lead-referrer-names", vermittlerId, tippgeberId],
    queryFn: async () => {
      const ids = [vermittlerId, tippgeberId].filter(Boolean) as string[];
      if (!ids.length) return {};
      const { data } = await supabase.from("profiles").select("user_id, full_name").in("user_id", ids);
      return Object.fromEntries((data ?? []).map((p) => [p.user_id, p.full_name])) as Record<string, string>;
    },
  });
  const { data: partners = [] } = useQuery({ queryKey: ["referrer-options", "sales_partner"], queryFn: () => activeByRole("sales_partner"), enabled: canEdit });
  const { data: tippgeberList = [] } = useQuery({ queryKey: ["referrer-options", "tippgeber"], queryFn: () => activeByRole("tippgeber"), enabled: canEdit });

  const dirty = vermittler !== (vermittlerId ?? NONE) || tippgeber !== (tippgeberId ?? NONE);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.rpc("set_lead_referrer", {
      p_lead_id: leadId,
      p_vermittler_id: vermittler === NONE ? null : vermittler,
      p_tippgeber_id: tippgeber === NONE ? null : tippgeber,
    });
    setSaving(false);
    if (error) {
      toast({ title: "Zuordnung nicht gespeichert", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Zuordnung gespeichert" });
    qc.invalidateQueries({ queryKey: ["kunden-dialog-lead", hfxNumber] });
    qc.invalidateQueries({ queryKey: ["kunden-dialog-events"] });
  };

  const show = (id: string | null) => (id ? names[id] ?? "—" : "keiner");

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 space-y-2">
      {!canEdit ? (
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-muted-foreground">Vermittler</div>
            <div className="font-medium truncate">{show(vermittlerId)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Tippgeber</div>
            <div className="font-medium truncate">{show(tippgeberId)}</div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Vermittler</div>
            <Select value={vermittler} onValueChange={setVermittler}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Kein Vermittler</SelectItem>
                {partners.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Tippgeber</div>
            <Select value={tippgeber} onValueChange={setTippgeber}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Kein Tippgeber</SelectItem>
                {tippgeberList.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
      {hasContract && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Zuordnung nach Vertragsanlage nicht mehr änderbar
        </div>
      )}
      {canEdit && (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" disabled={!dirty || saving} onClick={save}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Speichere…" : "Zuordnung speichern"}
          </Button>
        </div>
      )}
    </div>
  );
}
