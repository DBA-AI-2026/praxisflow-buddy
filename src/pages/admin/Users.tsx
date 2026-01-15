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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Key, Shield } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

interface User {
  id: string;
  name: string;
  email: string;
  rolle: "admin" | "user";
  datenexport: boolean;
  erstelltAm: string;
  letzteAnmeldung: string;
  status: "aktiv" | "inaktiv";
}

const initialUsers: User[] = [
  {
    id: "1",
    name: "Admin Demo",
    email: "admin@qodia.de",
    rolle: "admin",
    datenexport: true,
    erstelltAm: "2024-01-01",
    letzteAnmeldung: "2025-01-15T09:30:00",
    status: "aktiv",
  },
  {
    id: "2",
    name: "Max Mustermann",
    email: "max.mustermann@qodia.de",
    rolle: "user",
    datenexport: true,
    erstelltAm: "2024-06-15",
    letzteAnmeldung: "2025-01-14T14:20:00",
    status: "aktiv",
  },
  {
    id: "3",
    name: "Lisa Schmidt",
    email: "lisa.schmidt@qodia.de",
    rolle: "user",
    datenexport: false,
    erstelltAm: "2024-09-01",
    letzteAnmeldung: "2025-01-15T08:15:00",
    status: "aktiv",
  },
  {
    id: "4",
    name: "Tom Weber",
    email: "tom.weber@qodia.de",
    rolle: "user",
    datenexport: false,
    erstelltAm: "2024-11-20",
    letzteAnmeldung: "2025-01-13T16:45:00",
    status: "aktiv",
  },
];

const rolleColors: Record<string, string> = {
  admin: "badge-info",
  user: "badge-status bg-secondary text-secondary-foreground",
};

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();

  const filteredUsers = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggleDatenexport = (userId: string) => {
    setUsers(
      users.map((u) =>
        u.id === userId ? { ...u, datenexport: !u.datenexport } : u
      )
    );
    toast({
      title: "Berechtigung aktualisiert",
      description: "Die Datenexport-Berechtigung wurde geändert.",
    });
  };

  const deleteUser = (userId: string) => {
    setUsers(users.filter((u) => u.id !== userId));
    toast({
      title: "Benutzer gelöscht",
      description: "Der Benutzer wurde erfolgreich entfernt.",
    });
  };

  return (
    <MainLayout title="Benutzerverwaltung" subtitle="Benutzer und Rollen verwalten">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-primary/10">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Admins</p>
              <p className="text-2xl font-semibold text-foreground">
                {users.filter((u) => u.rolle === "admin").length}
              </p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-secondary">
              <Shield className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">User</p>
              <p className="text-2xl font-semibold text-foreground">
                {users.filter((u) => u.rolle === "user").length}
              </p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-accent/10">
              <Key className="h-5 w-5 text-accent" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Mit Datenexport</p>
              <p className="text-2xl font-semibold text-foreground">
                {users.filter((u) => u.datenexport).length}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Name oder E-Mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Neuer Benutzer
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Neuen Benutzer anlegen</DialogTitle>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const newUser: User = {
                  id: crypto.randomUUID(),
                  name: formData.get("name") as string,
                  email: formData.get("email") as string,
                  rolle: formData.get("rolle") as "admin" | "user",
                  datenexport: formData.get("datenexport") === "on",
                  erstelltAm: new Date().toISOString().split("T")[0],
                  letzteAnmeldung: "-",
                  status: "aktiv",
                };
                setUsers([newUser, ...users]);
                setIsDialogOpen(false);
                toast({
                  title: "Benutzer angelegt",
                  description: `${newUser.name} wurde erfolgreich hinzugefügt.`,
                });
              }}
              className="space-y-4"
            >
              <div>
                <Label htmlFor="name">Name</Label>
                <Input id="name" name="name" required className="mt-1" />
              </div>
              <div>
                <Label htmlFor="email">E-Mail</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="rolle">Rolle</Label>
                <Select name="rolle" defaultValue="user">
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="datenexport">Datenexport erlauben</Label>
                <Switch id="datenexport" name="datenexport" />
              </div>
              <div className="flex justify-end gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDialogOpen(false)}
                >
                  Abbrechen
                </Button>
                <Button type="submit">Benutzer anlegen</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead className="bg-muted/50">
              <tr>
                <th>Benutzer</th>
                <th>Rolle</th>
                <th>Datenexport</th>
                <th>Erstellt am</th>
                <th>Letzte Anmeldung</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {user.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")}
                      </div>
                      <div>
                        <span className="font-medium text-foreground">
                          {user.name}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {user.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge-status ${rolleColors[user.rolle]}`}>
                      {user.rolle === "admin" ? "Admin" : "User"}
                    </span>
                  </td>
                  <td>
                    <Switch
                      checked={user.datenexport}
                      onCheckedChange={() => toggleDatenexport(user.id)}
                    />
                  </td>
                  <td className="text-muted-foreground">
                    {new Date(user.erstelltAm).toLocaleDateString("de-DE")}
                  </td>
                  <td className="text-muted-foreground">
                    {user.letzteAnmeldung === "-"
                      ? "-"
                      : new Date(user.letzteAnmeldung).toLocaleString("de-DE", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                  </td>
                  <td>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem>
                          <Pencil className="h-4 w-4 mr-2" />
                          Bearbeiten
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Key className="h-4 w-4 mr-2" />
                          Passwort ändern
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteUser(user.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Löschen
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </MainLayout>
  );
}
