import React, { createContext, useContext, useEffect, useState } from "react";
import type { Cliente, Evento } from "@/types";
import {
  getClientesApi,
  createClienteApi,
  updateClienteApi,
  deleteClienteApi,
  getEventosApi,
  createEventoApi,
  updateEventoApi,
  deleteEventoApi,
} from "@/services/supabaseApi";
import { useAuth } from "@/contexts/AuthContext";

type AppContextValue = {
  clientes: Cliente[];
  Eventos: Evento[];
  addCliente: (data: Omit<Cliente, "id" | "userId" | "createdAt">) => Promise<Cliente | null>;
  updateCliente: (id: string, patch: Partial<Cliente>) => Promise<Cliente | null>;
  removeCliente: (id: string) => Promise<void>;
  refreshClientes: () => Promise<void>;
  addEvento: (data: Omit<Evento, "id" | "userId">) => Promise<void>;
  updateEvento: (id: string, patch: Partial<Evento>) => Promise<void>;
  removeEvento: (id: string) => Promise<void>;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [Eventos, setEventos] = useState<Evento[]>([]);
  const [loadingEventos, setLoadingEventos] = useState(false);

  useEffect(() => {
    if (!user) {
      setClientes([]);
      setEventos([]);
      return;
    }

    const load = async () => {
      try {
        console.log("[AppContext] Iniciando carregamento de dados");
        setLoadingEventos(true);

        const startTime = performance.now();
        const [clientesDb, EventosDb] = await Promise.all([
          getClientesApi(),
          getEventosApi(),
        ]);
        const endTime = performance.now();

        console.log(`[AppContext] Carregamento concluído em ${(endTime - startTime).toFixed(2)}ms`);
        console.log("[AppContext] Clientes carregados:", clientesDb.length);
        console.log("[AppContext] Eventos carregados:", EventosDb.length);

        setClientes(clientesDb);
        setEventos(EventosDb);
      } catch (err) {
        console.error("[AppContext] Erro ao carregar dados:", err);
      } finally {
        setLoadingEventos(false);
      }
    };

    load();
  }, [user]);

  // função pública para atualizar apenas a lista de clientes
  const refreshClientes = async () => {
    try {
      const clientesDb = await getClientesApi();
      setClientes(clientesDb);
      console.log("[AppContext] refreshClientes: clientes recarregados", clientesDb.length);
    } catch (err) {
      console.error("[AppContext] Erro ao recarregar clientes:", err);
    }
  };

  const addCliente = async (data: Omit<Cliente, "id" | "userId" | "createdAt">) => {
    const novo = await createClienteApi(data);
    if (!novo) return null;
    setClientes((prev) => [...prev, novo]);
    return novo;
  };

  const updateCliente = async (id: string, patch: Partial<Cliente>) => {
    const atualizado = await updateClienteApi(id, patch);
    if (!atualizado) return null;
    setClientes((prev) => prev.map((c) => (c.id === id ? atualizado : c)));
    return atualizado;
  };

  const removeCliente = async (id: string) => {
    await deleteClienteApi(id);
    setClientes((prev) => prev.filter((c) => c.id !== id));
  };

  const addEvento = async (data: Omit<Evento, "id" | "userId">) => {
    console.log("[AppContext.addEvento] 1. Chamado com data:", data);
    
    const novo = await createEventoApi(data);
    
    console.log("[AppContext.addEvento] 2. Retorno de createEventoApi:", novo);
    
    if (!novo) {
      console.error("[AppContext.addEvento] 3. ERRO: createEventoApi retornou null");
      return;
    }
    
    console.log("[AppContext.addEvento] 4. Adicionando evento ao estado local");
    setEventos((prev) => [...prev, novo]);
    console.log("[AppContext.addEvento] 5. Evento adicionado com sucesso");
  };

  const updateEvento = async (id: string, patch: Partial<Evento>) => {
    const atualizado = await updateEventoApi(id, patch);
    if (!atualizado) return;
    setEventos((prev) => prev.map((e) => (e.id === id ? atualizado : e)));
  };

  const removeEvento = async (id: string) => {
    await deleteEventoApi(id);
    setEventos((prev) => prev.filter((e) => e.id !== id));
  };

  return (
    <AppContext.Provider
      value={{
        clientes,
        Eventos,
        addCliente,
        updateCliente,
        removeCliente,
        refreshClientes,
        addEvento,
        updateEvento,
        removeEvento,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useAppContext deve ser usado dentro de AppProvider");
  return ctx;
};