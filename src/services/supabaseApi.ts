import { supabase } from "@/lib/supabaseClient";
import { parseISO } from "date-fns";
import {
  calcularDataFim,
  gerarOcorrencias,
  gerarVencimentos,
  aplicarDiaFixo,
  toISODate,
} from "@/lib/recorrencia";
import type { Cliente, Evento, ServicoRecorrente } from "@/types";

// helpers de auth seguros
async function getCurrentUserId() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw error ?? new Error("Usuário não autenticado");
  }
  return user.id;
}

// Tipo Adicional (ajuste se tiver definido em outro arquivo)
export type Adicional = {
  id: string;
  userId: string;
  nome: string;
  descricao?: string | null;
  modelo: "valor_pessoa" | "valor_unidade" | "valor_festa";
  valor: number;
  observacao?: string | null;
  ativo: boolean;
  createdAt: string;
};

/**
 * CLIENTES – sempre filtrar por user_id
 */
export async function getClientesApi(): Promise<Cliente[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from("clientes")
      .select(
        `id, user_id, nome, sobrenome, numero_celular, numero_telefone, email, cidade, endereco, observacoes, created_at`
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Erro ao buscar clientes:", error);
      return [];
    }

    // buscar piscinas associadas a esses clientes e mapear por client_id
    const clienteIds = (data || []).map((c: any) => c.id).filter(Boolean);
    const piscinasByCliente: Record<string, any> = {};
    if (clienteIds.length > 0) {
      try {
        // garantir que IDs sejam strings simples
        const sanitizedIds = clienteIds.map((id: any) => String(id));
        // validar formato UUID para evitar queries inválidas
        const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
        const validIds = sanitizedIds.filter((id: string) => uuidRegex.test(id));
        if (validIds.length !== sanitizedIds.length) {
          console.warn("[getClientesApi] Alguns clienteIds foram filtrados por não parecerem UUIDs", { sanitizedIds, validIds });
        }

        if (validIds.length === 0) {
          console.warn("[getClientesApi] Nenhum clienteId válido para buscar piscinas. Pulando query de piscinas.");
        } else {
          // chunking para evitar possíveis limites de URL/array
          const chunkSize = 50;
          for (let i = 0; i < validIds.length; i += chunkSize) {
            const chunk = validIds.slice(i, i + chunkSize);
            const { data: piscinasData, error: piscinasError, status } = await supabase
              .from("piscinas")
              .select("id, client_id, tipo, tamanho, endereco, observacoes, created_at")
              .in("client_id", chunk as any[]);

            if (piscinasError) {
              console.error("[getClientesApi] Erro ao buscar piscinas (chunk):", piscinasError, "status:", status, "chunkSize:", chunk.length, "chunkSample:", chunk.slice(0,3));
              // continuar para próximos chunks
              continue;
            }

            if (piscinasData) {
              (piscinasData || []).forEach((p: any) => {
                piscinasByCliente[p.client_id] = p;
              });
            }
          }
        }
      } catch (fetchErr) {
        console.error("Exception ao buscar piscinas:", fetchErr);
      }
    }

    // mapeia snake_case -> camelCase (ajustado para novo schema) e inclui piscina quando disponível
    return (
      data?.map((c: any) => {
        const p = piscinasByCliente[c.id];
        return {
          id: c.id,
          userId: c.user_id,
          nome: c.nome,
          sobrenome: c.sobrenome,
          numeroCelular: c.numero_celular,
          numeroTelefone: c.numero_telefone ?? undefined,
          email: c.email,
          cidade: c.cidade,
          endereco: c.endereco,
          observacoes: c.observacoes ?? undefined,
          createdAt: c.created_at,
          piscina: p
            ? {
                id: p.id,
                tipo: p.tipo,
                tamanho: p.tamanho,
                endereco: p.endereco,
                observacoes: p.observacoes,
                createdAt: p.created_at,
              }
            : null,
        };
      }) || []
    );
  } catch (err) {
    console.error("getClientesApi - erro de autenticação:", err);
    return [];
  }
}

