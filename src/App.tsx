import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { RolePreviewProvider } from "@/contexts/RolePreviewContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
// Praxen.tsx (veraltete Ansicht) — Import entfernt; /praxen leitet auf PraxenJourney um
import Tickets from "./pages/Tickets";
import Kalender from "./pages/Kalender";
import Lizenzen from "./pages/Lizenzen";
import Export from "./pages/Export";

import Umsaetze from "./pages/Umsaetze";
import Reservierungen from "./pages/Reservierungen";
import DemoTracking from "./pages/DemoTracking";
// Interessenten.tsx removed – Pipeline Tab "Interessenten" replaces it
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
import MeinKonto from "./pages/MeinKonto";

import EmailPreview from "./pages/tools/EmailPreview";
import EmailSettings from "./pages/admin/EmailSettings";
import { PdfViewerOverlay } from "@/components/PdfViewerOverlay";
import Documentation from "./pages/admin/Documentation";
import PlzMapping from "./pages/admin/PlzMapping";
import Buchhaltung from "./pages/Buchhaltung";
import Integrationen from "./pages/Integrationen";
import PraxenJourney from "./pages/PraxenJourney";
import DemoSuccess from "./pages/DemoSuccess";
import ContractConfirmation from "./pages/ContractConfirmation";
import MandateSuccess from "./pages/MandateSuccess";
import MandateInfo from "./pages/MandateInfo";
import Buchen from "./pages/Buchen";
import QodiaVerbrauch from "./pages/QodiaVerbrauch";
import AgbManagement from "./pages/admin/AgbManagement";
import Kunden from "./pages/Kunden";
import RollenUebersicht from "./pages/admin/RollenUebersicht";
import FibuReconciliation from "./pages/admin/FibuReconciliation";
import ContractInspect from "./pages/admin/ContractInspect";
import LeadCleanup from "./pages/admin/LeadCleanup";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <RolePreviewProvider>
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
            <Route path="/mandate-success" element={<MandateSuccess />} />
            <Route path="/mandate-info" element={<MandateInfo />} />
            <Route path="/buchen" element={<Buchen />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/pipeline" element={<ProtectedRoute><PraxenJourney /></ProtectedRoute>} />
            {/* Legacy redirects → Pipeline */}
            <Route path="/praxen-journey" element={<Navigate to="/pipeline" replace />} />
            <Route path="/praxen" element={<Navigate to="/pipeline" replace />} />
            <Route path="/interessenten" element={<Navigate to="/pipeline" replace />} />
            <Route path="/kunden" element={<Navigate to="/pipeline?tab=kunden" replace />} />
            <Route path="/kunden/:id" element={<ProtectedRoute requiredRoles={["user", "sales_lead", "regional_lead", "admin"]}><Kunden /></ProtectedRoute>} />
            <Route path="/demo-tracking" element={<ProtectedRoute><DemoTracking /></ProtectedRoute>} />
            <Route path="/reservierungen" element={<ProtectedRoute><Reservierungen /></ProtectedRoute>} />
            <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
            <Route path="/kalender" element={<ProtectedRoute><Kalender /></ProtectedRoute>} />
            <Route path="/lizenzen" element={<ProtectedRoute><Lizenzen /></ProtectedRoute>} />
            <Route path="/umsaetze" element={<ProtectedRoute><Umsaetze /></ProtectedRoute>} />
            <Route path="/export" element={<ProtectedRoute><Export /></ProtectedRoute>} />
            {/* P1-Fix: /integrationen zeigt jetzt korrekt Integrationen.tsx (Lexware), nicht Buchhaltung */}
            <Route path="/integrationen" element={<ProtectedRoute><Integrationen /></ProtectedRoute>} />
            <Route path="/vertrieb/vertriebler" element={<ProtectedRoute><Vertriebler /></ProtectedRoute>} />
            {/* Vertragsdetail – kontextbezogen erreichbar, kein Nav-Eintrag */}
            <Route path="/vertrieb/vertraege" element={<ProtectedRoute><Vertraege /></ProtectedRoute>} />
            <Route path="/vertrieb/provisionen" element={<ProtectedRoute><Provisionen /></ProtectedRoute>} />
            <Route path="/rechnungen" element={<ProtectedRoute><Rechnungen /></ProtectedRoute>} />
            <Route path="/admin/access-requests" element={<ProtectedRoute><AccessRequests /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/audit-logs" element={<ProtectedRoute><AuditLogs /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
            <Route path="/admin/products" element={<ProtectedRoute><AdminProducts /></ProtectedRoute>} />
            <Route path="/admin/agb" element={<ProtectedRoute><AgbManagement /></ProtectedRoute>} />
            <Route path="/tipp-leads" element={<ProtectedRoute><TippLeadsPage /></ProtectedRoute>} />
            
            <Route path="/tools/email-preview" element={<ProtectedRoute><EmailPreview /></ProtectedRoute>} />
            <Route path="/admin/email-preview" element={<ProtectedRoute><EmailPreview /></ProtectedRoute>} />
            <Route path="/admin/email-settings" element={<ProtectedRoute><EmailSettings /></ProtectedRoute>} />
            <Route path="/sicherheit" element={<ProtectedRoute><Sicherheit /></ProtectedRoute>} />
            <Route path="/mein-konto" element={<ProtectedRoute><MeinKonto /></ProtectedRoute>} />
            <Route path="/admin/documentation" element={<ProtectedRoute><Documentation /></ProtectedRoute>} />
            <Route path="/admin/plz-mapping" element={<ProtectedRoute><PlzMapping /></ProtectedRoute>} />
            <Route path="/admin/contract-inspect" element={<ProtectedRoute><ContractInspect /></ProtectedRoute>} />
            {/* P1-Fix: /buchhaltung ist die kanonische Route für FiBu/Rechnungen */}
            <Route path="/buchhaltung" element={<ProtectedRoute><Buchhaltung /></ProtectedRoute>} />
            {/* /praxen-journey redirect is handled above */}
            <Route path="/qodia-verbrauch" element={<ProtectedRoute><QodiaVerbrauch /></ProtectedRoute>} />
            <Route path="/admin/rollen-uebersicht" element={<ProtectedRoute><RollenUebersicht /></ProtectedRoute>} />
            <Route path="/admin/fibu-reconciliation" element={<ProtectedRoute><FibuReconciliation /></ProtectedRoute>} />
            <Route path="/admin/lead-cleanup" element={<ProtectedRoute><LeadCleanup /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </RolePreviewProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
