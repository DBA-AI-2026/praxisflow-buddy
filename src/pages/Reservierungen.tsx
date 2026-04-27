import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Calendar,
  Building2,
  AlertTriangle,
  CheckCircle2,
  Info,
  Link as LinkIcon,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useRegionalTeam } from "@/hooks/useRegionalTeam";
import { supabase } from "@/lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";
import logo from "@/assets/logo.png";

import {
  ReservationFiltersBar,
  DEFAULT_FILTERS,
  type ReservationFilters,
} from "@/components/reservierungen/ReservationFiltersBar";
import { ReservationStatusBadge } from "@/components/reservierungen/ReservationStatusBadge";
import { ReservationDetailDialog } from "@/components/reservierungen/ReservationDetailDialog";
import { ReservationEditDialog } from "@/components/reservierungen/ReservationEditDialog";
import { ReservationExtendDialog } from "@/components/reservierungen/ReservationExtendDialog";
import { ReservationConvertToLeadDialog } from "@/components/reservierungen/ReservationConvertToLeadDialog";
import {
  ReservationActions,
  type ReservationPermissions,
} from "@/components/reservierungen/ReservationActions";
import {
  getDaysLeft,
  getEffectiveStatus,
  type Reservation,
  type ReservationStatus,
} from "@/components/reservierungen/types";
import {
  ProductInterestPicker,
  ProductInterestBadges,
} from "@/components/products/ProductInterestPicker";

interface ReservationFormData {
  praxis_name: string;
  arzt_namen: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  telefon: string;
  reservation_months: number;
  notes: string;
  interested_products: string[];
}

interface DuplicateCheck {
  type: "reservation" | "praxis" | "license";
  message: string;
  details?: string;
}

const initialFormData: ReservationFormData = {
  praxis_name: "",
  arzt_namen: "",
  strasse: "",
  hausnummer: "",
  plz: "",
  ort: "",
  telefon: "",
  reservation_months: 6,
  notes: "",
  interested_products: [],
};

function computePermissions(opts: {
  reservation: Reservation;
  userId: string | null;
  isAdmin: boolean;
  isSalesLead: boolean;
  isRegionalLead: boolean;
}): ReservationPermissions {
  const { reservation, userId, isAdmin, isSalesLead, isRegionalLead } = opts;
  const isCreator = !!userId && reservation.reserved_by === userId;
  const isAssignedAd = !!userId && reservation.assigned_ad_id === userId;
  const isConverted = (reservation.status ?? "") === "konvertiert";

  const elevated = isAdmin || isSalesLead;
  const ownerLikeNonConverted = (isCreator || isAssignedAd) && !isConverted;
  // Regional lead permissions are validated server-side via RLS; the UI mirrors it loosely.
  const regionalLeadCanEdit = isRegionalLead && !isConverted;

  return {
    canView: true,
    canEdit: elevated || ownerLikeNonConverted || regionalLeadCanEdit,
    canExtend: isAdmin, // DB-Trigger erlaubt reserved_until-Änderungen nur Admins
    canRelease: elevated || ownerLikeNonConverted || regionalLeadCanEdit,
    canMarkInProgress: elevated || ownerLikeNonConverted || regionalLeadCanEdit,
    canMarkExpired: elevated || ownerLikeNonConverted || regionalLeadCanEdit,
    canDelete: isAdmin,
    // Konvertierung sichtbar für Admin/Sales Lead/Regional Lead/Ersteller/AD.
    // Bereits konvertierte Datensätze zeigen stattdessen die Verknüpfung an.
    canConvertToLead: elevated || isCreator || isAssignedAd || isRegionalLead,
  };
}

type DashboardFilter =
  | "active"
  | "expiring"
  | "expired"
  | "without_ad"
  | "without_product"
  | "converted_recently";

const DASHBOARD_FILTER_LABELS: Record<DashboardFilter, string> = {
  active: "Aktiv",
  expiring: "Läuft in 14 Tagen ab",
  expired: "Abgelaufen",
  without_ad: "Ohne AD",
  without_product: "Ohne Produktinteresse",
  converted_recently: "Konvertiert in den letzten 30 Tagen",
};

