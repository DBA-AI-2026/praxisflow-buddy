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
import Reservierungen from "./pages/Reservierungen";
import Provisionen from "./pages/vertrieb/Provisionen";
import Vertriebler from "./pages/vertrieb/Vertriebler";
import AdminUsers from "./pages/admin/Users";
import AdminSettings from "./pages/admin/Settings";
import AccessRequests from "./pages/admin/AccessRequests";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
            <Route path="/reservierungen" element={<ProtectedRoute><Reservierungen /></ProtectedRoute>} />
            <Route path="/praxen" element={<ProtectedRoute><Praxen /></ProtectedRoute>} />
            <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
            <Route path="/kalender" element={<ProtectedRoute><Kalender /></ProtectedRoute>} />
            <Route path="/lizenzen" element={<ProtectedRoute><Lizenzen /></ProtectedRoute>} />
            <Route path="/export" element={<ProtectedRoute><Export /></ProtectedRoute>} />
            <Route path="/vertrieb/vertriebler" element={<ProtectedRoute><Vertriebler /></ProtectedRoute>} />
            <Route path="/vertrieb/provisionen" element={<ProtectedRoute><Provisionen /></ProtectedRoute>} />
            <Route path="/admin/access-requests" element={<ProtectedRoute><AccessRequests /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute><AdminUsers /></ProtectedRoute>} />
            <Route path="/admin/settings" element={<ProtectedRoute><AdminSettings /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