export async function createClienteApi(
  cliente: any
): Promise<Cliente | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn("[supabaseApi] createClienteApi chamado sem user autenticado — faça login antes de criar clientes");
      return null;
    }

    // mapeia para nomes exatos do novo schema
    const payload: any = {
      user_id: userId,
      nome: cliente.nome,
      sobrenome: cliente.sobrenome ?? "",
      numero_celular: cliente.telefone ?? cliente.numeroCelular ?? null,
      numero_telefone: cliente.numeroTelefone ?? null,
      email: cliente.email,
      cidade: cliente.cidade ?? "",
      endereco: cliente.endereco ?? "",
      observacoes: cliente.observacoes ?? null,
    };

    const { data, error } = await supabase
      .from("clientes")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error("Erro ao criar cliente:", error);
      return null;
    }

    // depois de criar cliente, criar piscina se fornecida
    const c = data as any;
    try {
      if (cliente.piscina && cliente.piscina.tamanho) {
        let poolPayload: any = {
          client_id: c.id,
          user_id: userId,
          tipo: cliente.piscina.tipo ?? null,
          tamanho: cliente.piscina.tamanho,
          endereco: cliente.piscina.endereco ?? null,
          observacoes: cliente.piscina.observacoes ?? null,
        };

        // tentativa padrão: com user_id
        const { data: poolData, error: poolError } = await supabase.from("piscinas").insert(poolPayload).select().single().maybeSingle();
        if (poolError) {
          const errStr = JSON.stringify(poolError);
          console.error("Erro ao criar piscina (tentativa com user_id):", poolError);

          // se a causa aparenta ser coluna user_id ausente, tenta novamente sem user_id
          if (errStr.includes("user_id") || (poolError.message && poolError.message.includes("user_id")) || (poolError.details && String(poolError.details).includes("user_id"))) {
            console.warn("[createClienteApi] Servidor rejeitou coluna user_id — reenviando payload sem user_id");
            delete poolPayload.user_id;
            const { data: poolData2, error: poolError2 } = await supabase.from("piscinas").insert(poolPayload).select().single().maybeSingle();
            if (poolError2) {
              console.error("Erro ao criar piscina (tentativa sem user_id):", poolError2);
            }
          }
        }
      }
    } catch (pErr) {
      console.error("Erro no fluxo de criação de piscina:", pErr);
    }

    // buscar piscina criada (se houver) para incluir no retorno
    let createdPiscina = null;
    try {
      const { data: poolRow, error: poolRowError } = await supabase
        .from("piscinas")
        .select("id, client_id, tipo, tamanho, endereco, observacoes, created_at")
        .eq("client_id", c.id)
        .limit(1)
        .maybeSingle();
      if (poolRowError) {
        console.error("Erro ao buscar piscina criada:", poolRowError);
      } else if (poolRow) {
        createdPiscina = {
          id: poolRow.id,
          tipo: poolRow.tipo,
          tamanho: poolRow.tamanho,
          endereco: poolRow.endereco,
          observacoes: poolRow.observacoes,
          createdAt: poolRow.created_at,
        };
      }
    } catch (pErr) {
      console.error("Exception ao buscar piscina criada:", pErr);
    }

    // converte de volta para o tipo Cliente da app (preenchendo campos esperados)
    return {
      id: c.id,
      userId: c.user_id,
      nome: c.nome,
      sobrenome: c.sobrenome,
      numeroCelular: c.numero_celular,
      numeroTelefone: c.numero_telefone ?? undefined,
      email: c.email,
      cidade: c.cidade,
      endereco: c.endereco,
      observacoes: c.observacoes ?? undefined,
      createdAt: c.created_at,
      piscina: createdPiscina,
    } as Cliente;
  } catch (err) {
    console.error("createClienteApi - erro de autenticação:", err);
    return null;
  }
}

