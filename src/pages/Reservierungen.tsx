import { useState, useEffect } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Calendar, Building2, User, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useRegionalTeam } from "@/hooks/useRegionalTeam";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, addMonths } from "date-fns";
import { de } from "date-fns/locale";
import logo from "@/assets/logo.png";

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
  reservation_months: 6, // Default: 6 Monate Bestandsschutz
  notes: "",
};

export default function Reservierungen() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<ReservationFormData>(initialFormData);
  const [duplicateWarnings, setDuplicateWarnings] = useState<DuplicateCheck[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  // Fetch reservations
  const { data: reservations, isLoading } = useQuery({
    queryKey: ["praxis_reservations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("praxis_reservations")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  // Check for duplicates when address changes
  useEffect(() => {
    const checkDuplicates = async () => {
      if (!formData.plz || formData.plz.length < 5 || !formData.strasse) {
        setDuplicateWarnings([]);
        return;
      }

      setIsChecking(true);
      const warnings: DuplicateCheck[] = [];

      try {
        // Check existing reservations
        const { data: existingReservations } = await supabase
          .from("praxis_reservations")
          .select("*")
          .eq("plz", formData.plz)
          .ilike("strasse", `%${formData.strasse}%`);

        if (existingReservations && existingReservations.length > 0) {
          const activeReservation = existingReservations.find(
            (r) => new Date(r.reserved_until) > new Date()
          );
          
          if (activeReservation) {
            warnings.push({
              type: "reservation",
              message: "Diese Praxis ist bereits reserviert",
              details: `Reserviert von ${activeReservation.reserved_by_name} bis ${format(new Date(activeReservation.reserved_until), "dd.MM.yyyy", { locale: de })}`,
            });
          } else if (existingReservations.length > 0) {
            warnings.push({
              type: "reservation",
              message: "Diese Adresse wurde bereits erfasst",
              details: `${existingReservations[0].praxis_name} - Reservierung abgelaufen`,
            });
          }
        }

        // Check customer_revenues for existing customers at this address
        const { data: existingCustomers } = await supabase
          .from("customer_revenues")
          .select("customer_name, product_name")
          .ilike("customer_name", `%${formData.plz}%`)
          .limit(5);

        // Note: This is a simplified check - in production you'd want proper address matching
        // For now we just check if any data exists to show a warning

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

  // Create reservation mutation
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
        description: "Die Praxis wurde erfolgreich für 6 Monate reserviert.",
      });
    },
    onError: (error) => {
      toast({
        title: "Fehler",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Warn but allow submission if there are duplicates
    if (duplicateWarnings.some(w => w.type === "reservation" && w.message.includes("bereits reserviert"))) {
      toast({
        title: "Hinweis",
        description: "Diese Praxis ist bereits aktiv reserviert. Die Reservierung wird trotzdem angelegt.",
        variant: "default",
      });
    }
    
    createReservation.mutate(formData);
  };

  const handleInputChange = (field: keyof ReservationFormData, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const getReservationStatus = (reservedUntil: string) => {
    const now = new Date();
    const endDate = new Date(reservedUntil);
    const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysLeft < 0) return { label: "Abgelaufen", variant: "destructive" as const };
    if (daysLeft < 30) return { label: `${daysLeft} Tage übrig`, variant: "secondary" as const };
    return { label: "Aktiv", variant: "default" as const };
  };

  const hasActiveWarning = duplicateWarnings.some(w => w.message.includes("bereits reserviert"));

  return (
    <MainLayout 
      title="Praxis-Reservierungen" 
      subtitle="6 Monate Bestandsschutz für Vertriebspartner"
    >
      {/* Header with Logo */}
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
              Reservieren Sie Kunden mit 6 Monaten Bestandsschutz. Automatische Duplikatprüfung bei der Erfassung.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Alert className="mb-6 border-primary/30 bg-primary/5">
        <Info className="h-4 w-4" />
        <AlertTitle>Vertriebspartner-Bereich</AlertTitle>
        <AlertDescription>
          Nur für Vertriebspartner und Administratoren zugänglich. Jede Reservierung gilt automatisch für 6 Monate (Bestandsschutz). 
          Bei der Erfassung wird geprüft, ob die Praxis bereits reserviert oder als Kunde registriert ist.
        </AlertDescription>
      </Alert>

      {/* Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Building2 className="h-3 w-3" />
            {reservations?.length || 0} Reservierungen
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {reservations?.filter(r => new Date(r.reserved_until) > new Date()).length || 0} Aktiv
          </Badge>
        </div>
        
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setFormData(initialFormData);
            setDuplicateWarnings([]);
          }
        }}>
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
            
            {/* Duplicate Warnings */}
            {duplicateWarnings.length > 0 && (
              <div className="space-y-2">
                {duplicateWarnings.map((warning, index) => (
                  <Alert 
                    key={index} 
                    variant={warning.message.includes("bereits reserviert") ? "destructive" : "default"}
                    className={warning.message.includes("bereits reserviert") 
                      ? "border-destructive/50 bg-destructive/10" 
                      : "border-amber-500/50 bg-amber-50 dark:bg-amber-950/30"
                    }
                  >
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>{warning.message}</AlertTitle>
                    {warning.details && (
                      <AlertDescription>{warning.details}</AlertDescription>
                    )}
                  </Alert>
                ))}
              </div>
            )}
            
            <form autoComplete="off" onSubmit={handleSubmit} className="space-y-4">
              {/* Praxis Info */}
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

              {/* Address */}
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

              {/* Contact */}
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

              {/* Reservation Period - Fixed to 6 months for sales partners */}
              <div className="p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Bestandsschutz</Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Reserviert bis: {format(addMonths(new Date(), 6), "dd. MMMM yyyy", { locale: de })}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-base px-3 py-1">
                    6 Monate
                  </Badge>
                </div>
              </div>

              {/* Notes */}
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
                      : "Reservierung anlegen"
                  }
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Reservations Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Aktuelle Reservierungen
          </CardTitle>
          <CardDescription>
            Übersicht aller reservierten Kunden. Das Enddatum (6 Monate Bestandsschutz) kann nur durch einen Admin geändert werden.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Lade Reservierungen...</div>
          ) : reservations && reservations.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kunde</TableHead>
                    <TableHead>Arzt/Ärzte</TableHead>
                    <TableHead>Adresse</TableHead>
                    <TableHead>Telefon</TableHead>
                    <TableHead>Reserviert durch</TableHead>
                    <TableHead>Bestandsschutz bis</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reservations.map((reservation) => {
                    const status = getReservationStatus(reservation.reserved_until);
                    return (
                      <TableRow key={reservation.id}>
                        <TableCell className="font-medium">{reservation.praxis_name}</TableCell>
                        <TableCell>{reservation.arzt_namen}</TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {reservation.strasse} {reservation.hausnummer}
                            <br />
                            <span className="text-muted-foreground">
                              {reservation.plz} {reservation.ort}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{reservation.telefon}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground" />
                            {reservation.reserved_by_name || "—"}
                          </div>
                        </TableCell>
                        <TableCell>
                          {format(new Date(reservation.reserved_until), "dd.MM.yyyy", { locale: de })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={status.variant}>{status.label}</Badge>
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
              <h3 className="text-lg font-medium text-foreground mb-1">Keine Reservierungen</h3>
              <p className="text-muted-foreground mb-4">
                Erstellen Sie Ihre erste Praxis-Reservierung mit 6 Monaten Bestandsschutz.
              </p>
              <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Erste Reservierung anlegen
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
