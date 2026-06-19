import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { AppProvider } from "@/contexts/AppContext";
import { PacotesProvider } from "@/contexts/PacotesContext";
import { AdicionaisProvider } from "@/contexts/AdicionaisContext";
import { EquipesProvider } from "@/contexts/EquipesContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Dashboard from "./pages/Dashboard";
import Calendario from "./pages/Calendario";
import Eventos from "./pages/Eventos";
import Pagamentos from "./pages/Pagamentos";
import Pacotes from "./pages/Pacotes";
import Clientes from "./pages/Clientes";
import TestClienteForm from "./pages/TestClienteForm";
import Relatorios from "./pages/Relatorios";
import Ajuda from "./pages/Ajuda";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";

const queryClient = new QueryClient();

// rotas que exigem usuário logado
function PrivateRoutes() {
  const { user, loading } = useAuth();



  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <span className="text-sm text-slate-500">Carregando...</span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calendario" element={<Calendario />} />
        <Route path="/Eventos" element={<Eventos />} />
        <Route path="/pagamentos" element={<Pagamentos />} />
        {/* <Route path="/propostas" element={<Pacotes />} /> */}
        <Route path="/test-cliente" element={<TestClienteForm />} />
        <Route path="/clientes" element={<Clientes />} />
        {/* <Route path="/relatorios" element={<Relatorios />} /> */}
        <Route path="/ajuda" element={<Ajuda />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AppProvider>
          <PacotesProvider>
            <AdicionaisProvider>
              <EquipesProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter
                  future={{
                    v7_startTransition: true,
                    v7_relativeSplatPath: true,
                  }}
                >
                  <Routes>
                    {/* rota pública */}
                    <Route path="/login" element={<Login />} />
                    {/* tudo que não é /login passa pelo fluxo privado */}
                    <Route path="/*" element={<PrivateRoutes />} />
                  </Routes>
                </BrowserRouter>
              </EquipesProvider>
            </AdicionaisProvider>
          </PacotesProvider>
        </AppProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

// tudo aqui já é compatível com o schema/RLS (usa AuthProvider)
export default App;