export async function updateClienteApi(
  id: string,
  patch: Partial<Cliente>
): Promise<Cliente | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn("[supabaseApi] updateClienteApi chamado sem user autenticado");
      return null;
    }

    // monta patch só com campos presentes, já com nomes do novo schema
    const dbPatch: any = {};
    if (patch.nome !== undefined) dbPatch.nome = patch.nome;
    if (patch.sobrenome !== undefined) dbPatch.sobrenome = patch.sobrenome;
    if ((patch as any).telefone !== undefined) dbPatch.numero_celular = (patch as any).telefone;
    if (patch.numeroCelular !== undefined) dbPatch.numero_celular = patch.numeroCelular;
    if (patch.numeroTelefone !== undefined) dbPatch.numero_telefone = patch.numeroTelefone ?? null;
    if (patch.email !== undefined) dbPatch.email = patch.email;
    if (patch.cidade !== undefined) dbPatch.cidade = patch.cidade;
    if (patch.endereco !== undefined) dbPatch.endereco = patch.endereco;
    if ((patch as any).observacoes !== undefined) dbPatch.observacoes = (patch as any).observacoes ?? null;

    const { data, error } = await supabase
      .from("clientes")
      .update(dbPatch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      console.error("Erro ao atualizar cliente:", error);
      return null;
    }

    const c = data as any;

    // Se veio objeto piscina no patch, upsert na tabela piscinas (procura por client_id)
    try {
      const piscinaObj = (patch as any).piscina;
      if (piscinaObj) {
        // procura piscina existente do cliente
        const { data: existingPiscina } = await supabase
          .from("piscinas")
          .select("*")
          .eq("client_id", id)
          .limit(1)
          .maybeSingle();

        const poolPayload: any = {
          client_id: id,
          user_id: userId,
          tipo: piscinaObj.tipo ?? null,
          tamanho: piscinaObj.tamanho ?? null,
          endereco: piscinaObj.endereco ?? null,
          observacoes: piscinaObj.observacoes ?? null,
        };

        if (existingPiscina && (existingPiscina as any).id) {
          // tenta update incluindo user_id, se falhar por causa de coluna ausente, tenta sem
          let updatePayload = { ...poolPayload };
          const { error: updateError } = await supabase.from("piscinas").update(updatePayload).eq("id", (existingPiscina as any).id);
          if (updateError) {
            const uErrStr = JSON.stringify(updateError);
            console.error("Erro ao atualizar piscina (tentativa com user_id):", updateError);
            if (uErrStr.includes("user_id") || (updateError.message && updateError.message.includes("user_id"))) {
              console.warn("[updateClienteApi] Servidor rejeitou coluna user_id durante update — reenviando sem user_id");
              delete updatePayload.user_id;
              const { error: updateError2 } = await supabase.from("piscinas").update(updatePayload).eq("id", (existingPiscina as any).id);
              if (updateError2) console.error("Erro ao atualizar piscina (tentativa sem user_id):", updateError2);
            }
          }
        } else {
          // insert
          let insertPayload: any = { ...poolPayload };
          const { error: insertError } = await supabase.from("piscinas").insert(insertPayload);
          if (insertError) {
            const iErrStr = JSON.stringify(insertError);
            console.error("Erro ao inserir piscina (tentativa com user_id):", insertError);
            if (iErrStr.includes("user_id") || (insertError.message && insertError.message.includes("user_id"))) {
              console.warn("[updateClienteApi] Servidor rejeitou coluna user_id durante insert — reenviando sem user_id");
              delete insertPayload.user_id;
              const { error: insertError2 } = await supabase.from("piscinas").insert(insertPayload);
              if (insertError2) console.error("Erro ao inserir piscina (tentativa sem user_id):", insertError2);
            }
          }
        }
      }
    } catch (pErr) {
      console.error("Erro ao upsert de piscina:", pErr);
    }

    // buscar piscina atualizada/criada (se houver) para incluir no retorno
    let updatedPiscina = null;
    try {
      const { data: poolRow, error: poolRowError } = await supabase
        .from("piscinas")
        .select("id, client_id, tipo, tamanho, endereco, observacoes, created_at")
        .eq("client_id", c.id)
        .limit(1)
        .maybeSingle();
      if (poolRowError) {
        console.error("Erro ao buscar piscina atualizada:", poolRowError);
      } else if (poolRow) {
        updatedPiscina = {
          id: poolRow.id,
          tipo: poolRow.tipo,
          tamanho: poolRow.tamanho,
          endereco: poolRow.endereco,
          observacoes: poolRow.observacoes,
          createdAt: poolRow.created_at,
        };
      }
    } catch (pErr) {
      console.error("Exception ao buscar piscina atualizada:", pErr);
    }

    return {
      id: c.id,
      userId: c.user_id,
      nome: c.nome,
      sobrenome: c.sobrenome,
      numeroCelular: c.numero_celular,
      numeroTelefone: c.numero_telefone ?? undefined,
      email: c.email,
      cidade: c.cidade,
      endereco: c.endereco,
      observacoes: c.observacoes ?? undefined,
      createdAt: c.created_at,
      piscina: updatedPiscina,
    } as Cliente;
  } catch (err) {
    console.error("updateClienteApi - erro de autenticação:", err);
    return null;
  }
}

// --- Serviços / Pagamentos (novo fluxo para /Eventos página que agora será Serviços) ---

export async function getClientesSummary(): Promise<{id:string, nome:string, sobrenome:string}[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];
    const { data, error } = await supabase
      .from('clientes')
      .select('id, nome, sobrenome')
      .eq('user_id', userId)
      .order('nome', { ascending: true });
    if (error) {
      console.error('[getClientesSummary] Erro:', error);
      return [];
    }
    return (data || []).map((c:any)=>({id:c.id, nome:c.nome, sobrenome:c.sobrenome}));
  } catch(err){
    console.error('[getClientesSummary] Exception:', err);
    return [];
  }
}

export async function getClienteWithPiscinas(clienteId: string){
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;
    const { data: clienteData, error: clienteError } = await supabase
      .from('clientes')
      .select('id, nome, sobrenome, email, numero_celular, endereco')
      .eq('id', clienteId)
      .eq('user_id', userId)
      .single();
    if (clienteError) {
      console.error('[getClienteWithPiscinas] Erro ao buscar cliente:', clienteError);
      return null;
    }

    const { data: piscinasData, error: piscinasError } = await supabase
      .from('piscinas')
      .select('id, client_id, tipo, tamanho, endereco')
      .eq('user_id', userId)
      .eq('client_id', clienteId);

    if (piscinasError) {
      console.error('[getClienteWithPiscinas] Erro ao buscar piscinas:', piscinasError);
    }

    return {
      cliente: clienteData,
      piscinas: piscinasData || [],
    };
  } catch(err){
    console.error('[getClienteWithPiscinas] Exception:', err);
    return null;
  }
}

/**
 * Cria servico + cobranca + pagamento (opcional) em sequência.
 * Tenta rollback manual caso alguma etapa falhe para garantir atomicidade aproximada.
 */
