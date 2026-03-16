import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import AuthGuard from "@/components/AuthGuard";
import Compare from "./pages/Compare";
import Statements from "./pages/Statements";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import RegulationChat from "./components/RegulationChat";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <AuthGuard>
                  <Statements />
                </AuthGuard>
              }
            />
            <Route path="/statements" element={<Navigate to="/" replace />} />
            <Route
              path="/compare"
              element={
                <AuthGuard>
                  <Compare />
                </AuthGuard>
              }
            />
            <Route
              path="/admin"
              element={
                <AuthGuard>
                  <Admin />
                </AuthGuard>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
