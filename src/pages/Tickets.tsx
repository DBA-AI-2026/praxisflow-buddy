import { useState } from "react";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, Download, Video, Clock, User } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface Ticket {
  id: string;
  praxis: string;
  typ: "support-1" | "support-2" | "demo" | "schulung";
  status: "offen" | "geplant" | "in-bearbeitung" | "geschlossen";
  prioritaet: "niedrig" | "mittel" | "hoch";
  erstellt: string;
  termin?: string;
  zustaendig: string;
  teamsLink?: string;
  beschreibung: string;
}

const initialTickets: Ticket[] = [
  {
    id: "TK-2025-001",
    praxis: "Dr. med. Hans Müller",
    typ: "support-1",
    status: "offen",
    prioritaet: "hoch",
    erstellt: "2025-01-15T09:30:00",
    zustaendig: "Max Mustermann",
    beschreibung: "Login-Probleme nach Passwortänderung",
  },
  {
    id: "TK-2025-002",
    praxis: "Zahnarztpraxis Schmidt",
    typ: "demo",
    status: "geplant",
    prioritaet: "mittel",
    erstellt: "2025-01-14T14:00:00",
    termin: "2025-01-20T10:00:00",
    zustaendig: "Lisa Schmidt",
    teamsLink: "https://teams.microsoft.com/l/meetup-join/...",
    beschreibung: "Produktvorstellung Qodia Premium",
  },
  {
    id: "TK-2025-003",
    praxis: "MVZ Gesundheit GmbH",
    typ: "support-2",
    status: "in-bearbeitung",
    prioritaet: "hoch",
    erstellt: "2025-01-13T11:15:00",
    zustaendig: "Tom Weber",
    beschreibung: "API-Integration funktioniert nicht korrekt",
  },
  {
    id: "TK-2025-004",
    praxis: "Praxis Dr. Weber",
    typ: "schulung",
    status: "geplant",
    prioritaet: "niedrig",
    erstellt: "2025-01-12T16:45:00",
    termin: "2025-01-22T14:00:00",
    zustaendig: "Lisa Schmidt",
    teamsLink: "https://teams.microsoft.com/l/meetup-join/...",
    beschreibung: "Einführungsschulung für neue Mitarbeiter",
  },
];

const typLabels: Record<string, string> = {
  "support-1": "Support 1st Level",
  "support-2": "Support 2nd Level",
  demo: "Demo-Termin",
  schulung: "Schulung",
};

const statusColors: Record<string, string> = {
  offen: "badge-warning",
  geplant: "badge-info",
  "in-bearbeitung": "badge-success",
  geschlossen: "badge-status bg-muted text-muted-foreground",
};

const prioritaetColors: Record<string, string> = {
  niedrig: "bg-muted text-muted-foreground",
  mittel: "bg-warning/10 text-warning",
  hoch: "bg-destructive/10 text-destructive",
};