export async function createServicoComCobrancaEPagamento(payload: {
  clienteId: string;
  piscinaId: string;
  tipo_servico?: string | null;
  data_agendamento?: string | null; // YYYY-MM-DD
  horario?: string | null; // HH:MM
  observacoes?: string | null;
  valor: number | null; // valor da cobranca
  data_vencimento?: string | null; // YYYY-MM-DD
  valor_entrada?: number | null;
  forma_pagamento?: string | null;
}) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error('Usuário não autenticado');
    }

    // 1) inserir servico
    const servPayload: any = {
      user_id: userId,
      client_id: payload.clienteId,
      client_id: payload.clienteId, // compatibiliza possíveis nomes
      piscina_id: payload.piscinaId,
      tipo_servico: payload.tipo_servico ?? null,
      data_agendamento: payload.data_agendamento ?? null,
      horario: payload.horario ?? null,
      status: 'agendado',
      observacoes: payload.observacoes ?? null,
    };

    const { data: servData, error: servError } = await supabase.from('servicos').insert(servPayload).select('*').single();
    if (servError || !servData) {
      console.error('[createServico] Erro ao criar servico:', servError);
      throw servError ?? new Error('Erro ao criar servico');
    }
    const servicoId = servData.id;

    // 2) criar cobranca
    const cobrancaPayload: any = {
      user_id: userId,
      client_id: payload.clienteId,
      servico_id: servicoId,
      valor: payload.valor ?? null,
      data_vencimento: payload.data_vencimento ?? null,
      status: 'pendente',
    };

    const { data: cobrData, error: cobrError } = await supabase.from('cobrancas').insert(cobrancaPayload).select('*').single();
    if (cobrError || !cobrData) {
      console.error('[createCobranca] Erro ao criar cobranca:', cobrError);
      // rollback servico
      await supabase.from('servicos').delete().eq('id', servicoId);
      throw cobrError ?? new Error('Erro ao criar cobranca');
    }
    const cobrancaId = cobrData.id;

    // 3) pagamento de entrada (opcional)
    if (payload.valor_entrada && Number(payload.valor_entrada) > 0) {
      const pagamentoPayload: any = {
        user_id: userId,
        cobranca_id: cobrancaId,
        data_pagamento: new Date().toISOString().slice(0,10),
        valor_pago: payload.valor_entrada,
        forma_pagamento: payload.forma_pagamento ?? null,
        observacoes: null,
      };

      const { data: pagData, error: pagError } = await supabase.from('pagamentos').insert(pagamentoPayload).select('*').single();
      if (pagError || !pagData) {
        console.error('[createPagamento] Erro ao criar pagamento:', pagError);
        // rollback cobranca + servico
        await supabase.from('cobrancas').delete().eq('id', cobrancaId);
        await supabase.from('servicos').delete().eq('id', servicoId);
        throw pagError ?? new Error('Erro ao criar pagamento');
      }
    }

    // sucesso
    return {
      servico: servData,
      cobranca: cobrData,
    };
  } catch (err) {
    console.error('[createServicoComCobrancaEPagamento] Exception:', err);
    throw err;
  }
}

// --- Serviços (calendar integration) ---

export async function getServicosApi() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('servicos')
      .select('id, user_id, client_id, client_id, piscina_id, tipo_servico, data_agendamento, horario, status, observacoes, created_at')
      .eq('user_id', userId)
      .order('data_agendamento', { ascending: true });

    if (error) {
      console.error('[getServicosApi] Erro ao buscar servicos:', error);
      return [];
    }

    const servicos = data || [];
    const clienteIds = Array.from(new Set(servicos.map((s:any) => s.client_id || s.client_id).filter(Boolean)));
    const piscinaIds = Array.from(new Set(servicos.map((s:any) => s.piscina_id).filter(Boolean)));

    const clientesMap: Record<string, any> = {};
    if (clienteIds.length > 0) {
      const { data: clientesData, error: clientesError } = await supabase
        .from('clientes')
        .select('id, nome, sobrenome')
        .in('id', clienteIds);
      if (clientesError) console.error('[getServicosApi] Erro ao buscar clientes associados:', clientesError);
      else (clientesData || []).forEach((c:any) => { clientesMap[c.id] = c; });
    }

    const piscinasMap: Record<string, any> = {};
    if (piscinaIds.length > 0) {
      const { data: piscinasData, error: piscinasError } = await supabase
        .from('piscinas')
        .select('id, client_id, tipo, tamanho, endereco')
        .in('id', piscinaIds);
      if (piscinasError) console.error('[getServicosApi] Erro ao buscar piscinas associadas:', piscinasError);
      else (piscinasData || []).forEach((p:any) => { piscinasMap[p.id] = p; });
    }

    return (servicos as any[]).map(s => ({
      id: s.id,
      userId: s.user_id,
      clienteId: s.client_id || s.client_id,
      clienteNome: clientesMap[s.client_id || s.client_id] ? `${clientesMap[s.client_id || s.client_id].nome} ${clientesMap[s.client_id || s.client_id].sobrenome}` : '',
      piscinaId: s.piscina_id,
      piscina: piscinasMap[s.piscina_id] || null,
      tipoServico: s.tipo_servico,
      data: s.data_agendamento || null,
      horario: s.horario || null,
      status: s.status || 'pendente',
      observacoes: s.observacoes || null,
      createdAt: s.created_at,
    }));
  } catch (err) {
    console.error('[getServicosApi] Exception:', err);
    return [];
  }
}

// --- Eventos ---

