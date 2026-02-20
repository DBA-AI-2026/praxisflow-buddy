import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

interface RegionalAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  regionalLead: {
    user_id: string;
    full_name: string;
    email: string;
  } | null;
}

export function RegionalAssignmentDialog({
  open,
  onOpenChange,
  regionalLead,
}: RegionalAssignmentDialogProps) {
  const [search, setSearch] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all assignable users (non-admin, non-regional_lead roles)
  const { data: assignableUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["assignable-users", regionalLead?.user_id],
    enabled: open && !!regionalLead,
    queryFn: async () => {
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rolesError) throw rolesError;

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email");
      if (profilesError) throw profilesError;

      // Only show sales_partner and user roles as assignable
      const assignable = roles
        .filter((r) => r.role === "sales_partner" || r.role === "user")
        .map((r) => {
          const profile = profiles.find((p) => p.user_id === r.user_id);
          return {
            user_id: r.user_id,
            role: r.role,
            full_name: profile?.full_name || "Unbekannt",
            email: profile?.email || "-",
          };
        });

      return assignable;
    },
  });

  // Fetch current assignments for this regional lead
  const { data: currentAssignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["regional-assignments", regionalLead?.user_id],
    enabled: open && !!regionalLead,
    queryFn: async () => {
      if (!regionalLead) return [];
      const { data, error } = await supabase
        .from("user_regional_assignments")
        .select("user_id")
        .eq("regional_lead_id", regionalLead.user_id);
      if (error) throw error;
      return data.map((a) => a.user_id);
    },
  });

  // Initialize selection when data loads
  if (!initialized && !assignmentsLoading && currentAssignments.length >= 0 && open) {
    setSelectedUserIds(new Set(currentAssignments));
    setInitialized(true);
  }

  // Reset on close
  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setInitialized(false);
      setSearch("");
      setSelectedUserIds(new Set());
    }
    onOpenChange(v);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!regionalLead) return;

      const toAdd = [...selectedUserIds].filter((id) => !currentAssignments.includes(id));
      const toRemove = currentAssignments.filter((id) => !selectedUserIds.has(id));

      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("user_regional_assignments")
          .delete()
          .eq("regional_lead_id", regionalLead.user_id)
          .in("user_id", toRemove);
        if (error) throw error;
      }

      if (toAdd.length > 0) {
        const rows = toAdd.map((user_id) => ({
          user_id,
          regional_lead_id: regionalLead.user_id,
        }));
        const { error } = await supabase
          .from("user_regional_assignments")
          .insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["regional-assignments"] });
      handleOpenChange(false);
      toast({
        title: "Zuordnung gespeichert",
        description: "Die Team-Zuordnungen wurden aktualisiert.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleUser = (userId: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const filteredUsers = assignableUsers.filter(
    (u) =>
      u.full_name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const isLoading = usersLoading || assignmentsLoading;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Team zuordnen
          </DialogTitle>
          <DialogDescription>
            Wählen Sie die Benutzer aus, die diesem Regionalleiter zugeordnet werden sollen.
          </DialogDescription>
        </DialogHeader>

        {regionalLead && (
          <div className="p-3 bg-muted rounded-lg mb-2">
            <p className="font-medium text-sm">{regionalLead.full_name}</p>
            <p className="text-xs text-muted-foreground">{regionalLead.email}</p>
          </div>
        )}

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Benutzer suchen..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-1 min-h-[200px] max-h-[300px] border rounded-md p-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Keine zuweisbaren Benutzer gefunden.
            </p>
          ) : (
            filteredUsers.map((user) => (
              <label
                key={user.user_id}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
              >
                <Checkbox
                  checked={selectedUserIds.has(user.user_id)}
                  onCheckedChange={() => toggleUser(user.user_id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
              </label>
            ))
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {selectedUserIds.size} Benutzer ausgewählt
        </p>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wird gespeichert...
              </>
            ) : (
              "Speichern"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
