import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Praxen from "./pages/Praxen";
import Tickets from "./pages/Tickets";
import Kalender from "./pages/Kalender";
import Lizenzen from "./pages/Lizenzen";
import Export from "./pages/Export";

import Umsaetze from "./pages/Umsaetze";
import Reservierungen from "./pages/Reservierungen";
import DemoTracking from "./pages/DemoTracking";
import Interessenten from "./pages/Interessenten";
import Provisionen from "./pages/vertrieb/Provisionen";
import Rechnungen from "./pages/Rechnungen";
import Vertraege from "./pages/vertrieb/Vertraege";
import Vertriebler from "./pages/vertrieb/Vertriebler";
import AdminUsers from "./pages/admin/Users";
import AdminSettings from "./pages/admin/Settings";
import AdminProducts from "./pages/admin/Products";
import TippLeadsPage from "./pages/TippLeads";
import AccessRequests from "./pages/admin/AccessRequests";
import AuditLogs from "./pages/admin/AuditLogs";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import Sicherheit from "./pages/Sicherheit";
import PdfCoordinateFinder from "./pages/tools/PdfCoordinateFinder";
import EmailPreview from "./pages/tools/EmailPreview";
import EmailSettings from "./pages/admin/EmailSettings";
import { PdfViewerOverlay } from "@/components/PdfViewerOverlay";
import Documentation from "./pages/admin/Documentation";
import PlzMapping from "./pages/admin/PlzMapping";
import Buchhaltung from "./pages/Buchhaltung";
import DemoSuccess from "./pages/DemoSuccess";
import ContractConfirmation from "./pages/ContractConfirmation";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PdfViewerOverlay />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/demo-success" element={<DemoSuccess />} />
            <Route path="/demo-cancel" element={<NotFound />} />
            <Route path="/vertrag-bestaetigen" element={<ContractConfirmation />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/reservierungen" element={<ProtectedRoute><Reservierungen /></ProtectedRoute>} />
            <Route path="/praxen" element={<ProtectedRoute><Praxen /></ProtectedRoute>} />
            <Route path="/interessenten" element={<ProtectedRoute><Interessenten /></ProtectedRoute>} />
            <Route path="/demo-tracking" element={<ProtectedRoute><DemoTracking /></ProtectedRoute>} />
            <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
            <Route path="/kalender" element={<ProtectedRoute><Kalender /></ProtectedRoute>} />
            <Route path="/lizenzen" element={<ProtectedRoute><Lizenzen /></ProtectedRoute>} />
            <Route path="/umsaetze" element={<ProtectedRoute><Umsaetze /></ProtectedRoute>} />
            <Route path="/export" element={<ProtectedRoute><Export /></ProtectedRoute>} />
            <Route path="/integrationen" element={<ProtectedRoute><Buchhaltung /></ProtectedRoute>} />
            <Route path="/vertrieb/vertriebler" element={<ProtectedRoute><Vertriebler /></ProtectedRoute>} />
            <Route path="/vertrieb/vertraege" element={<ProtectedRoute><Vertraege /></ProtectedRoute>} />
            <Route path="/vertrieb/provisionen" element={<ProtectedRoute><Provisionen /></ProtectedRoute>} />
            <Route path="/rechnungen" element={<ProtectedRoute><Rechnungen /></ProtectedRoute>} />
            <Route path="/admin/access-requests" element={<ProtectedRoute><AccessRequests /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/audit-logs" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/products" element={<ProtectedRoute><AdminProducts /></ProtectedRoute>} />
            <Route path="/tipp-leads" element={<ProtectedRoute><TippLeadsPage /></ProtectedRoute>} />
            <Route path="/tippgeber" element={<ProtectedRoute><TippLeadsPage /></ProtectedRoute>} />
            <Route path="/admin/tipp-leads" element={<ProtectedRoute><TippLeadsPage /></ProtectedRoute>} />
            <Route path="/tools/pdf-coordinates" element={<ProtectedRoute><PdfCoordinateFinder /></ProtectedRoute>} />
            <Route path="/tools/email-preview" element={<ProtectedRoute><EmailPreview /></ProtectedRoute>} />
            <Route path="/admin/email-preview" element={<ProtectedRoute><EmailPreview /></ProtectedRoute>} />
            <Route path="/admin/email-settings" element={<ProtectedRoute><EmailSettings /></ProtectedRoute>} />
            <Route path="/sicherheit" element={<ProtectedRoute><Sicherheit /></ProtectedRoute>} />
            <Route path="/admin/documentation" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
            <Route path="/admin/plz-mapping" element={<ProtectedRoute><PlzMapping /></ProtectedRoute>} />
            <Route path="/buchhaltung" element={<ProtectedRoute><Buchhaltung /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