export async function getEventosApi(): Promise<Evento[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    console.log("[getEventosApi] Iniciando busca para user:", userId);
    const startTime = performance.now();

    const { data, error } = await supabase
      .from("Eventos")
      .select("*")
      .eq("user_id", userId)
      .order("data", { ascending: false });

    const endTime = performance.now();
    console.log(`[getEventosApi] Busca concluída em ${(endTime - startTime).toFixed(2)}ms. Eventos encontrados: ${data?.length || 0}`);

    if (error) {
      console.error("[getEventosApi] Erro ao buscar Eventos:", error);
      return [];
    }

    if (!data || data.length === 0) {
      console.log("[getEventosApi] Nenhum evento encontrado");
      return [];
    }

    // Buscar aniversariantes para todos os Eventos
    const eventoIds = data.map(e => e.id);
    const { data: aniversariantesData, error: anivError } = await supabase
      .from("evento_aniversariantes")
      .select("*")
      .in("evento_id", eventoIds)
      .eq("user_id", userId);

    if (anivError) {
      console.error("[getEventosApi] Erro ao buscar aniversariantes:", anivError);
    }

    // Mapear aniversariantes por evento_id
    const aniversariantesPorEvento: Record<string, any[]> = {};
    aniversariantesData?.forEach(aniv => {
      if (!aniversariantesPorEvento[aniv.evento_id]) {
        aniversariantesPorEvento[aniv.evento_id] = [];
      }
      aniversariantesPorEvento[aniv.evento_id].push({
        id: aniv.id,
        nome: aniv.nome,
        idade: aniv.idade,
      });
    });

    // Mapeamento rápido com aniversariantes
    const mapped = data.map((ev: any) => ({
      id: ev.id,
      userId: ev.user_id,
      titulo: ev.titulo || "",
      clienteId: ev.client_id || "",
      clienteNome: ev.cliente_nome || "",
      data: ev.data || "",
      horaInicio: ev.hora_inicio || "",
      horaFim: ev.hora_fim,
      tipo: ev.tipo || "festa",
      status: ev.status || "pendente",
      observacoes: ev.observacoes,
      valor: Number(ev.valor) || 0,
      pacoteId: ev.pacote_id || "",
      convidados: ev.convidados,
      decoracao: ev.decoracao,
      equipeId: ev.equipe_id,
      valorEntrada: ev.valor_entrada,
      formaPagamento: ev.forma_pagamento,
      aniversariantes: aniversariantesPorEvento[ev.id] || [],
      adicionaisIds: ev.adicionais_ids || [],
      adicionaisObservacoes: ev.adicionais_observacoes || [],
      adicionaisQuantidade: ev.adicionais_quantidade || [],
      equipeProfissionais: ev.equipe_profissionais || [],
    } as Evento));

    console.log("[getEventosApi] Mapeamento concluído:", mapped.length, "Eventos");
    return mapped;
  } catch (err) {
    console.error("[getEventosApi] Exception:", err);
    return [];
  }
}

export async function createEventoApi(
  evento: Omit<Evento, "id" | "userId">
): Promise<Evento | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return null;

    // 1. Inserir evento principal (SEM os campos JSONB)
    const { data: eventoData, error: eventoError } = await supabase
      .from("Eventos")
      .insert({
        user_id: userId,
        titulo: evento.titulo,
        client_id: evento.clienteId,
        cliente_nome: evento.clienteNome,
        data: evento.data,
        hora_inicio: evento.horaInicio,
        hora_fim: evento.horaFim,
        tipo: evento.tipo,
        status: evento.status,
        observacoes: evento.observacoes,
        valor: evento.valor,
        pacote_id: evento.pacoteId,
        convidados: evento.convidados,
        decoracao: evento.decoracao,
        equipe_id: evento.equipeId,
        valor_entrada: evento.valorEntrada,
        forma_pagamento: evento.formaPagamento,
      })
      .select()
      .single();

    if (eventoError || !eventoData) {
      console.error("[createEventoApi] Erro ao criar evento:", eventoError);
      return null;
    }

    const eventoId = eventoData.id;

    // 2. Inserir aniversariantes
    if (evento.aniversariantes && evento.aniversariantes.length > 0) {
      const { error: anivError } = await supabase
        .from("evento_aniversariantes")
        .insert(
          evento.aniversariantes.map((a) => ({
            user_id: userId,
            evento_id: eventoId,
            nome: a.nome,
            idade: a.idade,
          }))
        );
      if (anivError) console.error("Erro ao inserir aniversariantes:", anivError);
    }

    // 3. Inserir adicionais
    if (evento.adicionaisIds && evento.adicionaisIds.length > 0) {
      const { error: addError } = await supabase
        .from("evento_adicionais")
        .insert(
          evento.adicionaisIds.map((adicionalId) => ({
            user_id: userId,
            evento_id: eventoId,
            adicional_id: adicionalId,
          }))
        );
      if (addError) console.error("Erro ao inserir adicionais:", addError);
    }

    // 4. Inserir observações de adicionais
    if (evento.adicionaisObservacoes && evento.adicionaisObservacoes.length > 0) {
      const { error: obsError } = await supabase
        .from("evento_adicionais_observacoes")
        .insert(
          evento.adicionaisObservacoes.map((obs) => ({
            user_id: userId,
            evento_id: eventoId,
            adicional_id: obs.adicionalId,
            observacao: obs.observacao,
          }))
        );
      if (obsError) console.error("Erro ao inserir observações:", obsError);
    }

    // 5. Inserir quantidades de adicionais
    if (evento.adicionaisQuantidade && evento.adicionaisQuantidade.length > 0) {
      const { error: qtdError } = await supabase
        .from("evento_adicionais_quantidade")
        .insert(
          evento.adicionaisQuantidade.map((qtd) => ({
            user_id: userId,
            evento_id: eventoId,
            adicional_id: qtd.adicionalId,
            quantidade: qtd.quantidade,
          }))
        );
      if (qtdError) console.error("Erro ao inserir quantidades:", qtdError);
    }

    // 6. Inserir profissionais da equipe
    if (evento.equipeProfissionais && evento.equipeProfissionais.length > 0) {
      const { error: profError } = await supabase
        .from("evento_equipe_profissionais")
        .insert(
          evento.equipeProfissionais.map((p) => ({
            user_id: userId,
            evento_id: eventoId,
            profissional_id: p.id,
            nome: p.nome,
            quantidade: p.quantidade,
          }))
        );
      if (profError) console.error("Erro ao inserir profissionais:", profError);
    }

    // Retornar o evento com os dados relacionados carregados
    return {
      ...eventoData,
      aniversariantes: evento.aniversariantes || [],
      equipeProfissionais: evento.equipeProfissionais || [],
      adicionaisIds: evento.adicionaisIds || [],
      adicionaisObservacoes: evento.adicionaisObservacoes || [],
      adicionaisQuantidade: evento.adicionaisQuantidade || [],
    } as Evento;
  } catch (err) {
    console.error("[createEventoApi] EXCEPTION:", err);
    return null;
  }
}