export default function Tickets() {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("alle");

  const filteredTickets = tickets.filter((t) => {
    const matchesSearch =
      t.praxis.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase());
    const matchesTab =
      activeTab === "alle" ||
      (activeTab === "offen" && t.status === "offen") ||
      (activeTab === "geplant" && t.status === "geplant") ||
      (activeTab === "bearbeitung" && t.status === "in-bearbeitung");
    return matchesSearch && matchesTab;
  });

  const exportCSV = () => {
    const headers = [
      "Ticket-ID",
      "Praxis",
      "Typ",
      "Status",
      "Priorität",
      "Erstellt",
      "Termin",
      "Zuständig",
      "Beschreibung",
    ];
    const rows = tickets.map((t) => [
      t.id,
      t.praxis,
      typLabels[t.typ],
      t.status,
      t.prioritaet,
      new Date(t.erstellt).toLocaleString("de-DE"),
      t.termin ? new Date(t.termin).toLocaleString("de-DE") : "-",
      t.zustaendig,
      t.beschreibung,
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tickets_export_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
  };

  const generateTeamsLink = () => {
    return `https://teams.microsoft.com/l/meetup-join/${crypto.randomUUID()}`;
  };

  return (
    <MainLayout title="Tickets" subtitle="Support- und Demo-Termine verwalten">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Ticket-ID oder Praxis..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" />
            CSV Export
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Neues Ticket
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Neues Ticket erstellen</DialogTitle>
              </DialogHeader>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.currentTarget);
                  const typ = formData.get("typ") as Ticket["typ"];
                  const termin = formData.get("termin") as string;

                  const newTicket: Ticket = {
                    id: `TK-2025-${String(tickets.length + 1).padStart(3, "0")}`,
                    praxis: formData.get("praxis") as string,
                    typ,
                    status: termin ? "geplant" : "offen",
                    prioritaet: formData.get("prioritaet") as Ticket["prioritaet"],
                    erstellt: new Date().toISOString(),
                    termin: termin || undefined,
                    zustaendig: formData.get("zustaendig") as string,
                    teamsLink:
                      typ === "demo" || typ === "schulung"
                        ? generateTeamsLink()
                        : undefined,
                    beschreibung: formData.get("beschreibung") as string,
                  };
                  setTickets([newTicket, ...tickets]);
                  setIsDialogOpen(false);
                }}
                className="space-y-4"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="praxis">Praxis</Label>
                    <Input id="praxis" name="praxis" required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="typ">Ticket-Typ</Label>
                    <Select name="typ" defaultValue="support-1">
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="support-1">Support 1st Level</SelectItem>
                        <SelectItem value="support-2">Support 2nd Level</SelectItem>
                        <SelectItem value="demo">Demo-Termin</SelectItem>
                        <SelectItem value="schulung">Schulung</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="prioritaet">Priorität</Label>
                    <Select name="prioritaet" defaultValue="mittel">
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="niedrig">Niedrig</SelectItem>
                        <SelectItem value="mittel">Mittel</SelectItem>
                        <SelectItem value="hoch">Hoch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="termin">Termin (optional)</Label>
                    <Input
                      id="termin"
                      name="termin"
                      type="datetime-local"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="zustaendig">Zuständig</Label>
                    <Select name="zustaendig" defaultValue="Max Mustermann">
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Max Mustermann">Max Mustermann</SelectItem>
                        <SelectItem value="Lisa Schmidt">Lisa Schmidt</SelectItem>
                        <SelectItem value="Tom Weber">Tom Weber</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="beschreibung">Beschreibung</Label>
                    <Textarea
                      id="beschreibung"
                      name="beschreibung"
                      required
                      className="mt-1"
                      rows={3}
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsDialogOpen(false)}
                  >
                    Abbrechen
                  </Button>
                  <Button type="submit">Ticket erstellen</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="alle">
            Alle ({tickets.length})
          </TabsTrigger>
          <TabsTrigger value="offen">
            Offen ({tickets.filter((t) => t.status === "offen").length})
          </TabsTrigger>
          <TabsTrigger value="geplant">
            Geplant ({tickets.filter((t) => t.status === "geplant").length})
          </TabsTrigger>
          <TabsTrigger value="bearbeitung">
            In Bearbeitung ({tickets.filter((t) => t.status === "in-bearbeitung").length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Ticket Cards */}
      <div className="grid gap-4">
        {filteredTickets.map((ticket) => (
          <div
            key={ticket.id}
            className="card-elevated p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">{ticket.id}</span>
                  <span className={`badge-status ${statusColors[ticket.status]}`}>
                    {ticket.status.replace("-", " ")}
                  </span>
                  <span
                    className={`badge-status ${prioritaetColors[ticket.prioritaet]}`}
                  >
                    {ticket.prioritaet}
                  </span>
                  <span className="badge-status bg-secondary text-secondary-foreground">
                    {typLabels[ticket.typ]}
                  </span>
                </div>
                <h3 className="font-medium text-foreground mt-2">{ticket.praxis}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {ticket.beschreibung}
                </p>
                <div className="flex items-center gap-4 mt-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(ticket.erstellt).toLocaleDateString("de-DE")}
                  </span>
                  <span className="flex items-center gap-1">
                    <User className="h-3.5 w-3.5" />
                    {ticket.zustaendig}
                  </span>
                  {ticket.termin && (
                    <span className="flex items-center gap-1 text-primary font-medium">
                      <Clock className="h-3.5 w-3.5" />
                      Termin:{" "}
                      {new Date(ticket.termin).toLocaleString("de-DE", {
                        weekday: "short",
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
              </div>
              {ticket.teamsLink && (
                <Button variant="outline" size="sm" asChild>
                  <a href={ticket.teamsLink} target="_blank" rel="noopener noreferrer">
                    <Video className="h-4 w-4 mr-2" />
                    Teams-Meeting
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </MainLayout>
  );
}