const DASHBOARD_FILTER_VALUES = new Set<DashboardFilter>([
  "active",
  "expiring",
  "expired",
  "without_ad",
  "without_product",
  "converted_recently",
]);

export default function Reservierungen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilterRaw = searchParams.get("filter");
  const dashboardFilter: DashboardFilter | null =
    urlFilterRaw && DASHBOARD_FILTER_VALUES.has(urlFilterRaw as DashboardFilter)
      ? (urlFilterRaw as DashboardFilter)
      : null;

  const clearDashboardFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("filter");
    setSearchParams(next, { replace: true });
  };

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<ReservationFormData>(initialFormData);
  const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateCheck[]>([]);
  const [isChecking, setIsChecking] = useState(false);

  const [filters, setFilters] = useState<ReservationFilters>(DEFAULT_FILTERS);

  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);
  const [activeReservation, setActiveReservation] = useState<Reservation | null>(null);

  const { toast } = useToast();
  const { user, profile } = useAuth();
  const { isAdmin, isSalesLead, isRegionalLead } = useUserRole();
  const { teamFilter, setTeamFilter, matchesTeamFilter, teamFilterOptions } = useRegionalTeam();
  const queryClient = useQueryClient();

  const { data: reservations, isLoading } = useQuery({
    queryKey: ["praxis_reservations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("praxis_reservations")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Reservation[];
    },
  });

  // Duplicate check (unchanged from previous version)
  useEffect(() => {
    const checkDuplicates = async () => {
      if (!formData.plz || formData.plz.length < 5 || !formData.strasse) {
        setDuplicateWarnings([]);
        return;
      }
      setIsChecking(true);
      const warnings: DuplicateCheck[] = [];
      try {
        const { data: existingReservations } = await supabase
          .from("praxis_reservations")
          .select("*")
          .eq("plz", formData.plz)
          .ilike("strasse", `%${formData.strasse}%`);

        if (existingReservations && existingReservations.length > 0) {
          const activeR = existingReservations.find(
            (r) => new Date(r.reserved_until) > new Date(),
          );
          if (activeR) {
            warnings.push({
              type: "reservation",
              message: "Diese Praxis ist bereits reserviert",
              details: `Reserviert von ${activeR.reserved_by_name} bis ${format(
                new Date(activeR.reserved_until),
                "dd.MM.yyyy",
                { locale: de },
              )}`,
            });
          } else if (existingReservations.length > 0) {
            warnings.push({
              type: "reservation",
              message: "Diese Adresse wurde bereits erfasst",
              details: `${existingReservations[0].praxis_name} - Reservierung abgelaufen`,
            });
          }
        }
      } catch (error) {
        console.error("Error checking duplicates:", error);
      } finally {
        setIsChecking(false);
      }
      setDuplicateWarnings(warnings);
    };

    const debounce = setTimeout(checkDuplicates, 500);
    return () => clearTimeout(debounce);
  }, [formData.plz, formData.strasse, formData.hausnummer]);

  const createReservation = useMutation({
    mutationFn: async (data: ReservationFormData) => {
      const reservedUntil = addMonths(new Date(), data.reservation_months);
      const { error } = await supabase.from("praxis_reservations").insert({
        praxis_name: data.praxis_name,
        arzt_namen: data.arzt_namen,
        strasse: data.strasse,
        hausnummer: data.hausnummer,
        plz: data.plz,
        ort: data.ort,
        telefon: data.telefon,
        reservation_months: data.reservation_months,
        reserved_until: reservedUntil.toISOString(),
        reserved_by: user?.id,
        reserved_by_name: profile?.full_name || user?.email || "Unbekannt",
        notes: data.notes || null,
        interested_products: data.interested_products ?? [],
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["praxis_reservations"] });
      setFormData(initialFormData);
      setDuplicateWarnings([]);
      setIsDialogOpen(false);
      toast({
        title: "Reservierung erstellt",
        description: "Die Praxis wurde erfolgreich reserviert.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: (error as Error).message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      duplicateWarnings.some(
        (w) => w.type === "reservation" && w.message.includes("bereits reserviert"),
      )
    ) {
      toast({
        title: "Hinweis",
        description: "Diese Praxis ist bereits aktiv reserviert. Die Reservierung wird trotzdem angelegt.",
      });
    }
    createReservation.mutate(formData);
  };

  const handleInputChange = <K extends keyof ReservationFormData>(field: K, value: ReservationFormData[K]) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ----- Filter options derived from the loaded data
  const { adOptions, creatorOptions } = useMemo(() => {
    const adMap = new Map<string, string>();
    const creatorMap = new Map<string, string>();
    for (const r of reservations ?? []) {
      if (r.assigned_ad_id && r.assigned_ad_name) {
        adMap.set(r.assigned_ad_id, r.assigned_ad_name);
      }
      if (r.reserved_by && r.reserved_by_name) {
        creatorMap.set(r.reserved_by, r.reserved_by_name);
      }
    }
    return {
      adOptions: [...adMap.entries()].map(([id, name]) => ({ id, name })),
      creatorOptions: [...creatorMap.entries()].map(([id, name]) => ({ id, name })),
    };
  }, [reservations]);

  // ----- Filtering
  const filtered = useMemo(() => {
    if (!reservations) return [];
    const now = Date.now();
    return reservations.filter((r) => {
      if (isRegionalLead && !matchesTeamFilter(r.reserved_by ?? r.assigned_ad_id ?? null)) {
        return false;
      }
      if (filters.onlyMine && r.reserved_by !== user?.id) return false;
      if (filters.onlyAssignedToMe && r.assigned_ad_id !== user?.id) return false;
      if (filters.status !== "all" && getEffectiveStatus(r) !== (filters.status as ReservationStatus)) {
        return false;
      }
      if (filters.assignedAd !== "all") {
        if (filters.assignedAd === "__none__") {
          if (r.assigned_ad_id) return false;
        } else if (r.assigned_ad_id !== filters.assignedAd) {
          return false;
        }
      }
      if (filters.creator !== "all" && r.reserved_by !== filters.creator) return false;
      if (filters.plz && !(r.plz ?? "").startsWith(filters.plz)) return false;
      if (filters.ort && !(r.ort ?? "").toLowerCase().includes(filters.ort.toLowerCase())) {
        return false;
      }
      if (filters.activity === "active" && new Date(r.reserved_until).getTime() < now) return false;
      if (filters.activity === "expired" && new Date(r.reserved_until).getTime() >= now) return false;
      if (filters.product !== "all") {
        const ips = r.interested_products ?? [];
        if (filters.product === "__none__") {
          if (ips.length > 0) return false;
        } else if (!ips.includes(filters.product)) {
          return false;
        }
      }
      if (filters.search) {
        const q = filters.search.toLowerCase();
        const hay = `${r.praxis_name} ${r.arzt_namen} ${r.telefon} ${r.ort}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [reservations, filters, isRegionalLead, matchesTeamFilter, user?.id]);

  const counts = useMemo(() => {
    const total = reservations?.length ?? 0;
    const active =
      reservations?.filter((r) => new Date(r.reserved_until) > new Date()).length ?? 0;
    return { total, active };
  }, [reservations]);

  const hasActiveWarning = duplicateWarnings.some((w) => w.message.includes("bereits reserviert"));

  return (
    <MainLayout title="Praxis-Reservierungen" subtitle="6 Monate Bestandsschutz für Vertriebspartner">
      <Card className="mb-6 bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
        <CardContent className="flex items-center gap-4 py-4">
          <img
            src={logo}
            alt="Honorarfuchs"
            className="h-16 w-16 rounded-full object-cover border-2 border-primary/20"
          />
          <div>
            <h2 className="text-xl font-semibold text-foreground">Abrechnungsservices</h2>
            <p className="text-sm text-muted-foreground">
              Reservieren Sie Praxen mit Bestandsschutz. Automatische Duplikatprüfung bei der Erfassung.
            </p>
          </div>
        </CardContent>
      </Card>

      <Alert className="mb-6 border-primary/30 bg-primary/5">
        <Info className="h-4 w-4" />
        <AlertTitle>Sichtbarkeit & Bearbeitung</AlertTitle>
        <AlertDescription>
          Reservierungen sind nur für Ersteller, zuständige AD, Admins, Sales Leads und Regional Leads
          (Team) sichtbar. Das Enddatum (Bestandsschutz) kann nur von Admins geändert werden.
        </AlertDescription>
      </Alert>

      {/* Stats + Team filter + Create */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="gap-1">
            <Building2 className="h-3 w-3" />
            {counts.total} Reservierungen
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {counts.active} Aktiv
          </Badge>
          {isRegionalLead && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-52 h-8 text-xs">
                <SelectValue placeholder="Team filtern" />
              </SelectTrigger>
              <SelectContent>
                {teamFilterOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <Dialog
          open={isDialogOpen}
          onOpenChange={(open) => {
            setIsDialogOpen(open);
            if (!open) {
              setFormData(initialFormData);
              setDuplicateWarnings([]);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Neue Reservierung
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Praxis reservieren
              </DialogTitle>
              <DialogDescription>
                Erfassen Sie die Kontaktdaten der Praxis. Automatischer Bestandsschutz für 6 Monate.
              </DialogDescription>
            </DialogHeader>

            {duplicateWarnings.length > 0 && (
              <div className="space-y-2">
                {duplicateWarnings.map((warning, index) => (
                  <Alert
                    key={index}
                    variant={warning.message.includes("bereits reserviert") ? "destructive" : "default"}
                    className={
                      warning.message.includes("bereits reserviert")
                        ? "border-destructive/50 bg-destructive/10"
                        : "border-amber-500/50 bg-amber-50 dark:bg-amber-950/30"
                    }
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{warning.message}</AlertTitle>
                    {warning.details && <AlertDescription>{warning.details}</AlertDescription>}
                  </Alert>
                ))}
              </div>
            )}

            <form autoComplete="off" onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="praxis_name">Praxisname *</Label>
                  <Input
                    id="praxis_name"
                    value={formData.praxis_name}
                    onChange={(e) => handleInputChange("praxis_name", e.target.value)}
                    placeholder="z.B. Hausarztpraxis Dr. Müller"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="arzt_namen">Name des Arztes / der Ärzte *</Label>
                  <Input
                    id="arzt_namen"
                    value={formData.arzt_namen}
                    onChange={(e) => handleInputChange("arzt_namen", e.target.value)}
                    placeholder="z.B. Dr. med. Hans Müller, Dr. med. Anna Schmidt"
                    required
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <Label htmlFor="strasse">Straße *</Label>
                    <Input
                      id="strasse"
                      value={formData.strasse}
                      onChange={(e) => handleInputChange("strasse", e.target.value)}
                      placeholder="Musterstraße"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="hausnummer">Haus-Nr. *</Label>
                    <Input
                      id="hausnummer"
                      value={formData.hausnummer}
                      onChange={(e) => handleInputChange("hausnummer", e.target.value)}
                      placeholder="123"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor="plz">PLZ *</Label>
                    <Input
                      id="plz"
                      value={formData.plz}
                      onChange={(e) => handleInputChange("plz", e.target.value)}
                      placeholder="12345"
                      maxLength={5}
                      required
                      className={isChecking ? "animate-pulse" : ""}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="ort">Ort *</Label>
                    <Input
                      id="ort"
                      value={formData.ort}
                      onChange={(e) => handleInputChange("ort", e.target.value)}
                      placeholder="Musterstadt"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="telefon">Telefon der Zentrale *</Label>
                <Input
                  id="telefon"
                  type="tel"
                  value={formData.telefon}
                  onChange={(e) => handleInputChange("telefon", e.target.value)}
                  placeholder="030 / 123 456 78"
                  required
                />
              </div>

              <ProductInterestPicker
                value={formData.interested_products}
                onChange={(next) => handleInputChange("interested_products", next)}
                hint="Optional. Wird bei Konvertierung zum Interessenten übernommen."
              />

              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Bestandsschutz</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Reserviert bis:{" "}
                      {format(addMonths(new Date(), 6), "dd. MMMM yyyy", { locale: de })}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-base px-3 py-1">
                    6 Monate
                  </Badge>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notizen (optional)</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => handleInputChange("notes", e.target.value)}
                  placeholder="Zusätzliche Informationen zur Praxis..."
                  rows={3}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Abbrechen
                </Button>
                <Button
                  type="submit"
                  disabled={createReservation.isPending}
                  variant={hasActiveWarning ? "destructive" : "default"}
                >
                  {createReservation.isPending
                    ? "Wird gespeichert..."
                    : hasActiveWarning
                      ? "Trotzdem reservieren"
                      : "Reservierung anlegen"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <ReservationFiltersBar
          filters={filters}
          onChange={setFilters}
          ads={adOptions}
          creators={creatorOptions}
        />
      </div>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Aktuelle Reservierungen
          </CardTitle>
          <CardDescription>
            {filtered.length} von {counts.total} Reservierungen sichtbar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Lade Reservierungen...</div>
          ) : filtered.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[180px]">Praxis</TableHead>
                    <TableHead>PLZ / Ort</TableHead>
                    <TableHead>Ansprechpartner</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead className="min-w-[140px]">Interesse an</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Ersteller</TableHead>
                    <TableHead>Zust. AD</TableHead>
                    <TableHead>Reserviert bis</TableHead>
                    <TableHead className="text-center">Verknüpft</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const status = getEffectiveStatus(r);
                    const daysLeft = getDaysLeft(r.reserved_until);
                    const overdue = daysLeft < 0;
                    const linkedCount =
                      (r.lead_id ? 1 : 0) + (r.customer_id ? 1 : 0) + (r.contract_id ? 1 : 0);
                    const permissions = computePermissions({
                      reservation: r,
                      userId: user?.id ?? null,
                      isAdmin,
                      isSalesLead,
                      isRegionalLead,
                    });
                    return (
                      <TableRow
                        key={r.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => {
                          setActiveReservation(r);
                          setDetailOpen(true);
                        }}
                      >
                        <TableCell className="font-medium">{r.praxis_name}</TableCell>
                        <TableCell className="text-sm">
                          <div>{r.plz}</div>
                          <div className="text-muted-foreground">{r.ort}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.arzt_namen || "—"}</TableCell>
                        <TableCell className="text-sm">{r.telefon || "—"}</TableCell>
                        <TableCell className="text-sm">
                          <ProductInterestBadges products={r.interested_products} />
                        </TableCell>
                        <TableCell>
                          <ReservationStatusBadge status={status} />
                        </TableCell>
                        <TableCell className="text-sm">{r.reserved_by_name || "—"}</TableCell>
                        <TableCell className="text-sm">
                          {r.assigned_ad_name || (
                            <span className="text-muted-foreground italic">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>
                            {format(new Date(r.reserved_until), "dd.MM.yyyy", { locale: de })}
                          </div>
                          <div
                            className={`text-xs ${overdue ? "text-destructive" : "text-muted-foreground"}`}
                          >
                            {overdue
                              ? `${Math.abs(daysLeft)} Tage abgelaufen`
                              : `${daysLeft} Tage übrig`}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {linkedCount > 0 ? (
                            <Badge variant="outline" className="gap-1">
                              <LinkIcon className="h-3 w-3" />
                              {linkedCount}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <ReservationActions
                            reservation={r}
                            permissions={permissions}
                            onView={(res) => {
                              setActiveReservation(res);
                              setDetailOpen(true);
                            }}
                            onEdit={(res) => {
                              setActiveReservation(res);
                              setEditOpen(true);
                            }}
                            onExtend={(res) => {
                              setActiveReservation(res);
                              setExtendOpen(true);
                            }}
                            onConvertToLead={(res) => {
                              setActiveReservation(res);
                              setConvertOpen(true);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-1">
                {counts.total === 0 ? "Keine Reservierungen" : "Keine Treffer für Ihre Filter"}
              </h3>
              <p className="text-muted-foreground mb-4">
                {counts.total === 0
                  ? "Erstellen Sie Ihre erste Praxis-Reservierung."
                  : "Passen Sie die Filter an oder setzen Sie sie zurück."}
              </p>
              {counts.total === 0 && (
                <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Erste Reservierung anlegen
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <ReservationDetailDialog
        reservation={activeReservation}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
      <ReservationEditDialog
        reservation={activeReservation}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <ReservationExtendDialog
        reservation={activeReservation}
        open={extendOpen}
        onOpenChange={setExtendOpen}
      />
      <ReservationConvertToLeadDialog
        reservation={activeReservation}
        open={convertOpen}
        onOpenChange={setConvertOpen}
      />
    </MainLayout>
  );
}