export async function updateEventoApi(
  id: string,
  patch: Partial<Evento>
): Promise<Evento | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn("[supabaseApi] updateEventoApi chamado sem user autenticado");
      return null;
    }

    // Preparar patch apenas com campos da tabela Eventos (sem arrays relacionados)
    const dbPatch: any = {};
    if (patch.titulo !== undefined) dbPatch.titulo = patch.titulo;
    if (patch.clienteId !== undefined) dbPatch.client_id = patch.clienteId;
    if (patch.clienteNome !== undefined) dbPatch.cliente_nome = patch.clienteNome;
    if (patch.data !== undefined) dbPatch.data = patch.data;
    if (patch.horaInicio !== undefined) dbPatch.hora_inicio = patch.horaInicio;
    if (patch.horaFim !== undefined) dbPatch.hora_fim = patch.horaFim;
    if (patch.tipo !== undefined) dbPatch.tipo = patch.tipo;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.observacoes !== undefined) dbPatch.observacoes = patch.observacoes;
    if (patch.valor !== undefined) dbPatch.valor = patch.valor;
    if (patch.pacoteId !== undefined) dbPatch.pacote_id = patch.pacoteId;
    if (patch.convidados !== undefined) dbPatch.convidados = patch.convidados;
    if (patch.decoracao !== undefined) dbPatch.decoracao = patch.decoracao;
    if (patch.equipeId !== undefined) dbPatch.equipe_id = patch.equipeId;
    if (patch.valorEntrada !== undefined) dbPatch.valor_entrada = patch.valorEntrada;
    if (patch.formaPagamento !== undefined) dbPatch.forma_pagamento = patch.formaPagamento;

    const { data, error } = await supabase
      .from("Eventos")
      .update(dbPatch)
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (error) {
      console.error("Erro ao atualizar evento:", error);
      return null;
    }

    // Se houver aniversariantes no patch, atualizar tabela evento_aniversariantes
    if (patch.aniversariantes) {
      // Deletar aniversariantes antigos
      await supabase
        .from("evento_aniversariantes")
        .delete()
        .eq("evento_id", id)
        .eq("user_id", userId);

      // Inserir novos aniversariantes
      if (patch.aniversariantes.length > 0) {
        const { error: anivError } = await supabase
          .from("evento_aniversariantes")
          .insert(
            patch.aniversariantes.map((a) => ({
              user_id: userId,
              evento_id: id,
              nome: a.nome,
              idade: a.idade,
            }))
          );
        if (anivError) {
          console.error("Erro ao atualizar aniversariantes:", anivError);
        }
      }
    }

    return {
      ...data,
      aniversariantes: patch.aniversariantes || [],
    } as Evento;
  } catch (err) {
    console.error("updateEventoApi - erro de autenticação:", err);
    return null;
  }
}

export async function deleteEventoApi(id: string): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn("[supabaseApi] deleteEventoApi chamado sem user autenticado");
      return;
    }

    const { error } = await supabase
      .from("Eventos")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("Erro ao remover evento:", error);
    }
  } catch (err) {
    console.error("deleteEventoApi - erro de autenticação:", err);
  }
}

// --- ADICIONAIS ---

export async function getAdicionaisApi(): Promise<Adicional[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from("adicionais")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erro ao buscar adicionais:", error);
      return [];
    }
    return (
      data?.map((a: any) => ({
        id: a.id,
        userId: a.user_id,
        nome: a.nome,
        descricao: a.descricao,
        modelo: a.modelo,
        valor: a.valor,
        observacao: a.observacao,
        ativo: a.ativo,
        createdAt: a.created_at,
      })) || []
    );
  } catch (err) {
    console.error("getAdicionaisApi - erro de autenticação:", err);
    return [];
  }
}

