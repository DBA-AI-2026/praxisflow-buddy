/**
 * ReassignLeadAdDialog — Zuständigen AD auf einem Lead ändern.
 *
 * Sichtbarkeit UI-seitig: admin | sales_lead (RLS deckt es serverseitig).
 * Rollenfilter für Combobox: strikt wie CreateLeadDialog — `user` + `sales_partner`,
 * nur aktive, keine Tippgeber. Keine neue AD-Konvention.
 *
 * Nach erfolgreichem Update:
 *  - assignment_source = 'manual'
 *  - Audit-Log: LEAD_REASSIGN
 *  - Best-effort: notify-lead-assignment an den neuen AD
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Check, ChevronsUpDown, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { logAuditEvent } from "@/hooks/useAuditLog";

type AdOption = {
  user_id: string;
  full_name: string;
  email: string | null;
  role: "sales_partner" | "user";
};

const roleLabel: Record<string, string> = {
  sales_partner: "Vertriebspartner",
  user: "Gebietsleiter",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  leadId: string;
  currentAssignedTo: string | null;
  hfxNumber?: string | null;
  onChanged?: () => void;
}

export function ReassignLeadAdDialog({
  open,
  onOpenChange,
  leadId,
  currentAssignedTo,
  hfxNumber,
  onChanged,
}: Props) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string | null>(currentAssignedTo);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset local state when dialog re-opens
  useMemo(() => {
    if (open) {
      setSelected(currentAssignedTo);
      setReason("");
    }
  }, [open, currentAssignedTo]);

  // Same source query as CreateLeadDialog: user_roles(role in user|sales_partner) + active + profiles
  const { data: ads = [], isLoading } = useQuery({
    queryKey: ["assignable-ads-for-lead-reassign"],
    queryFn: async (): Promise<AdOption[]> => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role, is_active")
        .in("role", ["sales_partner", "user"])
        .eq("is_active", true);
      if (error) throw error;
      if (!roles?.length) return [];
      const roleMap: Record<string, "sales_partner" | "user"> = {};
      for (const r of roles) roleMap[r.user_id] = r.role as "sales_partner" | "user";
      const ids = roles.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids);
      return (profiles || [])
        .map((p) => ({
          user_id: p.user_id,
          full_name: p.full_name || p.email || "Unbenannt",
          email: p.email,
          role: roleMap[p.user_id],
        }))
        .filter((o) => !!o.role)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "de"));
    },
    enabled: open,
  });

  const currentName = ads.find((a) => a.user_id === currentAssignedTo)?.full_name;
  const newName = ads.find((a) => a.user_id === selected)?.full_name ?? null;

  const canSubmit =
    !saving && !!selected && selected !== currentAssignedTo;

  const handleSubmit = async () => {
    if (!selected || selected === currentAssignedTo) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("leads")
        .update({
          assigned_to: selected,
          assignment_source: "manual",
        })
        .eq("id", leadId);
      if (error) throw error;

      // Audit — best effort
      await logAuditEvent({
        action: "LEAD_REASSIGN",
        resourcePath: `/leads/${leadId}`,
        success: true,
        details: JSON.stringify({
          lead_id: leadId,
          hfx_customer_number: hfxNumber ?? null,
          old_ad: currentAssignedTo,
          new_ad: selected,
          reason: reason.trim() || null,
        }),
      });

      // Notify new AD — best effort, don't block on failure
      try {
        await supabase.functions.invoke("notify-lead-assignment", {
          body: { leadId, assignedToUserId: selected },
        });
      } catch (notifyErr) {
        console.warn("notify-lead-assignment failed:", notifyErr);
      }

      toast.success("Zuständigen AD geändert", {
        description: newName ? `Neuer AD: ${newName}` : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["journey-leads"] });
      queryClient.invalidateQueries({ queryKey: ["kundenDialogData"] });
      queryClient.invalidateQueries({ queryKey: ["kunden-dialog-lead"] });
      queryClient.invalidateQueries({ queryKey: ["kunden-dialog-events"] });

      onChanged?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Umbuchen fehlgeschlagen", {
        description: err?.message ?? "Unbekannter Fehler",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Zuständigen AD ändern</DialogTitle>
          <DialogDescription>
            Wählt den neuen zuständigen Außendienstler für diesen Interessenten.
            Die Zuweisungsquelle wird auf <em>manual</em> gesetzt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Aktuell zuständig: </span>
            <span className="font-medium">
              {currentName || (currentAssignedTo ? "—" : "nicht zugewiesen")}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label>Neuer zuständiger AD *</Label>
            <AdCombobox
              value={selected}
              onChange={setSelected}
              options={ads}
              disabled={isLoading}
              placeholder={isLoading ? "Lade…" : "AD auswählen"}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reassign-reason">Grund (optional)</Label>
            <Textarea
              id="reassign-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z. B. PLZ-Wechsel, Vertretung, Übergabe…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Umbuchen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------- Combobox -------------------------- */

function AdCombobox({
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  options: AdOption[];
  disabled?: boolean;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.user_id === value);
  const filtered = options.filter((o) => {
    const q = search.toLowerCase();
    return (
      o.full_name.toLowerCase().includes(q) ||
      (o.email?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="truncate">
              {selected.full_name}
              <span className="text-muted-foreground text-xs ml-1">
                — {roleLabel[selected.role] ?? selected.role}
              </span>
            </span>
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
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
        align="start"
      >
        <div className="p-2 border-b">
          <Input
            placeholder="Suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-2 text-center">
              Keine Ergebnisse
            </p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.user_id}
                type="button"
                className={cn(
                  "w-full flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                  value === o.user_id && "bg-accent",
                )}
                onClick={() => {
                  onChange(o.user_id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <Check
                  className={cn(
                    "h-4 w-4 shrink-0",
                    value === o.user_id ? "opacity-100" : "opacity-0",
                  )}
                />
                <div className="text-left truncate">
                  <span className="font-medium">{o.full_name}</span>
                  <span className="text-muted-foreground ml-1 text-xs">
                    — {roleLabel[o.role] ?? o.role}
                    {o.email ? ` (${o.email})` : ""}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
