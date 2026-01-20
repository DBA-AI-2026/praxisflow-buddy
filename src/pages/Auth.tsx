import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import logo from "@/assets/fox-logo.jpeg";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const loginSchema = z.object({
  email: z.string().email("Bitte geben Sie eine gültige E-Mail-Adresse ein"),
  password: z.string().min(6, "Das Passwort muss mindestens 6 Zeichen lang sein"),
});

const requestSchema = z.object({
  fullName: z.string().min(2, "Bitte geben Sie Ihren vollständigen Namen ein"),
  email: z.string().email("Bitte geben Sie eine gültige E-Mail-Adresse ein"),
  company: z.string().optional(),
  message: z.string().optional(),
});

export default function Auth() {
  const navigate = useNavigate();
  const { signIn, user, isLoading: authLoading } = useAuth();
  
  const [activeTab, setActiveTab] = useState("login");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  
  // Access request form state
  const [requestEmail, setRequestEmail] = useState("");
  const [requestFullName, setRequestFullName] = useState("");
  const [requestCompany, setRequestCompany] = useState("");
  const [requestMessage, setRequestMessage] = useState("");

  // Redirect if already logged in
  useEffect(() => {
    if (user && !authLoading) {
      navigate("/");
    }
  }, [user, authLoading, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const validation = loginSchema.safeParse({
        email: loginEmail,
        password: loginPassword,
      });

      if (!validation.success) {
        setError(validation.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      const { error } = await signIn(loginEmail, loginPassword);
      
      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setError("Ungültige Anmeldedaten. Bitte überprüfen Sie E-Mail und Passwort.");
        } else {
          setError(error.message);
        }
      }
    } catch (err) {
      setError("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAccessRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    try {
      const validation = requestSchema.safeParse({
        email: requestEmail,
        fullName: requestFullName,
        company: requestCompany,
        message: requestMessage,
      });

      if (!validation.success) {
        setError(validation.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      // Check if request already exists
      const { data: existingRequest } = await supabase
        .from("registration_requests")
        .select("id, status")
        .eq("email", requestEmail)
        .maybeSingle();

      if (existingRequest) {
        if (existingRequest.status === "pending") {
          setError("Eine Anfrage mit dieser E-Mail-Adresse ist bereits eingegangen und wird bearbeitet.");
        } else if (existingRequest.status === "approved") {
          setError("Ihre Anfrage wurde bereits genehmigt. Bitte melden Sie sich an.");
          setActiveTab("login");
        } else {
          setError("Ihre vorherige Anfrage wurde abgelehnt. Bitte kontaktieren Sie den Administrator.");
        }
        setIsLoading(false);
        return;
      }

      // Insert new request
      const { error: insertError } = await supabase
        .from("registration_requests")
        .insert({
          full_name: requestFullName,
          email: requestEmail,
          company: requestCompany || null,
          message: requestMessage || null,
        });

      if (insertError) {
        setError("Fehler beim Senden der Anfrage. Bitte versuchen Sie es erneut.");
        console.error("Insert error:", insertError);
      } else {
        setSuccess("Ihre Zugangsanfrage wurde erfolgreich gesendet. Ein Administrator wird sich mit Ihnen in Verbindung setzen.");
        setRequestEmail("");
        setRequestFullName("");
        setRequestCompany("");
        setRequestMessage("");
      }
    } catch (err) {
      setError("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img 
              src={logo} 
              alt="Honorarfuchs" 
              className="h-20 w-20 rounded-full object-cover border-4 border-primary/20 shadow-lg"
            />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold text-foreground">HFX Honorarfuchs Sales</CardTitle>
            <CardDescription>das Portal für den Vertrieb</CardDescription>
          </div>
        </CardHeader>
        
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Anmelden</TabsTrigger>
              <TabsTrigger value="request">Zugang anfragen</TabsTrigger>
            </TabsList>
            
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert className="mt-4 border-green-500 bg-green-50 text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>{success}</AlertDescription>
              </Alert>
            )}
            
            <TabsContent value="login" className="mt-4">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">E-Mail</Label>
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="ihre.email@example.com"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Passwort</Label>
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird angemeldet...
                    </>
                  ) : (
                    "Anmelden"
                  )}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="request" className="mt-4">
              <form onSubmit={handleAccessRequest} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="request-name">Vollständiger Name *</Label>
                  <Input
                    id="request-name"
                    type="text"
                    placeholder="z.B. Konstantin Eckert"
                    value={requestFullName}
                    onChange={(e) => setRequestFullName(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-email">E-Mail *</Label>
                  <Input
                    id="request-email"
                    type="email"
                    placeholder="ihre.email@example.com"
                    value={requestEmail}
                    onChange={(e) => setRequestEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-company">Firma (optional)</Label>
                  <Input
                    id="request-company"
                    type="text"
                    placeholder="z.B. Medizin GmbH"
                    value={requestCompany}
                    onChange={(e) => setRequestCompany(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="request-message">Nachricht (optional)</Label>
                  <Textarea
                    id="request-message"
                    placeholder="Warum möchten Sie Zugang zum Portal?"
                    value={requestMessage}
                    onChange={(e) => setRequestMessage(e.target.value)}
                    disabled={isLoading}
                    rows={3}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Wird gesendet...
                    </>
                  ) : (
                    "Zugang anfragen"
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        
        <CardFooter className="text-center text-sm text-muted-foreground">
          <p className="w-full">
            {activeTab === "login" 
              ? "Noch keinen Zugang? Stellen Sie eine Anfrage." 
              : "Bereits Zugang erhalten? Wechseln Sie zur Anmeldung."}
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