export async function createAdicionalApi(
  adicional: Omit<Adicional, "id" | "userId" | "createdAt">
): Promise<Adicional | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn("[supabaseApi] createAdicionalApi chamado sem user autenticado");
      return null;
    }

    const payload = {
      user_id: userId,
      nome: adicional.nome,
      descricao: adicional.descricao ?? null,
      modelo: adicional.modelo,
      valor: adicional.valor,
      observacao: adicional.observacao ?? null,
      ativo: adicional.ativo,
    };

    const { data, error } = await supabase
      .from("adicionais")
      .insert(payload)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Erro ao criar adicional:", error);
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      nome: data.nome,
      descricao: data.descricao ?? null,
      modelo: data.modelo,
      valor: Number(data.valor),
      observacao: data.observacao ?? null,
      ativo: data.ativo,
      createdAt: data.created_at,
    };
  } catch (err) {
    console.error("createAdicionalApi - erro de autenticação:", err);
    return null;
  }
}

export async function updateAdicionalApi(
  id: string,
  patch: Partial<Adicional>
): Promise<Adicional | null> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn("[supabaseApi] updateAdicionalApi chamado sem user autenticado");
      return null;
    }

    const dbPatch: any = {};
    if (patch.nome !== undefined) dbPatch.nome = patch.nome;
    if (patch.descricao !== undefined) dbPatch.descricao = patch.descricao ?? null;
    if (patch.modelo !== undefined) dbPatch.modelo = patch.modelo;
    if (patch.valor !== undefined) dbPatch.valor = patch.valor;
    if (patch.observacao !== undefined) dbPatch.observacao = patch.observacao ?? null;
    if (patch.ativo !== undefined) dbPatch.ativo = patch.ativo;

    const { data, error } = await supabase
      .from("adicionais")
      .update(dbPatch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error || !data) {
      console.error("Erro ao atualizar adicional:", error);
      return null;
    }

    return {
      id: data.id,
      userId: data.user_id,
      nome: data.nome,
      descricao: data.descricao ?? null,
      modelo: data.modelo,
      valor: Number(data.valor),
      observacao: data.observacao ?? null,
      ativo: data.ativo,
      createdAt: data.created_at,
    };
  } catch (err) {
    console.error("updateAdicionalApi - erro de autenticação:", err);
    return null;
  }
}

export async function deleteAdicionalApi(id: string): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      console.warn("[supabaseApi] deleteAdicionalApi chamado sem user autenticado");
      return;
    }

    const { error } = await supabase
      .from("adicionais")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      console.error("Erro ao remover adicional:", error);
    }
  } catch (err) {
    console.error("deleteAdicionalApi - erro de autenticação:", err);
  }
}

// ===========================================================================
// SERVIÇOS RECORRENTES
// ===========================================================================

export type CreateRecorrentePayload = {
  clientId: string;
  piscinaId: string;
  tipoServico?: string | null;
  diasSemana: number[];        // 0=Dom..6=Sáb
  turno: "manha" | "tarde" | "noite";
  horario: string;             // 'HH:mm'
  dataInicio: string;          // 'yyyy-MM-dd'
  vigenciaQtd: number;
  vigenciaUnidade: "semanas" | "meses";
  diaVencimento: number;       // 1..31
  cobrancaInicio: string;      // 'yyyy-MM-dd' (mês significativo)
  numMensalidades: number;
  valorMensalidade: number;
  observacoes?: string | null;
};

/**
 * Cria a série recorrente, os atendimentos (servicos) e as mensalidades
 * (cobrancas) de uma vez. Em caso de falha, faz rollback por recorrencia_id.
 */
