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
import { Loader2, AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import logo from "@/assets/fuchs-bildmarke.png";
import { z } from "zod";
import { supabase } from "@/lib/supabaseClient";

// Login: deliberately lenient (min 6) — existing accounts may have shorter passwords.
// New passwords (reset/set) enforce the strict policy defined in passwordSchema.
const loginSchema = z.object({
  email: z.string().email("Bitte geben Sie eine gültige E-Mail-Adresse ein"),
  password: z.string().min(1, "Bitte geben Sie Ihr Passwort ein"),
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
  const [showPassword, setShowPassword] = useState(false);
  
  // Access request form state
  const [requestEmail, setRequestEmail] = useState("");
  const [requestFullName, setRequestFullName] = useState("");
  const [requestCompany, setRequestCompany] = useState("");
  const [requestMessage, setRequestMessage] = useState("");

  // Redirect if already logged in (role-aware, multi-role: tippgeber only when it's the primary role)
  useEffect(() => {
    if (user && !authLoading) {
      (async () => {
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("is_active", true);
        const roles = (roleRows ?? []).map((r) => r.role as string);
        // Priority: admin > sales_lead > regional_lead > vertragsabteilung > sales_partner > user > tippgeber
        const priority = ["admin", "sales_lead", "regional_lead", "vertragsabteilung", "sales_partner", "user", "tippgeber"];
        const primary = priority.find((r) => roles.includes(r)) ?? null;
        navigate(primary === "tippgeber" ? "/tipp-leads" : "/");
      })();
    }
  }, [user, authLoading, navigate]);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setForgotLoading(true);

    if (!forgotEmail || !z.string().email().safeParse(forgotEmail).success) {
      setError("Bitte geben Sie eine gültige E-Mail-Adresse ein.");
      setForgotLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setError(error.message);
    } else {
      setForgotSuccess(true);
    }
    setForgotLoading(false);
  };

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

      // Use rate-limited SECURITY DEFINER RPC — no direct table access from client
      const { data: result, error: rpcError } = await supabase.rpc(
        "submit_registration_request",
        {
          p_full_name: requestFullName,
          p_email: requestEmail,
          p_company: requestCompany || null,
          p_message: requestMessage || null,
        }
      );

      if (rpcError) {
        setError("Fehler beim Senden der Anfrage. Bitte versuchen Sie es erneut.");
        return;
      }

      const response = result as { success: boolean; code?: string; message?: string };

      if (!response.success) {
        // Generic message regardless of internal code — no account enumeration
        if (response.code === "RATE_LIMITED") {
          setError("Zu viele Anfragen. Bitte versuchen Sie es später erneut.");
        } else {
          // DUPLICATE, ALREADY_PROCESSED, INVALID_INPUT — all use neutral wording
          setError("Ihre Anfrage konnte nicht übermittelt werden. Falls Sie bereits eine Anfrage gestellt haben, wenden Sie sich bitte direkt an uns.");
        }
        return;
      }

      // Success — fire notification (fire and forget, no error leak to user)
      supabase.functions.invoke("notify-new-request", {
        body: {
          fullName: requestFullName,
          email: requestEmail,
          company: requestCompany || null,
          message: requestMessage || null,
        },
      }).catch(() => { /* intentionally silent */ });

      setSuccess("Ihre Zugangsanfrage wurde erfolgreich gesendet. Ein Administrator wird sich mit Ihnen in Verbindung setzen.");
      setRequestEmail("");
      setRequestFullName("");
      setRequestCompany("");
      setRequestMessage("");
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
              {showForgotPassword ? (
                forgotSuccess ? (
                  <div className="space-y-4">
                    <Alert className="border-green-500 bg-green-50 text-green-700">
                      <CheckCircle2 className="h-4 w-4" />
                      <AlertDescription>
                        Falls ein Konto mit dieser E-Mail existiert, erhalten Sie in Kürze einen Link zum Zurücksetzen Ihres Passworts.
                      </AlertDescription>
                    </Alert>
                    <Button variant="outline" className="w-full" onClick={() => { setShowForgotPassword(false); setForgotSuccess(false); setError(null); }}>
                      Zurück zur Anmeldung
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Geben Sie Ihre E-Mail-Adresse ein und wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="forgot-email">E-Mail</Label>
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="ihre.email@example.com"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        required
                        disabled={forgotLoading}
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={forgotLoading}>
                      {forgotLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Wird gesendet...
                        </>
                      ) : (
                        "Link senden"
                      )}
                    </Button>
                    <Button variant="ghost" className="w-full" type="button" onClick={() => { setShowForgotPassword(false); setError(null); }}>
                      Zurück zur Anmeldung
                    </Button>
                  </form>
                )
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">E-Mail</Label>
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="username"
                      placeholder="ihre.email@example.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      disabled={isLoading}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="login-password">Passwort</Label>
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline"
                        onClick={() => { setShowForgotPassword(true); setError(null); }}
                      >
                        Passwort vergessen?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="login-password"
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder="••••••••"
                        value={loginPassword}
                        onChange={(e) => setLoginPassword(e.target.value)}
                        required
                        disabled={isLoading}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowPassword((v) => !v)}
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
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
              )}
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
