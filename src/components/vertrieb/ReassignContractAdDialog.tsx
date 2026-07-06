/**
 * ReassignContractAdDialog — Vertrag: zuständigen AD (sales_partner_id + _name) umbuchen.
 *
 * Sichtbarkeit UI-seitig: admin | sales_lead (RLS/Guard-Trigger + RPC decken es serverseitig).
 * Rollenfilter für Combobox (divergentes Set — Verträge, NICHT identisch zu Lead/Reservierung):
 *   sales_partner, user, sales_lead, regional_lead — nur aktive, keine Tippgeber/Admins.
 *
 * Schreibpfad: SECURITY DEFINER-RPC `reassign_contract_ad(p_contract_id, p_new_ad, p_reason)`.
 * Audit (audit_logs) macht die RPC authoritativ. Client loggt zusätzlich ein
 * fire-and-forget CONTRACT_SALES_PARTNER_CHANGED in customer_events für die Timeline.
 */
import { useEffect, useState } from "react";
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
import { logCustomerEvent } from "@/lib/customerEvents";
import { useAuth } from "@/hooks/useAuth";

type AdRole = "sales_partner" | "user" | "sales_lead" | "regional_lead";

type AdOption = {
  user_id: string;
  full_name: string;
  email: string | null;
  role: AdRole;
};

const roleLabel: Record<AdRole, string> = {
  sales_partner: "Vertriebspartner",
  user: "Gebietsleiter",
  sales_lead: "Vertriebsleitung",
  regional_lead: "Gebietsleitung",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  contractId: string;
  currentAdId: string | null;
  currentAdName: string | null;
  hfxCustomerNumber?: string | null;
  onChanged?: (next: { sales_partner_id: string; sales_partner_name: string }) => void;
}

export function ReassignContractAdDialog({
  open,
  onOpenChange,
  contractId,
  currentAdId,
  currentAdName,
  hfxCustomerNumber,
  onChanged,
}: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string | null>(currentAdId);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(currentAdId);
      setReason("");
    }
  }, [open, currentAdId]);

  const { data: ads = [], isLoading } = useQuery({
    queryKey: ["assignable-ads-for-contract-reassign"],
    queryFn: async (): Promise<AdOption[]> => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, role, is_active")
        .in("role", ["sales_partner", "user", "sales_lead", "regional_lead"])
        .eq("is_active", true);
      if (error) throw error;
      if (!roles?.length) return [];
      const roleMap = new Map<string, AdRole>();
      for (const r of roles) roleMap.set(r.user_id, r.role as AdRole);
      const ids = Array.from(roleMap.keys());
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", ids);
      return (profiles || [])
        .map((p) => {
          const role = roleMap.get(p.user_id);
          if (!role) return null;
          return {
            user_id: p.user_id,
            full_name: p.full_name || p.email || "Unbenannt",
            email: p.email,
            role,
          } as AdOption;
        })
        .filter((o): o is AdOption => !!o)
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "de"));
    },
    enabled: open,
  });

  const newName = ads.find((a) => a.user_id === selected)?.full_name ?? null;

  const canSubmit = !saving && !!selected && selected !== currentAdId;

  const handleSubmit = async () => {
    if (!selected || selected === currentAdId) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("reassign_contract_ad", {
        p_contract_id: contractId,
        p_new_ad: selected,
        p_reason: reason.trim() || null,
      });
      if (error) throw error;

      // Timeline event — fire-and-forget
      logCustomerEvent({
        eventType: "CONTRACT_SALES_PARTNER_CHANGED",
        entityType: "contract",
        entityId: contractId,
        hfxCustomerNumber: hfxCustomerNumber ?? null,
        contractId,
        createdBy: user?.id ?? null,
        eventData: {
          old_ad: currentAdId,
          old_ad_name: currentAdName,
          new_ad: selected,
          new_ad_name: newName,
          reason: reason.trim() || null,
          source: "reassign_contract_ad_dialog",
        },
      });

      toast.success("Zuständigen AD geändert", {
        description: newName ? `Neuer AD: ${newName}` : undefined,
      });

      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      queryClient.invalidateQueries({ queryKey: ["kundenDialogData"] });
      queryClient.invalidateQueries({ queryKey: ["kunden-dialog-events"] });

      onChanged?.({
        sales_partner_id: selected,
        sales_partner_name: newName ?? "",
      });
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
            Wählt den neuen zuständigen Außendienstler für diesen Vertrag.
            Die Umbuchung wird protokolliert.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="text-sm">
            <span className="text-muted-foreground">Aktuell zuständig: </span>
            <span className="font-medium">
              {currentAdName || (currentAdId ? "—" : "nicht zugewiesen")}
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
            <Label htmlFor="reassign-contract-reason">Grund (optional)</Label>
            <Textarea
              id="reassign-contract-reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="z. B. Gebietswechsel, Vertretung, Übergabe…"
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