export async function createServicoRecorrente(payload: CreateRecorrentePayload) {
  const userId = await getCurrentUserId();

  const dataInicioDate = parseISO(payload.dataInicio);
  const dataFimDate = calcularDataFim(
    dataInicioDate,
    payload.vigenciaQtd,
    payload.vigenciaUnidade
  );

  // 1) série (pai)
  const { data: serie, error: serieError } = await supabase
    .from("servicos_recorrentes")
    .insert({
      user_id: userId,
      client_id: payload.clientId,
      piscina_id: payload.piscinaId,
      tipo_servico: payload.tipoServico ?? null,
      dias_semana: payload.diasSemana,
      turno: payload.turno,
      horario: payload.horario,
      data_inicio: payload.dataInicio,
      vigencia_qtd: payload.vigenciaQtd,
      vigencia_unidade: payload.vigenciaUnidade,
      data_fim: toISODate(dataFimDate),
      dia_vencimento: payload.diaVencimento,
      cobranca_inicio: payload.cobrancaInicio,
      num_mensalidades: payload.numMensalidades,
      valor_mensalidade: payload.valorMensalidade,
      status: "ativo",
      observacoes: payload.observacoes ?? null,
    })
    .select("id")
    .single();

  if (serieError || !serie) {
    throw serieError ?? new Error("Erro ao criar série recorrente");
  }

  const recorrenciaId = serie.id as string;

  try {
    // 2) atendimentos (servicos)
    const ocorrencias = gerarOcorrencias(
      dataInicioDate,
      dataFimDate,
      payload.diasSemana
    );
    if (ocorrencias.length > 0) {
      const servicosRows = ocorrencias.map((d) => ({
        user_id: userId,
        client_id: payload.clientId,
        piscina_id: payload.piscinaId,
        tipo_servico: payload.tipoServico ?? null,
        data_agendamento: toISODate(d),
        horario: payload.horario,
        status: "agendado",
        recorrencia_id: recorrenciaId,
      }));
      const { error: servError } = await supabase
        .from("servicos")
        .insert(servicosRows);
      if (servError) throw servError;
    }

    // 3) mensalidades (cobrancas)
    const vencimentos = gerarVencimentos(
      parseISO(payload.cobrancaInicio),
      payload.diaVencimento,
      payload.numMensalidades
    );
    if (vencimentos.length > 0) {
      const cobrancasRows = vencimentos.map((d) => ({
        user_id: userId,
        client_id: payload.clientId,
        servico_id: null,
        recorrencia_id: recorrenciaId,
        valor: payload.valorMensalidade,
        data_vencimento: toISODate(d),
        status: "pendente",
      }));
      const { error: cobrError } = await supabase
        .from("cobrancas")
        .insert(cobrancasRows);
      if (cobrError) throw cobrError;
    }

    return {
      recorrenciaId,
      atendimentos: ocorrencias.length,
      cobrancas: vencimentos.length,
    };
  } catch (err) {
    // rollback manual (ordem: filhos antes do pai)
    await supabase.from("cobrancas").delete().eq("recorrencia_id", recorrenciaId);
    await supabase.from("servicos").delete().eq("recorrencia_id", recorrenciaId);
    await supabase.from("servicos_recorrentes").delete().eq("id", recorrenciaId);
    console.error("[createServicoRecorrente] rollback executado:", err);
    throw err;
  }
}

/** Lista as séries recorrentes do usuário (com nome do cliente). */
export async function getServicosRecorrentes(): Promise<
  (ServicoRecorrente & { cliente_nome?: string })[]
> {
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("servicos_recorrentes")
    .select("*, clientes(nome, sobrenome)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[getServicosRecorrentes]", error);
    return [];
  }

  return (data ?? []).map((s: any) => ({
    ...s,
    cliente_nome: s.clientes ? `${s.clientes.nome} ${s.clientes.sobrenome}` : "",
  }));
}

/**
 * Altera o dia fixo de vencimento da série e recalcula as cobranças FUTURAS
 * (data_vencimento >= hoje e status 'pendente'), preservando passadas/pagas.
 */
export async function updateDiaVencimentoRecorrente(
  recorrenciaId: string,
  novoDia: number
) {
  const userId = await getCurrentUserId();
  const hojeISO = toISODate(new Date());

  // 1) atualiza a série
  const { error: serieError } = await supabase
    .from("servicos_recorrentes")
    .update({ dia_vencimento: novoDia })
    .eq("id", recorrenciaId)
    .eq("user_id", userId);
  if (serieError) throw serieError;

  // 2) cobranças futuras pendentes
  const { data: futuras, error: fetchError } = await supabase
    .from("cobrancas")
    .select("id, data_vencimento")
    .eq("recorrencia_id", recorrenciaId)
    .eq("user_id", userId)
    .eq("status", "pendente")
    .gte("data_vencimento", hojeISO);
  if (fetchError) throw fetchError;

  // 3) recalcula cada uma dentro do seu próprio mês
  for (const c of futuras ?? []) {
    const novaData = aplicarDiaFixo(parseISO(c.data_vencimento), novoDia);
    const { error: updError } = await supabase
      .from("cobrancas")
      .update({ data_vencimento: toISODate(novaData) })
      .eq("id", c.id)
      .eq("user_id", userId);
    if (updError) throw updError;
  }

  return { atualizadas: (futuras ?? []).length };
}

/**
 * Cancela a série: status 'cancelado', remove atendimentos futuros não
 * concluídos e cobranças futuras pendentes. Preserva passado e pagamentos.
 */
export async function cancelarServicoRecorrente(recorrenciaId: string) {
  const userId = await getCurrentUserId();
  const hojeISO = toISODate(new Date());

  const { error: serieError } = await supabase
    .from("servicos_recorrentes")
    .update({ status: "cancelado" })
    .eq("id", recorrenciaId)
    .eq("user_id", userId);
  if (serieError) throw serieError;

  const { error: servError } = await supabase
    .from("servicos")
    .delete()
    .eq("recorrencia_id", recorrenciaId)
    .eq("user_id", userId)
    .gte("data_agendamento", hojeISO)
    .neq("status", "concluido");
  if (servError) throw servError;

  const { error: cobrError } = await supabase
    .from("cobrancas")
    .delete()
    .eq("recorrencia_id", recorrenciaId)
    .eq("user_id", userId)
    .gte("data_vencimento", hojeISO)
    .eq("status", "pendente");
  if (cobrError) throw cobrError;
}
