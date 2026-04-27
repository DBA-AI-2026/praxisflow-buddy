import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  MoreHorizontal,
  Eye,
  Pencil,
  CalendarPlus,
  CircleSlash,
  PlayCircle,
  AlertOctagon,
  Trash2,
  UserPlus,
  ExternalLink,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";
import { useState } from "react";
import { getEffectiveStatus, type Reservation } from "./types";

export interface ReservationPermissions {
  canView: boolean;
  canEdit: boolean;
  canExtend: boolean;
  canRelease: boolean;
  canMarkInProgress: boolean;
  canMarkExpired: boolean;
  canDelete: boolean;
  canConvertToLead: boolean;
}

interface Props {
  reservation: Reservation;
  permissions: ReservationPermissions;
  onView: (r: Reservation) => void;
  onEdit: (r: Reservation) => void;
  onExtend: (r: Reservation) => void;
  onConvertToLead: (r: Reservation) => void;
}

export function ReservationActions({
  reservation,
  permissions,
  onView,
  onEdit,
  onExtend,
  onConvertToLead,
}: Props) {
  const queryClient = useQueryClient();
  const [confirmRelease, setConfirmRelease] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const status = getEffectiveStatus(reservation);
  const isOverdue =
    new Date(reservation.reserved_until) < new Date() && status === "reserviert";

  const setStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("praxis_reservations")
        .update({ status: newStatus })
        .eq("id", reservation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["praxis_reservations"] });
    },
    onError: (error: Error) => {
      toast.error("Aktion fehlgeschlagen", { description: error.message });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("praxis_reservations")
        .delete()
        .eq("id", reservation.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["praxis_reservations"] });
      toast.success("Reservierung gelöscht");
      setConfirmDelete(false);
    },
    onError: (error: Error) => {
      toast.error("Löschen fehlgeschlagen", { description: error.message });
    },
  });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Aktionen</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {permissions.canView && (
            <DropdownMenuItem onClick={() => onView(reservation)}>
              <Eye className="mr-2 h-4 w-4" />
              Details
            </DropdownMenuItem>
          )}
          {permissions.canEdit && (
            <DropdownMenuItem onClick={() => onEdit(reservation)}>
              <Pencil className="mr-2 h-4 w-4" />
              Bearbeiten
            </DropdownMenuItem>
          )}
          {permissions.canExtend && (
            <DropdownMenuItem onClick={() => onExtend(reservation)}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Verlängern
            </DropdownMenuItem>
          )}

          {(permissions.canMarkInProgress || permissions.canMarkExpired || permissions.canRelease) && (
            <DropdownMenuSeparator />
          )}

          {permissions.canMarkInProgress && status !== "in_bearbeitung" && status !== "konvertiert" && (
            <DropdownMenuItem
              onClick={() => {
                setStatus.mutate("in_bearbeitung", {
                  onSuccess: () => toast.success("Status: In Bearbeitung"),
                });
              }}
            >
              <PlayCircle className="mr-2 h-4 w-4" />
              Status: In Bearbeitung
            </DropdownMenuItem>
          )}

          {permissions.canMarkExpired && isOverdue && (
            <DropdownMenuItem
              onClick={() => {
                setStatus.mutate("abgelaufen", {
                  onSuccess: () => toast.success("Status: Abgelaufen"),
                });
              }}
            >
              <AlertOctagon className="mr-2 h-4 w-4" />
              Als abgelaufen markieren
            </DropdownMenuItem>
          )}

          {permissions.canRelease && status !== "freigegeben" && status !== "konvertiert" && (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmRelease(true)}
            >
              <CircleSlash className="mr-2 h-4 w-4" />
              Freigeben
            </DropdownMenuItem>
          )}

          {permissions.canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Löschen
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmRelease} onOpenChange={setConfirmRelease}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reservierung freigeben?</AlertDialogTitle>
            <AlertDialogDescription>
              Die Praxis steht damit wieder für andere Reservierungen zur Verfügung.
              Der Status wird auf <strong>freigegeben</strong> gesetzt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setStatus.mutate("freigegeben", {
                  onSuccess: () => {
                    toast.success("Reservierung freigegeben");
                    setConfirmRelease(false);
                  },
                });
              }}
            >
              Freigeben
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reservierung löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => remove.mutate()}
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
