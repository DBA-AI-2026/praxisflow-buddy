import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MainLayout } from "@/components/layout/MainLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Search, 
  UserPlus, 
  UserX, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Loader2,
  Copy,
  Building2,
  Mail,
  MessageSquare
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";

type RegistrationRequest = Tables<"registration_requests">;

const statusConfig = {
  pending: { label: "Ausstehend", color: "bg-yellow-100 text-yellow-800", icon: Clock },
  approved: { label: "Genehmigt", color: "bg-green-100 text-green-800", icon: CheckCircle2 },
  rejected: { label: "Abgelehnt", color: "bg-red-100 text-red-800", icon: XCircle },
};

export default function AccessRequests() {
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<RegistrationRequest | null>(null);
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [credentialsDialogOpen, setCredentialsDialogOpen] = useState(false);
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("sales_partner");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch registration requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["registration-requests"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registration_requests")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as RegistrationRequest[];
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async ({ requestId, role }: { requestId: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("approve-user", {
        body: { requestId, action: "approve", role },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["registration-requests"] });
      setApproveDialogOpen(false);
      setSelectedRequest(null);
      
      if (data.credentials) {
        setCredentials(data.credentials);
        setCredentialsDialogOpen(true);
      }
      
      toast({
        title: "Zugang genehmigt",
        description: "Der Benutzer wurde erfolgreich erstellt.",
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

  // Reject mutation
  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { data, error } = await supabase.functions.invoke("approve-user", {
        body: { requestId, action: "reject" },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registration-requests"] });
      setRejectDialogOpen(false);
      setSelectedRequest(null);
      toast({
        title: "Anfrage abgelehnt",
        description: "Die Zugangsanfrage wurde abgelehnt.",
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

  const filteredRequests = requests.filter(
    (r) =>
      r.full_name.toLowerCase().includes(search.toLowerCase()) ||
      r.email.toLowerCase().includes(search.toLowerCase()) ||
      (r.company && r.company.toLowerCase().includes(search.toLowerCase()))
  );

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Kopiert",
      description: "In die Zwischenablage kopiert.",
    });
  };

  return (
    <MainLayout title="Zugangsanfragen" subtitle="Registrierungsanfragen verwalten">
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-yellow-100">
              <Clock className="h-5 w-5 text-yellow-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Ausstehend</p>
              <p className="text-2xl font-semibold text-foreground">{pendingCount}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-green-100">
              <CheckCircle2 className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Genehmigt</p>
              <p className="text-2xl font-semibold text-foreground">{approvedCount}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="rounded-lg p-3 bg-red-100">
              <XCircle className="h-5 w-5 text-red-700" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Abgelehnt</p>
              <p className="text-2xl font-semibold text-foreground">{rejectedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-6">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Suche nach Name, E-Mail oder Firma..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="card-elevated overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Keine Anfragen gefunden.
            </div>
          ) : (
            <table className="data-table">
              <thead className="bg-muted/50">
                <tr>
                  <th>Antragsteller</th>
                  <th>Firma</th>
                  <th>Nachricht</th>
                  <th>Status</th>
                  <th>Datum</th>
                  <th className="w-32">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((request) => {
                  const StatusIcon = statusConfig[request.status as keyof typeof statusConfig]?.icon || Clock;
                  return (
                    <tr key={request.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                            {request.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)}
                          </div>
                          <div>
                            <span className="font-medium text-foreground">
                              {request.full_name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {request.email}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="text-muted-foreground">
                        {request.company || "-"}
                      </td>
                      <td className="text-muted-foreground max-w-xs truncate">
                        {request.message || "-"}
                      </td>
                      <td>
                        <Badge
                          variant="secondary"
                          className={statusConfig[request.status as keyof typeof statusConfig]?.color || ""}
                        >
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusConfig[request.status as keyof typeof statusConfig]?.label || request.status}
                        </Badge>
                      </td>
                      <td className="text-muted-foreground">
                        {new Date(request.created_at).toLocaleDateString("de-DE")}
                      </td>
                      <td>
                        {request.status === "pending" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={() => {
                                setSelectedRequest(request);
                                setApproveDialogOpen(true);
                              }}
                            >
                              <UserPlus className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                setSelectedRequest(request);
                                setRejectDialogOpen(true);
                              }}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Zugang genehmigen</DialogTitle>
            <DialogDescription>
              Erstellen Sie einen Benutzer für diese Anfrage.
            </DialogDescription>
          </DialogHeader>
          
          {selectedRequest && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedRequest.full_name}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{selectedRequest.email}</span>
                </div>
                {selectedRequest.company && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>{selectedRequest.company}</span>
                  </div>
                )}
                {selectedRequest.message && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground">
                    <MessageSquare className="h-4 w-4 mt-0.5" />
                    <span>{selectedRequest.message}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Rolle zuweisen</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">Gebietsleiter</SelectItem>
                    <SelectItem value="sales_partner">Vertriebspartner</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => {
                if (selectedRequest) {
                  approveMutation.mutate({ requestId: selectedRequest.id, role: selectedRole });
                }
              }}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird erstellt...
                </>
              ) : (
                "Genehmigen & Benutzer erstellen"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anfrage ablehnen</DialogTitle>
            <DialogDescription>
              Sind Sie sicher, dass Sie diese Anfrage ablehnen möchten?
            </DialogDescription>
          </DialogHeader>

          {selectedRequest && (
            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium">{selectedRequest.full_name}</p>
              <p className="text-sm text-muted-foreground">{selectedRequest.email}</p>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Abbrechen
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedRequest) {
                  rejectMutation.mutate(selectedRequest.id);
                }
              }}
              disabled={rejectMutation.isPending}
            >
              {rejectMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Wird abgelehnt...
                </>
              ) : (
                "Ablehnen"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Credentials Dialog */}
      <Dialog open={credentialsDialogOpen} onOpenChange={setCredentialsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Benutzer erstellt
            </DialogTitle>
            <DialogDescription>
              Bitte teilen Sie diese Zugangsdaten dem Benutzer mit.
            </DialogDescription>
          </DialogHeader>

          {credentials && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">E-Mail</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-background px-3 py-2 rounded border text-sm">
                      {credentials.email}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copyToClipboard(credentials.email)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Passwort</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-background px-3 py-2 rounded border text-sm font-mono">
                      {credentials.password}
                    </code>
                    <Button
                      size="icon"
                      variant="outline"
                      onClick={() => copyToClipboard(credentials.password)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                ⚠️ Das Passwort wird nur einmal angezeigt. Bitte notieren Sie es.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setCredentialsDialogOpen(false)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
