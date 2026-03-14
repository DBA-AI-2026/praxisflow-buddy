import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Percent, Euro, CalendarDays, Plus, Trash2, Save, Info } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type CommissionType = "prozent" | "festbetrag" | "monatlich";

interface CommissionRow {
  id?: string;
  product_name: string;
  commission_type: CommissionType;
  commission_value: number;
  is_override: boolean; // true = individual, false = from role default
}

const commissionTypeLabels: Record<CommissionType, string> = {
  prozent: "% vom Umsatz",
  festbetrag: "€ / Abschluss",
  monatlich: "€ / Monat",
};

const commissionTypeIcons: Record<CommissionType, React.ReactNode> = {
  prozent: <Percent className="h-3.5 w-3.5" />,
  festbetrag: <Euro className="h-3.5 w-3.5" />,
  monatlich: <CalendarDays className="h-3.5 w-3.5" />,
};

function formatCommission(type: CommissionType, value: number) {
  if (type === "prozent") return `${value}%`;
  return `${value.toFixed(2)} €`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  userRole: string;
}

export function PartnerCommissionDialog({ open, onOpenChange, userId, userName, userRole }: Props) {
  const queryClient = useQueryClient();
  const [newProduct, setNewProduct] = useState("");
  const [newType, setNewType] = useState<CommissionType>("prozent");
  const [newValue, setNewValue] = useState<number>(0);

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("name").eq("is_active", true).order("name");
      return data?.map((p) => p.name) || [];
    },
  });

  // Fetch role defaults for this user's role
  const { data: roleDefaults = [] } = useQuery({
    queryKey: ["commission-role-defaults", userRole],
    queryFn: async () => {
      const { data } = await supabase
        .from("commission_role_defaults" as any)
        .select("*")
        .eq("role", userRole);
      return (data as unknown as Array<{ id: string; product_name: string; commission_type: CommissionType; commission_value: number }>) || [];
    },
    enabled: open,
  });

  // Fetch individual overrides
  const { data: overrides = [] } = useQuery({
    queryKey: ["partner-commission-overrides", userId],
    queryFn: async () => {
      const { data } = await supabase
        .from("partner_commission_overrides" as any)
        .select("*")
        .eq("user_id", userId);
      return (data || []) as Array<{ id: string; product_name: string; commission_type: CommissionType; commission_value: number }>;
    },
    enabled: open,
  });

  // Merge: overrides take precedence over role defaults
  const mergedCommissions: CommissionRow[] = [];
  const overrideProducts = new Set(overrides.map((o) => o.product_name));

  for (const rd of roleDefaults) {
    if (overrideProducts.has(rd.product_name)) continue;
    mergedCommissions.push({
      id: rd.id,
      product_name: rd.product_name,
      commission_type: rd.commission_type,
      commission_value: rd.commission_value,
      is_override: false,
    });
  }
  for (const o of overrides) {
    const roleDefault = roleDefaults.find((r) => r.product_name === o.product_name);
    mergedCommissions.push({
      id: o.id,
      product_name: o.product_name,
      commission_type: o.commission_type,
      commission_value: o.commission_value,
      is_override: true,
    });
  }
  mergedCommissions.sort((a, b) => a.product_name.localeCompare(b.product_name));

  const usedProducts = new Set(mergedCommissions.map((c) => c.product_name));
  const availableProducts = products.filter((p) => !usedProducts.has(p));

  // Add override mutation
  const addOverride = useMutation({
    mutationFn: async () => {
      if (!newProduct) throw new Error("Produkt auswählen");
      const { error } = await supabase.from("partner_commission_overrides" as any).insert({
        user_id: userId,
        product_name: newProduct,
        commission_type: newType,
        commission_value: newValue,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-commission-overrides", userId] });
      setNewProduct("");
      setNewValue(0);
      toast.success("Individuelle Provision hinzugefügt");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Delete override mutation
  const deleteOverride = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("partner_commission_overrides" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["partner-commission-overrides", userId] });
      toast.success("Überschreibung entfernt – Rollen-Standard gilt wieder");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Provisionen – {userName}</DialogTitle>
          <DialogDescription>
            Individuelle Provisionsüberschreibungen für diesen Vertriebler. Ohne Überschreibung gilt der Rollen-Standard.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mergedCommissions.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Keine Provisionen konfiguriert. Fügen Sie individuelle Sätze hinzu oder konfigurieren Sie Rollen-Standards unter Produktverwaltung.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Modell</TableHead>
                  <TableHead className="text-right">Wert</TableHead>
                  <TableHead>Quelle</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {mergedCommissions.map((c) => (
                  <TableRow key={c.product_name}>
                    <TableCell className="font-medium">{c.product_name}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5 text-sm">
                        {commissionTypeIcons[c.commission_type]}
                        {commissionTypeLabels[c.commission_type]}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCommission(c.commission_type, c.commission_value)}
                    </TableCell>
                    <TableCell>
                      {c.is_override ? (
                        <Badge variant="default" className="bg-amber-500/10 text-amber-700 border-amber-500/20 text-xs">
                          Individuell
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Rollen-Standard
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {c.is_override && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => c.id && deleteOverride.mutate(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Add new override */}
          <div className="border rounded-lg p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-1.5">
              <Plus className="h-4 w-4" />
              Individuelle Provision hinzufügen
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Select value={newProduct} onValueChange={setNewProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Produkt..." />
                </SelectTrigger>
                <SelectContent>
                  {availableProducts.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                  {availableProducts.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">Alle Produkte belegt</div>
                  )}
                </SelectContent>
              </Select>
              <Select value={newType} onValueChange={(v) => setNewType(v as CommissionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prozent">% vom Umsatz</SelectItem>
                  <SelectItem value="festbetrag">€ / Abschluss</SelectItem>
                  <SelectItem value="monatlich">€ / Monat</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  step={newType === "prozent" ? 0.5 : 1}
                  value={newValue}
                  onChange={(e) => setNewValue(parseFloat(e.target.value) || 0)}
                  placeholder={newType === "prozent" ? "10" : "250"}
                />
                <Button
                  size="icon"
                  onClick={() => addOverride.mutate()}
                  disabled={!newProduct || addOverride.isPending}
                >
                  <Save className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md p-3">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              <strong>Rollen-Standards</strong> gelten für alle Vertriebler derselben Rolle und werden unter <strong>Produktverwaltung</strong> konfiguriert.
              <strong> Individuelle Überschreibungen</strong> haben Vorrang und gelten nur für diesen Vertriebler.
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
