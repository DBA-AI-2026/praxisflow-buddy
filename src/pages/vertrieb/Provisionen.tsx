import { MainLayout } from "@/components/layout/MainLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Euro, TrendingUp, Users, Calendar } from "lucide-react";

const provisionenData = [
  {
    id: 1,
    partner: "Max Mustermann",
    praxis: "Praxis Dr. Schmidt",
    produkt: "HFX GOÄ",
    datum: "2024-01-15",
    betrag: 250.00,
    status: "ausgezahlt",
  },
  {
    id: 2,
    partner: "Anna Meyer",
    praxis: "Zahnarztpraxis Müller",
    produkt: "HFX GOZ Live-Check",
    datum: "2024-01-18",
    betrag: 180.00,
    status: "ausstehend",
  },
  {
    id: 3,
    partner: "Max Mustermann",
    praxis: "MVZ Gesundheit",
    produkt: "HFX EBM",
    datum: "2024-01-20",
    betrag: 320.00,
    status: "ausstehend",
  },
  {
    id: 4,
    partner: "Thomas Weber",
    praxis: "Praxis am Park",
    produkt: "HFX Doku",
    datum: "2024-01-22",
    betrag: 150.00,
    status: "ausgezahlt",
  },
];

const Provisionen = () => {
  const totalProvisionen = provisionenData.reduce((sum, p) => sum + p.betrag, 0);
  const ausstehend = provisionenData.filter(p => p.status === "ausstehend").reduce((sum, p) => sum + p.betrag, 0);
  const ausgezahlt = provisionenData.filter(p => p.status === "ausgezahlt").reduce((sum, p) => sum + p.betrag, 0);
  const partnerCount = new Set(provisionenData.map(p => p.partner)).size;

  return (
    <MainLayout title="Provisionen" subtitle="Übersicht aller Vertriebsprovisionen">
      <div className="space-y-6">

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gesamt Provisionen</CardTitle>
              <Euro className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProvisionen.toFixed(2)} €</div>
              <p className="text-xs text-muted-foreground">Alle Provisionen</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ausstehend</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{ausstehend.toFixed(2)} €</div>
              <p className="text-xs text-muted-foreground">Noch nicht ausgezahlt</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ausgezahlt</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{ausgezahlt.toFixed(2)} €</div>
              <p className="text-xs text-muted-foreground">Bereits überwiesen</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Aktive Partner</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{partnerCount}</div>
              <p className="text-xs text-muted-foreground">Mit Provisionen</p>
            </CardContent>
          </Card>
        </div>

        {/* Provisionen Table */}
        <Card>
          <CardHeader>
            <CardTitle>Provisionsübersicht</CardTitle>
            <CardDescription>Alle erfassten Vertriebsprovisionen</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Praxis</TableHead>
                  <TableHead>Produkt</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead className="text-right">Betrag</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {provisionenData.map((provision) => (
                  <TableRow key={provision.id}>
                    <TableCell className="font-medium">{provision.partner}</TableCell>
                    <TableCell>{provision.praxis}</TableCell>
                    <TableCell>{provision.produkt}</TableCell>
                    <TableCell>{new Date(provision.datum).toLocaleDateString("de-DE")}</TableCell>
                    <TableCell className="text-right font-medium">{provision.betrag.toFixed(2)} €</TableCell>
                    <TableCell>
                      <Badge 
                        variant={provision.status === "ausgezahlt" ? "default" : "secondary"}
                        className={provision.status === "ausgezahlt" 
                          ? "bg-green-100 text-green-800 hover:bg-green-100" 
                          : "bg-orange-100 text-orange-800 hover:bg-orange-100"
                        }
                      >
                        {provision.status === "ausgezahlt" ? "Ausgezahlt" : "Ausstehend"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
};

export default Provisionen;
