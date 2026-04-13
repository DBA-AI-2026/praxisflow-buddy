import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import {
  Plus,
  Search,
  Euro,
  FileCheck,
  Clock,
  AlertCircle,
  Loader2,
  Trash2,
  Edit,
} from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { de } from "date-fns/locale";

interface Revenue {
  id: string;
  customer_name: string;
  customer_number: string | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  product_name: string;
  product_category: string | null;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  net_amount: number;
  tax_amount: number;
  gross_amount: number;
  payment_status: string;
  exported_to_lexware: boolean;
  created_at: string;
}

const emptyRevenue = {
  customer_name: "",
  customer_number: "",
  invoice_number: "",
  invoice_date: new Date().toISOString().split("T")[0],
  due_date: "",
  product_name: "",
  product_category: "Abrechnungsservice",
  quantity: 1,
  unit_price: 0,
  tax_rate: 19,
  payment_status: "pending",
};

export default function Umsaetze() {
  const { toast } = useToast();
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(emptyRevenue);

  // Calculate amounts
  const netAmount = formData.quantity * formData.unit_price;
  const taxAmount = netAmount * (formData.tax_rate / 100);
  const grossAmount = netAmount + taxAmount;

  // Fetch revenues
  const fetchRevenues = async () => {
    try {
      const { data, error } = await supabase
        .from("customer_revenues")
        .select("*")
        .order("invoice_date", { ascending: false });

      if (error) throw error;
      setRevenues((data as Revenue[]) || []);
    } catch (error) {
      console.error("Error fetching revenues:", error);
      toast({
        title: "Fehler",
        description: "Umsätze konnten nicht geladen werden.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRevenues();
  }, []);

  // Filter revenues
  const filteredRevenues = revenues.filter((rev) => {
    const matchesSearch =
      rev.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rev.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rev.product_name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || rev.payment_status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // Stats
  const totalRevenue = revenues.reduce((sum, r) => sum + Number(r.gross_amount), 0);
  const pendingRevenue = revenues
    .filter((r) => r.payment_status === "pending")
    .reduce((sum, r) => sum + Number(r.gross_amount), 0);
  const exportedCount = revenues.filter((r) => r.exported_to_lexware).length;

  const handleSubmit = async () => {
    if (!formData.customer_name || !formData.invoice_number || !formData.product_name) {
      toast({
        title: "Fehler",
        description: "Bitte füllen Sie alle Pflichtfelder aus.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nicht angemeldet");

      const revenueData = {
        user_id: user.id,
        customer_name: formData.customer_name,
        customer_number: formData.customer_number || null,
        invoice_number: formData.invoice_number,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date || null,
        product_name: formData.product_name,
        product_category: formData.product_category || null,
        quantity: formData.quantity,
        unit_price: formData.unit_price,
        tax_rate: formData.tax_rate,
        net_amount: netAmount,
        tax_amount: taxAmount,
        gross_amount: grossAmount,
        payment_status: formData.payment_status,
      };

      if (editingId) {
        const { error } = await supabase
          .from("customer_revenues")
          .update(revenueData)
          .eq("id", editingId);
        if (error) throw error;
        toast({ title: "Umsatz aktualisiert" });
      } else {
        const { error } = await supabase
          .from("customer_revenues")
          .insert(revenueData);
        if (error) throw error;
        toast({ title: "Umsatz erstellt" });
      }

      setDialogOpen(false);
      setFormData(emptyRevenue);
      setEditingId(null);
      fetchRevenues();
    } catch (error) {
      console.error("Error saving revenue:", error);
      toast({
        title: "Fehler",
        description: "Umsatz konnte nicht gespeichert werden.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (revenue: Revenue) => {
    setEditingId(revenue.id);
    setFormData({
      customer_name: revenue.customer_name,
      customer_number: revenue.customer_number || "",
      invoice_number: revenue.invoice_number,
      invoice_date: revenue.invoice_date,
      due_date: revenue.due_date || "",
      product_name: revenue.product_name,
      product_category: revenue.product_category || "Abrechnungsservice",
      quantity: revenue.quantity,
      unit_price: Number(revenue.unit_price),
      tax_rate: Number(revenue.tax_rate),
      payment_status: revenue.payment_status,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Möchten Sie diesen Umsatz wirklich löschen?")) return;

    try {
      const { error } = await supabase
        .from("customer_revenues")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Umsatz gelöscht" });
      fetchRevenues();
    } catch (error) {
      toast({
        title: "Fehler",
        description: "Umsatz konnte nicht gelöscht werden.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
        return <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Bezahlt</Badge>;
      case "pending":
        return <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">Offen</Badge>;
      case "overdue":
        return <Badge variant="destructive">Überfällig</Badge>;
      case "cancelled":
        return <Badge variant="secondary">Storniert</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd.MM.yyyy", { locale: de });
    } catch {
      return dateString;
    }
  };

  if (isLoading) {
    return (
      <MainLayout title="Umsätze" subtitle="Laden...">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout 
      title="Umsätze" 
      subtitle="Kundenumsätze verwalten und nach Lexware exportieren"
    >
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <div className="card-elevated p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-primary/10">
              <Euro className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Gesamtumsatz</p>
              <p className="text-xl font-semibold">{formatCurrency(totalRevenue)}</p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-warning/10">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Offene Beträge</p>
              <p className="text-xl font-semibold">{formatCurrency(pendingRevenue)}</p>
            </div>
          </div>
        </div>
        <div className="card-elevated p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-2 bg-green-500/10">
              <FileCheck className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Exportiert</p>
              <p className="text-xl font-semibold">{exportedCount} / {revenues.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Suche nach Kunde, Rechnungsnr., Produkt..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle Status</SelectItem>
            <SelectItem value="pending">Offen</SelectItem>
            <SelectItem value="paid">Bezahlt</SelectItem>
            <SelectItem value="overdue">Überfällig</SelectItem>
            <SelectItem value="cancelled">Storniert</SelectItem>
          </SelectContent>
        </Select>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setFormData(emptyRevenue);
            setEditingId(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Umsatz
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingId ? "Umsatz bearbeiten" : "Neuen Umsatz erfassen"}</DialogTitle>
              <DialogDescription>
                Erfassen Sie einen neuen Kundenumsatz für den Lexware-Export.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="customer_name">Kundenname *</Label>
                  <Input
                    id="customer_name"
                    value={formData.customer_name}
                    onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                    placeholder="Praxis Dr. Müller"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="customer_number">Kundennummer</Label>
                  <Input
                    id="customer_number"
                    value={formData.customer_number}
                    onChange={(e) => setFormData({ ...formData, customer_number: e.target.value })}
                    placeholder="K-001"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="invoice_number">Rechnungsnr. *</Label>
                  <Input
                    id="invoice_number"
                    value={formData.invoice_number}
                    onChange={(e) => setFormData({ ...formData, invoice_number: e.target.value })}
                    placeholder="RE-2024-001"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="invoice_date">Rechnungsdatum *</Label>
                  <Input
                    id="invoice_date"
                    type="date"
                    value={formData.invoice_date}
                    onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="due_date">Fälligkeitsdatum</Label>
                  <Input
                    id="due_date"
                    type="date"
                    value={formData.due_date}
                    onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="product_name">Produkt/Leistung *</Label>
                  <Input
                    id="product_name"
                    value={formData.product_name}
                    onChange={(e) => setFormData({ ...formData, product_name: e.target.value })}
                    placeholder="Abrechnungsservice Standard"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="product_category">Kategorie</Label>
                  <Select 
                    value={formData.product_category} 
                    onValueChange={(v) => setFormData({ ...formData, product_category: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Abrechnungsservice">Abrechnungsservice</SelectItem>
                      <SelectItem value="Modul">Modul</SelectItem>
                      <SelectItem value="Lizenz">Lizenz</SelectItem>
                      <SelectItem value="Beratung">Beratung</SelectItem>
                      <SelectItem value="Sonstiges">Sonstiges</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="quantity">Menge</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min={1}
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="unit_price">Einzelpreis (€)</Label>
                  <Input
                    id="unit_price"
                    type="number"
                    step="0.01"
                    min={0}
                    value={formData.unit_price}
                    onChange={(e) => setFormData({ ...formData, unit_price: parseFloat(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="tax_rate">MwSt. (%)</Label>
                  <Select 
                    value={formData.tax_rate.toString()} 
                    onValueChange={(v) => setFormData({ ...formData, tax_rate: parseFloat(v) })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="19">19%</SelectItem>
                      <SelectItem value="7">7%</SelectItem>
                      <SelectItem value="0">0%</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="payment_status">Status</Label>
                  <Select 
                    value={formData.payment_status} 
                    onValueChange={(v) => setFormData({ ...formData, payment_status: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Offen</SelectItem>
                      <SelectItem value="paid">Bezahlt</SelectItem>
                      <SelectItem value="overdue">Überfällig</SelectItem>
                      <SelectItem value="cancelled">Storniert</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Calculated amounts */}
              <div className="grid grid-cols-3 gap-4 p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm text-muted-foreground">Netto</p>
                  <p className="text-lg font-semibold">{formatCurrency(netAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">MwSt. ({formData.tax_rate}%)</p>
                  <p className="text-lg font-semibold">{formatCurrency(taxAmount)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Brutto</p>
                  <p className="text-lg font-semibold text-primary">{formatCurrency(grossAmount)}</p>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Abbrechen
              </Button>
              <Button onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Speichern...
                  </>
                ) : editingId ? (
                  "Aktualisieren"
                ) : (
                  "Erstellen"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Revenue Table */}
      <div className="card-elevated overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rechnungsnr.</TableHead>
              <TableHead>Kunde</TableHead>
              <TableHead>Produkt</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead className="text-right">Brutto</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Export</TableHead>
              <TableHead className="text-right">Aktionen</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRevenues.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {revenues.length === 0 ? (
                    <>
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Noch keine Umsätze erfasst</p>
                      <p className="text-sm">Erstellen Sie Ihren ersten Umsatz, um den Lexware-Export zu nutzen.</p>
                    </>
                  ) : (
                    "Keine Ergebnisse gefunden"
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filteredRevenues.map((revenue) => (
                <TableRow key={revenue.id}>
                  <TableCell className="font-medium">{revenue.invoice_number}</TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{revenue.customer_name}</p>
                      {revenue.customer_number && (
                        <p className="text-xs text-muted-foreground">{revenue.customer_number}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p>{revenue.product_name}</p>
                      {revenue.product_category && (
                        <p className="text-xs text-muted-foreground">{revenue.product_category}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{formatDate(revenue.invoice_date)}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(Number(revenue.gross_amount))}
                  </TableCell>
                  <TableCell>{getStatusBadge(revenue.payment_status)}</TableCell>
                  <TableCell>
                    {revenue.exported_to_lexware ? (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">
                        <FileCheck className="h-3 w-3 mr-1" />
                        Exportiert
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Ausstehend
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(revenue)}
                        disabled={revenue.exported_to_lexware}
                        title={revenue.exported_to_lexware ? "Bereits exportiert" : "Bearbeiten"}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(revenue.id)}
                        disabled={revenue.exported_to_lexware}
                        title={revenue.exported_to_lexware ? "Bereits exportiert" : "Löschen"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </MainLayout>
  );
}
