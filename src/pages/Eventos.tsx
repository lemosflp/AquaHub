import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Calendar, Clock, MapPin, Edit, CheckCircle2, Waves, DollarSign, X, CreditCard, History, RefreshCw, Trash2, Ban } from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { ServicoRecorrenteForm } from "@/components/ServicoRecorrenteForm";
import { ServicosRecorrentesList } from "@/components/ServicosRecorrentesList";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Cliente {
  id: string;
  nome: string;
  sobrenome: string;
  numero_celular: string;
  email: string;
}

interface Piscina {
  id: string;
  client_id: string;
  tipo: string | null;
  tamanho: string;
  endereco: string | null;
  observacoes: string | null;
}

interface Servico {
  id: string;
  user_id: string;
  client_id: string;
  piscina_id: string;
  tipo_servico: string | null;
  data_agendamento: string | null;
  horario: string | null;
  status: string | null;
  observacoes: string | null;
  created_at: string;
  recorrencia_id: string | null;
  cliente_nome?: string;
  piscina_tamanho?: string;
}

interface SerieRecorrente {
  id: string;
  dias_semana: number[];
  turno: string;
  horario: string;
  data_inicio: string;
  data_fim: string;
  vigencia_qtd: number;
  vigencia_unidade: string;
  dia_vencimento: number;
  num_mensalidades: number;
  valor_mensalidade: number;
  status: string;
  tipo_servico: string | null;
  observacoes: string | null;
}

interface Cobranca {
  id: string;
  servico_id: string | null;
  recorrencia_id: string | null;
  valor: number;
  data_vencimento: string;
  status: string | null;
}

interface Pagamento {
  id: string;
  cobranca_id: string;
  data_pagamento: string | null;
  valor_pago: number | null;
  forma_pagamento: string | null;
  observacoes: string | null;
  created_at: string;
}

interface FormData {
  clienteId: string;
  piscinaId: string;
  tipoServico: string;
  dataAgendamento: string;
  horario: string;
  status: string;
  observacoes: string;
  valor: number | undefined;
  dataVencimento: string;
  valorEntrada: number | undefined;
  formaPagamento: string;
}

interface NovoPagamentoForm {
  valorPago: number | undefined;
  formaPagamento: string;
  dataPagamento: string;
  observacoes: string;
}

const FORM_INITIAL: FormData = {
  clienteId: "",
  piscinaId: "",
  tipoServico: "",
  dataAgendamento: "",
  horario: "",
  status: "agendado",
  observacoes: "",
  valor: undefined,
  dataVencimento: "",
  valorEntrada: undefined,
  formaPagamento: "",
};

const PAGAMENTO_FORM_INITIAL: NovoPagamentoForm = {
  valorPago: undefined,
  formaPagamento: "",
  dataPagamento: new Date().toISOString().split("T")[0],
  observacoes: "",
};

const DIAS_SEMANA_LABEL: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

const TURNO_LABEL: Record<string, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Eventos() {
  const location = useLocation();
  const locationShowForm = (location.state as any)?.showForm as boolean | undefined;
  const locationEditId = (location.state as any)?.editId as string | undefined;
  const locationViewId = (location.state as any)?.viewId as string | undefined;
  const params = new URLSearchParams(location.search);
  const paramShowForm = params.get("showForm") === "true";
  const paramEditId = params.get("editId") ?? undefined;
  const paramViewId = params.get("viewId") ?? undefined;
  const { toast } = useToast();
  const navigate = useNavigate();

  const [showForm, setShowForm] = useState(!!locationShowForm || paramShowForm);
  const [modoCadastro, setModoCadastro] = useState<"avulso" | "recorrente">("avulso");
  const [recorrentesRefresh, setRecorrentesRefresh] = useState(0);
  const [editingServicoId, setEditingServicoId] = useState<string | null>(null);
  const [selectedServicoId, setSelectedServicoId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(FORM_INITIAL);

  // --- data ---
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [piscinas, setPiscinas] = useState<Piscina[]>([]);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [loadingClientes, setLoadingClientes] = useState(false);
  const [loadingPiscinas, setLoadingPiscinas] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // --- série recorrente do serviço selecionado ---
  const [selectedSerie, setSelectedSerie] = useState<SerieRecorrente | null>(null);
  const [loadingSerie, setLoadingSerie] = useState(false);
  const [atendimentosSerie, setAtendimentosSerie] = useState<Servico[]>([]);

  // --- ui ---
  const [searchTerm, setSearchTerm] = useState("");

  // --- pagamentos modal ---
  const [pagamentoModal, setPagamentoModal] = useState<{
    servicoId: string;
    clienteNome: string;
    cobranca: Cobranca | null;
    pagamentos: Pagamento[];
    loading: boolean;
  } | null>(null);
  const [novoPagamentoForm, setNovoPagamentoForm] = useState<NovoPagamentoForm>(PAGAMENTO_FORM_INITIAL);
  const [salvandoPagamento, setSalvandoPagamento] = useState(false);

  // --- cobranca dos detalhes ---
  const [selectedCobranca, setSelectedCobranca] = useState<Cobranca | null>(null);

  const showFormRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const hoje = new Date().toISOString().split("T")[0];

  // ---------------------------------------------------------------------------
  // Load clientes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function fetchClientes() {
      setLoadingClientes(true);
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) console.error('[Eventos] fetchClientes auth error:', authError);
      const userId = authData?.user?.id ?? null;

      const { data, error } = await supabase
        .from("clientes")
        .select("id, nome, sobrenome, numero_celular, email")
        .eq('user_id', userId)
        .order("nome");
      if (error) {
        toast({ title: "Erro ao carregar clientes", description: error.message, variant: "destructive" });
      } else {
        setClientes(data ?? []);
      }
      setLoadingClientes(false);
    }
    fetchClientes();
  }, []);

  // ---------------------------------------------------------------------------
  // Load servicos
  // ---------------------------------------------------------------------------
  useEffect(() => {
    fetchServicos();
  }, []);

  async function fetchServicos() {
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error('[Eventos] fetchServicos auth error:', authErr);
    const userId = authData?.user?.id ?? null;

    const { data, error } = await supabase
      .from("servicos")
      .select(`
        id, user_id, client_id, piscina_id,
        tipo_servico, data_agendamento, horario, status, observacoes, created_at,
        recorrencia_id,
        clientes(nome, sobrenome),
        piscinas(tamanho)
      `)
      .eq('user_id', userId)
      .order("data_agendamento", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar serviços", description: error.message, variant: "destructive" });
      return;
    }

    const seen = new Set<string>();
    const groupedData = (data ?? []).filter((servico: any) => {
      if (!servico.recorrencia_id) return true;
      if (seen.has(servico.recorrencia_id)) return false;
      seen.add(servico.recorrencia_id);
      return true;
    });

    const mapped: Servico[] = groupedData.map((s: any) => ({
      ...s,
      cliente_nome: s.clientes ? `${s.clientes.nome} ${s.clientes.sobrenome}` : "",
      piscina_tamanho: s.piscinas?.tamanho ?? "",
    }));

    setServicos(mapped);
  }

  // ---------------------------------------------------------------------------
  // Cobrança dos detalhes
  // ---------------------------------------------------------------------------
  async function fetchCobrancaDoServico(servico: Servico) {
    setSelectedCobranca(null);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error('[Eventos] fetchCobrancaDoServico auth error:', authErr);
    const userId = authData?.user?.id ?? null;

    if (servico.recorrencia_id) {
      const { data } = await supabase
        .from("cobrancas")
        .select("id, servico_id, recorrencia_id, valor, data_vencimento, status")
        .eq("recorrencia_id", servico.recorrencia_id)
        .eq("user_id", userId)
        .in("status", ["pendente", "parcial"])
        .order("data_vencimento", { ascending: true })
        .limit(1)
        .maybeSingle();
      setSelectedCobranca(data ?? null);
    } else {
      const { data } = await supabase
        .from("cobrancas")
        .select("id, servico_id, recorrencia_id, valor, data_vencimento, status")
        .eq("servico_id", servico.id)
        .eq("user_id", userId)
        .maybeSingle();
      setSelectedCobranca(data ?? null);
    }
  }

  // ---------------------------------------------------------------------------
  // Busca a série recorrente e todos os atendimentos
  // ---------------------------------------------------------------------------
  async function fetchSerieRecorrente(recorrenciaId: string) {
    setLoadingSerie(true);
    setSelectedSerie(null);
    setAtendimentosSerie([]);

    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

    const { data: serieData } = await supabase
      .from("servicos_recorrentes")
      .select("id, dias_semana, turno, horario, data_inicio, data_fim, vigencia_qtd, vigencia_unidade, dia_vencimento, num_mensalidades, valor_mensalidade, status, tipo_servico, observacoes")
      .eq("id", recorrenciaId)
      .eq("user_id", userId)
      .maybeSingle();

    if (serieData) setSelectedSerie(serieData);

    const { data: atendimentos } = await supabase
      .from("servicos")
      .select("id, user_id, client_id, piscina_id, tipo_servico, data_agendamento, horario, status, observacoes, created_at, recorrencia_id")
      .eq("recorrencia_id", recorrenciaId)
      .eq("user_id", userId)
      .order("data_agendamento", { ascending: true });

    setAtendimentosSerie((atendimentos ?? []).map((s: any) => ({ ...s })));
    setLoadingSerie(false);
  }

  // ---------------------------------------------------------------------------
  // Selecionar serviço para detalhes
  // ---------------------------------------------------------------------------
  function abrirDetalhes(servico: Servico) {
    setSelectedServicoId(servico.id);
    setPagamentoModal(null);
    fetchCobrancaDoServico(servico);
    if (servico.recorrencia_id) {
      fetchSerieRecorrente(servico.recorrencia_id);
    } else {
      setSelectedSerie(null);
      setAtendimentosSerie([]);
    }
  }

  // ---------------------------------------------------------------------------
  // Cancelar serviço (só muda status, não exclui)
  // ---------------------------------------------------------------------------
  async function handleCancelarServico(id: string) {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;
    await supabase.from("servicos").update({ status: "cancelado" }).eq("id", id).eq("user_id", userId);
    await fetchServicos();
    // Atualiza detalhes se o serviço estava aberto
    const s = servicos.find(x => x.id === id);
    if (s && selectedServicoId === id) {
      fetchCobrancaDoServico({ ...s, status: "cancelado" });
    }
  }

  // ---------------------------------------------------------------------------
  // Confirmar serviço (de cancelado → agendado)
  // ---------------------------------------------------------------------------
  async function handleReativarServico(id: string) {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;
    await supabase.from("servicos").update({ status: "agendado" }).eq("id", id).eq("user_id", userId);
    await fetchServicos();
  }

  // ---------------------------------------------------------------------------
  // Excluir serviço — só disponível em casos permitidos
  // ---------------------------------------------------------------------------
  async function handleExcluirServico(servico: Servico) {
    const { data: authData } = await supabase.auth.getUser();
    const userId = authData?.user?.id ?? null;

    try {
      if (servico.recorrencia_id) {
        // Recorrente: verifica se algum atendimento da serie ja passou
        const { data: passados, error: passadosError } = await supabase
          .from("servicos")
          .select("id")
          .eq("recorrencia_id", servico.recorrencia_id)
          .eq("user_id", userId)
          .lt("data_agendamento", hoje)
          .limit(1);

        if (passadosError) throw passadosError;

        if (passados && passados.length > 0) {
          toast({
            title: "Exclusao nao permitida",
            description: "Esta serie ja possui atendimentos realizados no passado e nao pode ser excluida.",
            variant: "destructive",
          });
          return;
        }
      } else {
        const { data: cobrancas, error: cobrancasError } = await supabase
          .from("cobrancas")
          .select("id")
          .eq("servico_id", servico.id)
          .eq("user_id", userId);

        if (cobrancasError) throw cobrancasError;

        const cobrancaIds = (cobrancas ?? []).map(c => c.id);

        if (cobrancaIds.length > 0) {
          const { error: pagamentosError } = await supabase
            .from("pagamentos")
            .delete()
            .in("cobranca_id", cobrancaIds)
            .eq("user_id", userId);

          if (pagamentosError) throw pagamentosError;

          const { error: deleteCobrancasError } = await supabase
            .from("cobrancas")
            .delete()
            .in("id", cobrancaIds)
            .eq("user_id", userId);

          if (deleteCobrancasError) throw deleteCobrancasError;
        }
      }

      const { error: deleteServicoError } = await supabase
        .from("servicos")
        .delete()
        .eq("id", servico.id)
        .eq("user_id", userId);

      if (deleteServicoError) throw deleteServicoError;

      await fetchServicos();
      setSelectedServicoId(null);
      setSelectedCobranca(null);
      toast({ title: "Servico excluido." });
    } catch (err: any) {
      toast({
        title: "Erro ao excluir servico",
        description: err.message,
        variant: "destructive",
      });
    }
  }
  // ---------------------------------------------------------------------------
  // Pagamentos: abrir modal
  // ---------------------------------------------------------------------------
  async function abrirPagamentos(servicoId: string, clienteNome: string, recorrenciaId?: string | null) {
    setPagamentoModal({ servicoId, clienteNome, cobranca: null, pagamentos: [], loading: true });
    setNovoPagamentoForm(PAGAMENTO_FORM_INITIAL);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error('[Eventos] abrirPagamentos auth error:', authErr);
    const userId = authData?.user?.id ?? null;

    let cobrancaData: Cobranca | null = null;

    if (recorrenciaId) {
      const { data } = await supabase
        .from("cobrancas")
        .select("id, servico_id, recorrencia_id, valor, data_vencimento, status")
        .eq("recorrencia_id", recorrenciaId)
        .eq("user_id", userId)
        .in("status", ["pendente", "parcial"])
        .order("data_vencimento", { ascending: true })
        .limit(1)
        .maybeSingle();
      cobrancaData = data ?? null;
    } else {
      const { data } = await supabase
        .from("cobrancas")
        .select("id, servico_id, recorrencia_id, valor, data_vencimento, status")
        .eq("servico_id", servicoId)
        .eq("user_id", userId)
        .maybeSingle();
      cobrancaData = data ?? null;
    }

    if (!cobrancaData) {
      toast({ title: "Cobrança não encontrada para este serviço.", variant: "destructive" });
      setPagamentoModal(null);
      return;
    }

    const { data: pagamentosData } = await supabase
      .from("pagamentos")
      .select("id, cobranca_id, data_pagamento, valor_pago, forma_pagamento, observacoes, created_at")
      .eq("cobranca_id", cobrancaData.id)
      .eq("user_id", userId)
      .order("created_at", { ascending: true });

    setPagamentoModal({
      servicoId,
      clienteNome,
      cobranca: cobrancaData,
      pagamentos: pagamentosData ?? [],
      loading: false,
    });

    setTimeout(() => modalRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }

  // ---------------------------------------------------------------------------
  // Pagamentos: registrar novo
  // ---------------------------------------------------------------------------
  async function handleRegistrarPagamento() {
    if (!pagamentoModal?.cobranca) return;

    if (!novoPagamentoForm.valorPago || novoPagamentoForm.valorPago <= 0) {
      toast({ title: "Informe um valor válido.", variant: "destructive" });
      return;
    }
    if (!novoPagamentoForm.formaPagamento) {
      toast({ title: "Informe a forma de pagamento.", variant: "destructive" });
      return;
    }

    const totalPago = pagamentoModal.pagamentos.reduce((s, p) => s + (p.valor_pago ?? 0), 0);
    const saldo = pagamentoModal.cobranca.valor - totalPago;

    if (novoPagamentoForm.valorPago > saldo + 0.001) {
      toast({
        title: "Valor excede o saldo devedor.",
        description: `Saldo restante: R$ ${saldo.toFixed(2).replace(".", ",")}`,
        variant: "destructive",
      });
      return;
    }

    setSalvandoPagamento(true);

    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("pagamentos").insert({
      user_id: user?.id,
      cobranca_id: pagamentoModal.cobranca.id,
      data_pagamento: novoPagamentoForm.dataPagamento,
      valor_pago: novoPagamentoForm.valorPago,
      forma_pagamento: novoPagamentoForm.formaPagamento,
      observacoes: novoPagamentoForm.observacoes || null,
    });

    if (error) {
      toast({ title: "Erro ao registrar pagamento", description: error.message, variant: "destructive" });
      setSalvandoPagamento(false);
      return;
    }

    const novoTotalPago = totalPago + novoPagamentoForm.valorPago;
    const novoStatus = novoTotalPago >= pagamentoModal.cobranca.valor - 0.001 ? "pago" : "parcial";

    await supabase
      .from("cobrancas")
      .update({ status: novoStatus })
      .eq("id", pagamentoModal.cobranca.id)
      .eq("user_id", user?.id);

    toast({ title: "Pagamento registrado com sucesso!" });
    setNovoPagamentoForm(PAGAMENTO_FORM_INITIAL);

    const s = servicos.find(x => x.id === pagamentoModal.servicoId);
    await abrirPagamentos(pagamentoModal.servicoId, pagamentoModal.clienteNome, s?.recorrencia_id);
    setSalvandoPagamento(false);
  }

  // ---------------------------------------------------------------------------
  // Pagamentos: remover
  // ---------------------------------------------------------------------------
  async function handleRemoverPagamento(pagamentoId: string) {
    if (!pagamentoModal?.cobranca) return;

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error('[Eventos] handleRemoverPagamento auth error:', authErr);
    const userId = authData?.user?.id ?? null;

    const { error } = await supabase.from("pagamentos").delete().eq("id", pagamentoId).eq("user_id", userId);
    if (error) {
      toast({ title: "Erro ao remover pagamento", description: error.message, variant: "destructive" });
      return;
    }

    const restantes = pagamentoModal.pagamentos.filter(p => p.id !== pagamentoId);
    const novoTotal = restantes.reduce((s, p) => s + (p.valor_pago ?? 0), 0);
    const novoStatus =
      novoTotal <= 0
        ? "pendente"
        : novoTotal >= pagamentoModal.cobranca.valor - 0.001
        ? "pago"
        : "parcial";

    await supabase
      .from("cobrancas")
      .update({ status: novoStatus })
      .eq("id", pagamentoModal.cobranca.id)
      .eq("user_id", userId);

    toast({ title: "Pagamento removido." });
    const s = servicos.find(x => x.id === pagamentoModal.servicoId);
    await abrirPagamentos(pagamentoModal.servicoId, pagamentoModal.clienteNome, s?.recorrencia_id);
  }

  // ---------------------------------------------------------------------------
  // Cliente select → carrega piscinas
  // ---------------------------------------------------------------------------
  async function handleClienteSelect(clienteId: string) {
    setFormData(prev => ({ ...prev, clienteId, piscinaId: "" }));
    setPiscinas([]);
    if (!clienteId) return;

    setLoadingPiscinas(true);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error('[Eventos] handleClienteSelect auth error:', authErr);
    const userId = authData?.user?.id ?? null;

    const { data, error } = await supabase
      .from("piscinas")
      .select("id, client_id, tipo, tamanho, endereco, observacoes")
      .eq("client_id", clienteId)
      .eq("user_id", userId);

    if (error) {
      toast({ title: "Erro ao carregar piscinas", description: error.message, variant: "destructive" });
    } else {
      const lista = data ?? [];
      setPiscinas(lista);
      if (lista.length === 1) setFormData(prev => ({ ...prev, piscinaId: lista[0].id }));
    }
    setLoadingPiscinas(false);
  }

  // ---------------------------------------------------------------------------
  // Submit agendamento
  // ---------------------------------------------------------------------------
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (
      !formData.clienteId ||
      !formData.piscinaId ||
      !formData.dataAgendamento ||
      !formData.horario ||
      !formData.tipoServico ||
      (!editingServicoId && (!formData.formaPagamento || formData.valor == null))
    ) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha cliente, piscina, tipo, data, horário, valor e forma de pagamento.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      if (editingServicoId) {
        const { error } = await supabase
          .from("servicos")
          .update({
            client_id: formData.clienteId,
            piscina_id: formData.piscinaId,
            tipo_servico: formData.tipoServico,
            data_agendamento: formData.dataAgendamento,
            horario: formData.horario,
            status: formData.status,
            observacoes: formData.observacoes || null,
          })
          .eq("id", editingServicoId)
          .eq("user_id", user.id);
        if (error) throw error;
        toast({ title: "Serviço atualizado com sucesso!" });
        await fetchServicos();
        handleCancelForm();
      } else {
        const { data: servicoData, error: servicoError } = await supabase
          .from("servicos")
          .insert({
            user_id: user.id,
            client_id: formData.clienteId,
            piscina_id: formData.piscinaId,
            tipo_servico: formData.tipoServico,
            data_agendamento: formData.dataAgendamento,
            horario: formData.horario,
            status: formData.status,
            observacoes: formData.observacoes || null,
          })
          .select("id")
          .single();
        if (servicoError) throw servicoError;

        const servicoId = servicoData.id;

        const { data: cobrancaData, error: cobrancaError } = await supabase
          .from("cobrancas")
          .insert({
            user_id: user.id,
            client_id: formData.clienteId,
            servico_id: servicoId,
            valor: formData.valor,
            data_vencimento: formData.dataVencimento || formData.dataAgendamento,
            status: "pendente",
          })
          .select("id")
          .single();
        if (cobrancaError) throw cobrancaError;

        if (formData.valorEntrada && formData.valorEntrada > 0) {
          const { error: pagamentoError } = await supabase.from("pagamentos").insert({
            user_id: user.id,
            cobranca_id: cobrancaData.id,
            data_pagamento: new Date().toISOString().split("T")[0],
            valor_pago: formData.valorEntrada,
            forma_pagamento: formData.formaPagamento,
          });
          if (pagamentoError) throw pagamentoError;

          if (formData.valorEntrada >= (formData.valor ?? 0)) {
            await supabase.from("cobrancas").update({ status: "pago" }).eq("id", cobrancaData.id).eq("user_id", user.id);
          } else {
            await supabase.from("cobrancas").update({ status: "parcial" }).eq("id", cobrancaData.id).eq("user_id", user.id);
          }
        }

        await fetchServicos();
        handleCancelForm();

        const clienteNome =
          clientes.find(c => c.id === formData.clienteId)
            ? `${clientes.find(c => c.id === formData.clienteId)!.nome} ${clientes.find(c => c.id === formData.clienteId)!.sobrenome}`
            : "";
        await abrirPagamentos(servicoId, clienteNome, null);

        toast({ title: "Serviço agendado!", description: "Confira os detalhes de pagamento abaixo." });
      }
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Edit
  // ---------------------------------------------------------------------------
  async function handleEditServico(id: string) {
    const s = servicos.find(x => x.id === id);
    if (!s) return;

    setLoadingPiscinas(true);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error('[Eventos] handleEditServico auth error:', authErr);
    const userId = authData?.user?.id ?? null;

    const { data } = await supabase
      .from("piscinas")
      .select("id, client_id, tipo, tamanho, endereco, observacoes")
      .eq("client_id", s.client_id)
      .eq("user_id", userId);
    setPiscinas(data ?? []);
    setLoadingPiscinas(false);

    setFormData({
      clienteId: s.client_id,
      piscinaId: s.piscina_id,
      tipoServico: s.tipo_servico ?? "",
      dataAgendamento: s.data_agendamento ?? "",
      horario: s.horario ?? "",
      status: s.status ?? "agendado",
      observacoes: s.observacoes ?? "",
      valor: undefined,
      dataVencimento: "",
      valorEntrada: undefined,
      formaPagamento: "",
    });

    setEditingServicoId(id);
    setSelectedServicoId(null);
    setPagamentoModal(null);
    setShowForm(true);
  }

  const effectiveEditId = locationEditId || paramEditId;
  const effectiveViewId = locationViewId || paramViewId;

  useEffect(() => {
    if (effectiveViewId) return;
    if (!effectiveEditId) return;
    if (!servicos || servicos.length === 0) return;
    const exists = servicos.some(s => s.id === effectiveEditId);
    if (exists) handleEditServico(effectiveEditId);
  }, [effectiveEditId, effectiveViewId, servicos]);

  useEffect(() => {
    if (!effectiveViewId) return;
    if (!servicos || servicos.length === 0) return;
    const s = servicos.find(x => x.id === effectiveViewId);
    if (s) {
      abrirDetalhes(s);
      setShowForm(false);
      setEditingServicoId(null);
    }
  }, [effectiveViewId, servicos]);

  function handleCancelForm() {
    setShowForm(false);
    setEditingServicoId(null);
    setFormData(FORM_INITIAL);
    setPiscinas([]);
    setModoCadastro("avulso");
  }

  function handleInputChange(field: keyof FormData, value: string | number | undefined) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const filteredServicos = servicos.filter(s =>
    (s.cliente_nome ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.tipo_servico ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.status ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedServico = selectedServicoId
    ? servicos.find(s => s.id === selectedServicoId) ?? null
    : null;

  const piscinaAtual = piscinas.find(p => p.id === formData.piscinaId);

  function getStatusColor(status: string | null) {
    switch (status) {
      case "confirmado": return "bg-green-100 text-green-800";
      case "agendado":   return "bg-blue-100 text-blue-800";
      case "concluido":  return "bg-gray-100 text-gray-700";
      case "cancelado":  return "bg-red-100 text-red-800";
      default:           return "bg-yellow-100 text-yellow-800";
    }
  }

  function getCobrancaStatusColor(status: string | null) {
    switch (status) {
      case "pago":     return "bg-green-100 text-green-800";
      case "parcial":  return "bg-yellow-100 text-yellow-800";
      case "pendente": return "bg-red-100 text-red-800";
      default:         return "bg-gray-100 text-gray-700";
    }
  }

  function formatMoney(v: number) {
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  }

  // Verifica se a série recorrente tem atendimentos passados (para bloquear exclusão)
  function serieTemPassados(): boolean {
    return atendimentosSerie.some(at => (at.data_agendamento ?? "") < hoje);
  }

  const totalPago = pagamentoModal?.pagamentos.reduce((s, p) => s + (p.valor_pago ?? 0), 0) ?? 0;
  const saldoDevedor = (pagamentoModal?.cobranca?.valor ?? 0) - totalPago;
  const cobrancaQuitada = !!pagamentoModal?.cobranca && saldoDevedor <= 0.001;

  useEffect(() => {
    if (showForm) setTimeout(() => showFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [showForm]);

  useEffect(() => {
    if (selectedServico) setTimeout(() => selectedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [selectedServico]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground">Serviços</h1>
        <p className="text-muted-foreground mt-2">Gerencie os agendamentos de serviços de piscina</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-8">
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 flex items-center gap-2"
          onClick={() => {
            if (showForm && !editingServicoId) handleCancelForm();
            else { setPagamentoModal(null); setSelectedServicoId(null); setShowForm(prev => !prev); }
          }}
        >
          <Plus size={18} />
          {showForm ? "Cancelar" : "Agendar Serviço"}
        </Button>
      </div>

      {/* Search */}
      {!showForm && !pagamentoModal && (
        <Card className="mb-6 bg-white border-blue-200">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                placeholder="Pesquisar por cliente, tipo de serviço ou status"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Formulário de agendamento                                           */}
      {/* ------------------------------------------------------------------ */}
      {showForm && (
        <div ref={showFormRef}>
          {!editingServicoId && (
            <div className="mb-4 inline-flex rounded-lg border border-blue-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setModoCadastro("avulso")}
                className={`px-4 py-2 text-sm ${modoCadastro === "avulso" ? "bg-blue-600 text-white" : "bg-white text-blue-700"}`}
              >
                Avulso
              </button>
              <button
                type="button"
                onClick={() => setModoCadastro("recorrente")}
                className={`px-4 py-2 text-sm ${modoCadastro === "recorrente" ? "bg-blue-600 text-white" : "bg-white text-blue-700"}`}
              >
                Recorrente
              </button>
            </div>
          )}

          {modoCadastro === "recorrente" && !editingServicoId ? (
            <ServicoRecorrenteForm
              onCreated={() => {
                setRecorrentesRefresh((k) => k + 1);
                handleCancelForm();
              }}
            />
          ) : (
            <Card className="mb-8 border-l-4 border-l-blue-600 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
                <CardTitle className="text-blue-900">
                  {editingServicoId ? "Editar serviço" : "Agendar serviço"}
                </CardTitle>
                <p className="text-xs text-blue-700 mt-1">Configure todos os detalhes do serviço</p>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Cliente: <span className="text-red-500">*</span></Label>
                      <Select value={formData.clienteId} onValueChange={handleClienteSelect} disabled={loadingClientes}>
                        <SelectTrigger>
                          <SelectValue placeholder={loadingClientes ? "Carregando..." : "Selecione o cliente"} />
                        </SelectTrigger>
                        <SelectContent>
                          {clientes.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.nome} {c.sobrenome}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>Piscina: <span className="text-red-500">*</span></Label>
                      <Select
                        value={formData.piscinaId}
                        onValueChange={v => handleInputChange("piscinaId", v)}
                        disabled={!formData.clienteId || loadingPiscinas}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={
                            !formData.clienteId ? "Selecione um cliente primeiro"
                            : loadingPiscinas ? "Carregando piscinas..."
                            : piscinas.length === 0 ? "Nenhuma piscina cadastrada"
                            : "Selecione a piscina"
                          } />
                        </SelectTrigger>
                        <SelectContent>
                          {piscinas.map(p => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.tamanho}{p.tipo ? ` — ${p.tipo}` : ""}{p.endereco ? ` (${p.endereco})` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {piscinaAtual && (
                        <div className="mt-2 text-xs bg-blue-50 border border-blue-200 rounded px-3 py-2 text-blue-800 space-y-0.5">
                          {piscinaAtual.tipo && <div><strong>Tipo:</strong> {piscinaAtual.tipo}</div>}
                          <div><strong>Tamanho:</strong> {piscinaAtual.tamanho}</div>
                          {piscinaAtual.endereco && <div><strong>Endereço:</strong> {piscinaAtual.endereco}</div>}
                          {piscinaAtual.observacoes && <div><strong>Obs:</strong> {piscinaAtual.observacoes}</div>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label>Tipo de serviço: <span className="text-red-500">*</span></Label>
                      <Input
                        value={formData.tipoServico}
                        onChange={e => handleInputChange("tipoServico", e.target.value)}
                        placeholder="Ex.: Limpeza, Tratamento químico"
                      />
                    </div>
                    <div>
                      <Label>Data: <span className="text-red-500">*</span></Label>
                      <Input
                        type="date"
                        value={formData.dataAgendamento}
                        onChange={e => handleInputChange("dataAgendamento", e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>Horário: <span className="text-red-500">*</span></Label>
                      <Input
                        type="time"
                        value={formData.horario}
                        onChange={e => handleInputChange("horario", e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label>Status:</Label>
                      <Select value={formData.status} onValueChange={v => handleInputChange("status", v)}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="agendado">Agendado</SelectItem>
                          <SelectItem value="confirmado">Confirmado</SelectItem>
                          <SelectItem value="concluido">Concluído</SelectItem>
                          <SelectItem value="cancelado">Cancelado</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {!editingServicoId && (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <Label>Valor do serviço (R$): <span className="text-red-500">*</span></Label>
                          <Input
                            type="number" min={0} step="0.01"
                            value={formData.valor ?? ""}
                            onChange={e => handleInputChange("valor", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                            placeholder="Ex.: 250,00"
                          />
                        </div>
                        <div>
                          <Label>Vencimento da cobrança:</Label>
                          <Input
                            type="date"
                            value={formData.dataVencimento}
                            onChange={e => handleInputChange("dataVencimento", e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground mt-1">Se vazio, usa a data do serviço.</p>
                        </div>
                        <div>
                          <Label>Entrada (R$):</Label>
                          <Input
                            type="number" min={0} step="0.01"
                            value={formData.valorEntrada ?? ""}
                            onChange={e => handleInputChange("valorEntrada", e.target.value === "" ? undefined : parseFloat(e.target.value))}
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>Forma de pagamento: <span className="text-red-500">*</span></Label>
                          <Input
                            value={formData.formaPagamento}
                            onChange={e => handleInputChange("formaPagamento", e.target.value)}
                            placeholder="Ex.: Pix, Cartão, Dinheiro"
                          />
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <Label>Observações:</Label>
                    <Textarea
                      value={formData.observacoes}
                      onChange={e => handleInputChange("observacoes", e.target.value)}
                      placeholder="Informações adicionais sobre o serviço"
                    />
                  </div>

                  <div className="flex justify-center pt-4 gap-2">
                    <Button type="submit" disabled={submitting} className="bg-primary hover:bg-primary-hover text-primary-foreground px-8">
                      {submitting ? "Salvando..." : editingServicoId ? "Salvar alterações" : "Agendar"}
                    </Button>
                    {editingServicoId && (
                      <Button type="button" variant="outline" onClick={handleCancelForm}>Cancelar</Button>
                    )}
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Modal de Pagamentos                                                 */}
      {/* ------------------------------------------------------------------ */}
      {pagamentoModal && (
        <div ref={modalRef} className="mb-8">
          <Card className="border-l-4 border-l-emerald-500 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-white border-b border-emerald-200">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-emerald-900 flex items-center gap-2">
                    <DollarSign size={20} />
                    Pagamentos — {pagamentoModal.clienteNome}
                  </CardTitle>
                  <p className="text-xs text-emerald-700 mt-1">Gerencie os pagamentos desta cobrança</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPagamentoModal(null)} className="text-slate-500 hover:text-slate-800">
                  <X size={18} />
                </Button>
              </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
              {pagamentoModal.loading ? (
                <div className="text-center text-muted-foreground py-8">Carregando...</div>
              ) : !pagamentoModal.cobranca ? (
                <div className="text-center text-muted-foreground py-8">Cobrança não encontrada.</div>
              ) : (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border bg-slate-50 p-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Valor total</p>
                      <p className="text-2xl font-bold text-slate-800">R$ {formatMoney(pagamentoModal.cobranca.valor)}</p>
                    </div>
                    <div className="rounded-lg border bg-green-50 p-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total pago</p>
                      <p className="text-2xl font-bold text-green-700">R$ {formatMoney(totalPago)}</p>
                    </div>
                    <div className={`rounded-lg border p-4 text-center ${cobrancaQuitada ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Saldo devedor</p>
                      <p className={`text-2xl font-bold ${cobrancaQuitada ? "text-green-700" : "text-red-700"}`}>
                        R$ {formatMoney(Math.max(0, saldoDevedor))}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-sm">
                    <Badge className={getCobrancaStatusColor(pagamentoModal.cobranca.status)}>
                      {pagamentoModal.cobranca.status ?? "pendente"}
                    </Badge>
                    <span className="text-muted-foreground">
                      Vencimento:{" "}
                      {pagamentoModal.cobranca.data_vencimento
                        ? format(parseISO(pagamentoModal.cobranca.data_vencimento), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-slate-700 mb-3">
                      <History size={16} />
                      Histórico de pagamentos
                    </h3>
                    {pagamentoModal.pagamentos.length === 0 ? (
                      <div className="text-sm text-muted-foreground bg-slate-50 rounded-lg border px-4 py-6 text-center">
                        Nenhum pagamento registrado ainda.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {pagamentoModal.pagamentos.map((p, idx) => (
                          <div key={p.id} className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 text-sm">
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}.</span>
                              <div>
                                <div className="font-medium text-green-700">R$ {formatMoney(p.valor_pago ?? 0)}</div>
                                <div className="text-xs text-muted-foreground">
                                  {p.data_pagamento ? format(parseISO(p.data_pagamento), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                                  {p.forma_pagamento ? ` · ${p.forma_pagamento}` : ""}
                                  {p.observacoes ? ` · ${p.observacoes}` : ""}
                                </div>
                              </div>
                            </div>
                            <Button size="sm" variant="ghost" className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2" onClick={() => handleRemoverPagamento(p.id)}>
                              <X size={14} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {!cobrancaQuitada && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-4 space-y-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2 text-emerald-800">
                        <CreditCard size={16} />
                        Registrar pagamento
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs">Valor (R$): <span className="text-red-500">*</span></Label>
                          <Input
                            type="number" min={0} step="0.01"
                            value={novoPagamentoForm.valorPago ?? ""}
                            onChange={e => setNovoPagamentoForm(prev => ({ ...prev, valorPago: e.target.value === "" ? undefined : parseFloat(e.target.value) }))}
                            placeholder={`Máx: R$ ${formatMoney(Math.max(0, saldoDevedor))}`}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Forma de pagamento: <span className="text-red-500">*</span></Label>
                          <Input
                            value={novoPagamentoForm.formaPagamento}
                            onChange={e => setNovoPagamentoForm(prev => ({ ...prev, formaPagamento: e.target.value }))}
                            placeholder="Ex.: Pix, Dinheiro"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Data do pagamento:</Label>
                          <Input
                            type="date"
                            value={novoPagamentoForm.dataPagamento}
                            onChange={e => setNovoPagamentoForm(prev => ({ ...prev, dataPagamento: e.target.value }))}
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Observações:</Label>
                          <Input
                            value={novoPagamentoForm.observacoes}
                            onChange={e => setNovoPagamentoForm(prev => ({ ...prev, observacoes: e.target.value }))}
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end">
                        <Button type="button" disabled={salvandoPagamento} onClick={handleRegistrarPagamento} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                          {salvandoPagamento ? "Salvando..." : "Registrar pagamento"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {cobrancaQuitada && (
                    <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
                      <CheckCircle2 size={16} />
                      Cobrança quitada — todos os pagamentos foram registrados.
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <Button variant="outline" onClick={() => setPagamentoModal(null)}>Fechar</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Lista de serviços                                                   */}
      {/* ------------------------------------------------------------------ */}
      {!showForm && !pagamentoModal && (
        <div className="space-y-4">
          <div className="mb-8">
            <h2 className="text-lg font-bold text-slate-800 mb-3">Serviços recorrentes</h2>
            <ServicosRecorrentesList refreshKey={recorrentesRefresh} />
          </div>
          {filteredServicos.length === 0 ? (
            <Card className="bg-white border-blue-200">
              <CardContent className="p-12 text-center">
                <div className="text-muted-foreground">
                  {searchTerm ? "Nenhum serviço encontrado." : "Nenhum serviço agendado ainda."}
                </div>
                {!searchTerm && (
                  <Button className="mt-4 bg-primary hover:bg-primary-hover text-primary-foreground" onClick={() => setShowForm(true)}>
                    <Plus size={16} className="mr-2" />
                    Agendar primeiro serviço
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredServicos.map(servico => {
                const isCancelado = servico.status === "cancelado";

                return (
                <Card
                  key={servico.id}
                  className={`relative overflow-hidden transition-all cursor-pointer border shadow-sm ${
                    isCancelado
                      ? "bg-white border-red-300 hover:border-red-400 hover:shadow-md"
                      : "bg-white border-blue-200 hover:border-blue-400 hover:shadow-lg"
                  }`}
                  onClick={() => { abrirDetalhes(servico); }}
                >
                  {isCancelado && (
                    <div className="absolute inset-y-0 left-0 w-1 bg-red-500" />
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className={`font-bold text-lg ${isCancelado ? "text-red-900" : "text-blue-900"}`}>
                            {servico.cliente_nome}
                          </h3>
                          <Badge className={getStatusColor(servico.status)} variant="outline">
                            {servico.status ?? "pendente"}
                          </Badge>
                          {servico.recorrencia_id && (
                            <Badge className="bg-purple-100 text-purple-800 flex items-center gap-1" variant="outline">
                              <RefreshCw size={11} />
                              Recorrente
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                          <div className={`flex items-center gap-2 rounded px-3 py-2 ${isCancelado ? "bg-red-50/70" : "bg-slate-50"}`}>
                            <Calendar size={16} className={`${isCancelado ? "text-red-600" : "text-blue-600"} flex-shrink-0`} />
                            <span className={isCancelado ? "text-slate-700" : "text-slate-700"}>
                              {servico.data_agendamento
                                ? format(parseISO(servico.data_agendamento), "dd/MM/yyyy", { locale: ptBR })
                                : "—"}
                            </span>
                          </div>
                          <div className={`flex items-center gap-2 rounded px-3 py-2 ${isCancelado ? "bg-red-50/70" : "bg-slate-50"}`}>
                            <Clock size={16} className={`${isCancelado ? "text-red-600" : "text-blue-600"} flex-shrink-0`} />
                            <span className="text-slate-700">{servico.horario ?? "—"}</span>
                          </div>
                          <div className={`flex items-center gap-2 rounded px-3 py-2 ${isCancelado ? "bg-red-50/70" : "bg-slate-50"}`}>
                            <Waves size={16} className={`${isCancelado ? "text-red-600" : "text-blue-600"} flex-shrink-0`} />
                            <span className="text-slate-700">{servico.piscina_tamanho ?? "—"}</span>
                          </div>
                          <div className={`flex items-center gap-2 rounded px-3 py-2 ${isCancelado ? "bg-red-50/70" : "bg-slate-50"}`}>
                            <MapPin size={16} className={`${isCancelado ? "text-red-600" : "text-blue-600"} flex-shrink-0`} />
                            <span className="text-slate-700">{servico.tipo_servico ?? "—"}</span>
                          </div>
                        </div>

                        {servico.observacoes && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-900">
                            <span className="font-semibold">📝 Obs:</span>{" "}
                            {servico.observacoes.substring(0, 100)}
                            {servico.observacoes.length > 100 ? "..." : ""}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-2">
                        {/* Confirmar — só quando agendado */}
                        {servico.status === "agendado" && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 whitespace-nowrap"
                            onClick={async e => {
                              e.stopPropagation();
                              const { data: authData } = await supabase.auth.getUser();
                              const userId = authData?.user?.id ?? null;
                              await supabase.from("servicos").update({ status: "confirmado" }).eq("id", servico.id).eq("user_id", userId);
                              fetchServicos();
                            }}
                          >
                            <CheckCircle2 size={14} className="mr-1" />
                            Confirmar
                          </Button>
                        )}

                        {/* Reativar — só quando cancelado */}
                        {servico.status === "cancelado" && (
                          <Button
                            size="sm"
                            className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 whitespace-nowrap"
                            onClick={async e => {
                              e.stopPropagation();
                              await handleReativarServico(servico.id);
                            }}
                          >
                            <CheckCircle2 size={14} className="mr-1" />
                            Reativar
                          </Button>
                        )}

                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-300 text-blue-700 hover:bg-blue-50 text-xs px-3"
                          onClick={e => { e.stopPropagation(); abrirDetalhes(servico); }}
                        >
                          <Edit size={14} className="mr-1" />
                          Detalhes
                        </Button>

                        {/* Pagamentos — apenas não cancelados */}
                        {servico.status !== "cancelado" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs px-3"
                            onClick={e => { e.stopPropagation(); setSelectedServicoId(null); abrirPagamentos(servico.id, servico.cliente_nome ?? "", servico.recorrencia_id); }}
                          >
                            <DollarSign size={14} className="mr-1" />
                            Pagamentos
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Detalhes do serviço                                                 */}
      {/* ------------------------------------------------------------------ */}
      {selectedServico && !pagamentoModal && (
        <div ref={selectedRef}>
          <section className="mt-6">
            <Card className={`shadow-lg border-l-4 ${selectedServico.status === "cancelado" ? "border-l-red-400" : "border-l-blue-600"}`}>
              <CardHeader className="bg-gradient-to-r from-blue-50 to-white border-b border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-3 flex-wrap">
                      <span>{selectedServico.cliente_nome}</span>
                      <Badge className={getStatusColor(selectedServico.status)}>
                        {selectedServico.status ?? "pendente"}
                      </Badge>
                      {selectedServico.recorrencia_id && (
                        <Badge className="bg-purple-100 text-purple-800 flex items-center gap-1">
                          <RefreshCw size={12} />
                          Serviço recorrente
                        </Badge>
                      )}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                      <Calendar size={14} />
                      {selectedServico.data_agendamento
                        ? format(parseISO(selectedServico.data_agendamento), "dd/MM/yyyy", { locale: ptBR })
                        : "—"}
                      {" • "}
                      <Clock size={14} />
                      {selectedServico.horario ?? "—"}
                    </p>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-6 pt-4 text-sm">
                {/* Aviso visual quando cancelado */}
                {selectedServico.status === "cancelado" && (
                  <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
                    <Ban size={16} />
                    Este serviço está cancelado. Reative-o caso queira retomar o agendamento.
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="rounded-lg border bg-slate-50/60 p-3 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serviço</h3>
                    <div><span className="font-medium">Tipo:</span> {selectedServico.tipo_servico ?? "—"}</div>
                    <div><span className="font-medium">Piscina:</span> {selectedServico.piscina_tamanho ?? "—"}</div>
                    {selectedServico.observacoes && (
                      <div><span className="font-medium">Observações:</span> {selectedServico.observacoes}</div>
                    )}
                  </div>

                  <div className="rounded-lg border bg-slate-50/60 p-3 space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Financeiro</h3>
                    {selectedCobranca ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {selectedServico.recorrencia_id ? "Próxima mensalidade:" : "Valor total:"}
                          </span>
                          <span className="text-lg font-bold text-slate-800">
                            R$ {selectedCobranca.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Vencimento:</span>
                          <span>
                            {selectedCobranca.data_vencimento
                              ? format(parseISO(selectedCobranca.data_vencimento), "dd/MM/yyyy", { locale: ptBR })
                              : "—"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">Status:</span>
                          <Badge className={getCobrancaStatusColor(selectedCobranca.status)}>
                            {selectedCobranca.status ?? "pendente"}
                          </Badge>
                        </div>
                      </>
                    ) : (
                      <div className="text-muted-foreground text-xs">
                        {selectedServico.recorrencia_id
                          ? "Todas as mensalidades desta série estão pagas."
                          : "Carregando dados financeiros..."}
                      </div>
                    )}
                  </div>
                </div>

                {/* Painel de recorrência */}
                {selectedServico.recorrencia_id && (
                  <div className="rounded-lg border border-purple-200 bg-purple-50/40 p-4 space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2 text-purple-800">
                      <RefreshCw size={15} />
                      Detalhes da série recorrente
                    </h3>

                    {loadingSerie ? (
                      <div className="text-xs text-muted-foreground">Carregando série...</div>
                    ) : selectedSerie ? (
                      <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="rounded-md bg-white border border-purple-100 p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">Dias da semana</p>
                            <div className="flex flex-wrap justify-center gap-1 mt-1">
                              {[0,1,2,3,4,5,6].map(d => (
                                <span
                                  key={d}
                                  className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                    selectedSerie.dias_semana.includes(d)
                                      ? "bg-purple-600 text-white"
                                      : "bg-slate-100 text-slate-400"
                                  }`}
                                >
                                  {DIAS_SEMANA_LABEL[d]}
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="rounded-md bg-white border border-purple-100 p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">Turno / Horário</p>
                            <p className="font-semibold text-purple-900 text-sm">
                              {TURNO_LABEL[selectedSerie.turno] ?? selectedSerie.turno}
                            </p>
                            <p className="text-xs text-slate-600">{selectedSerie.horario}</p>
                          </div>
                          <div className="rounded-md bg-white border border-purple-100 p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">Vigência</p>
                            <p className="font-semibold text-purple-900 text-sm">
                              {format(parseISO(selectedSerie.data_inicio), "dd/MM/yy", { locale: ptBR })}
                              {" → "}
                              {format(parseISO(selectedSerie.data_fim), "dd/MM/yy", { locale: ptBR })}
                            </p>
                          </div>
                          <div className="rounded-md bg-white border border-purple-100 p-3 text-center">
                            <p className="text-xs text-muted-foreground mb-1">Mensalidade</p>
                            <p className="font-semibold text-purple-900 text-sm">
                              R$ {formatMoney(selectedSerie.valor_mensalidade)}
                            </p>
                            <p className="text-xs text-slate-600">{selectedSerie.num_mensalidades}x · dia {selectedSerie.dia_vencimento}</p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-semibold text-purple-700 mb-2 uppercase tracking-wide">
                            Atendimentos da série ({atendimentosSerie.length} total)
                          </p>
                          <div className="max-h-56 overflow-y-auto pr-1 space-y-1">
                            {atendimentosSerie.map((at, idx) => {
                              const isPast = (at.data_agendamento ?? "") < hoje;
                              const isToday = at.data_agendamento === hoje;
                              return (
                                <div
                                  key={at.id}
                                  className={`flex items-center gap-3 rounded px-3 py-2 text-xs border ${
                                    isToday
                                      ? "bg-blue-50 border-blue-300 font-semibold"
                                      : isPast
                                      ? "bg-slate-50 border-slate-200 text-slate-500"
                                      : "bg-white border-purple-100"
                                  }`}
                                >
                                  <span className="w-5 text-right text-muted-foreground shrink-0">{idx + 1}.</span>
                                  <span className="w-24 shrink-0">
                                    {at.data_agendamento
                                      ? format(parseISO(at.data_agendamento), "dd/MM/yyyy", { locale: ptBR })
                                      : "—"}
                                  </span>
                                  <span className="text-slate-500 w-12 shrink-0">{at.horario?.slice(0, 5) ?? "—"}</span>
                                  <Badge className={`text-[10px] px-1.5 py-0 ${getStatusColor(at.status)}`} variant="outline">
                                    {at.status ?? "—"}
                                  </Badge>
                                  {isToday && <span className="ml-auto text-blue-600 font-semibold">Hoje</span>}
                                  {isPast && !isToday && <span className="ml-auto text-slate-400">Passado</span>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">Não foi possível carregar os dados da série.</div>
                    )}
                  </div>
                )}

                {/* Botões de ação */}
                <div className="mt-2 flex flex-wrap gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setSelectedServicoId(null)}>
                    Voltar
                  </Button>

                  {/* Ver pagamentos — só para não cancelados */}
                  {selectedServico.status !== "cancelado" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      onClick={() => {
                        setSelectedServicoId(null);
                        abrirPagamentos(selectedServico.id, selectedServico.cliente_nome ?? "", selectedServico.recorrencia_id);
                      }}
                    >
                      <DollarSign size={16} className="mr-1" />
                      Ver pagamentos
                    </Button>
                  )}

                  <Button
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => handleEditServico(selectedServico.id)}
                  >
                    Editar
                  </Button>

                  {/* Confirmar — apenas agendado */}
                  {selectedServico.status === "agendado" && (
                    <Button
                      type="button"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        const { data: authData } = await supabase.auth.getUser();
                        const userId = authData?.user?.id ?? null;
                        await supabase.from("servicos").update({ status: "confirmado" }).eq("id", selectedServico.id).eq("user_id", userId);
                        await fetchServicos();
                        setSelectedServicoId(null);
                      }}
                    >
                      <CheckCircle2 size={16} className="mr-1" />
                      Confirmar serviço
                    </Button>
                  )}

                  {/* Reativar — apenas cancelado */}
                  {selectedServico.status === "cancelado" && (
                    <Button
                      type="button"
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={async () => {
                        await handleReativarServico(selectedServico.id);
                        setSelectedServicoId(null);
                      }}
                    >
                      <CheckCircle2 size={16} className="mr-1" />
                      Reativar serviço
                    </Button>
                  )}

                  {/* Cancelar — apenas quando não está cancelado */}
                  {selectedServico.status !== "cancelado" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="border-orange-300 text-orange-700 hover:bg-orange-50"
                      onClick={() => handleCancelarServico(selectedServico.id)}
                    >
                      <Ban size={16} className="mr-1" />
                      Cancelar
                    </Button>
                  )}

                  {/* Excluir — apenas cancelado + regras de recorrente */}
                  {selectedServico.status === "cancelado" && (
                    <>
                      {selectedServico.recorrencia_id && serieTemPassados() ? (
                        <Button type="button" disabled className="opacity-40 cursor-not-allowed bg-red-100 text-red-400 border border-red-200" title="Série com atendimentos passados não pode ser excluída">
                          <Trash2 size={16} className="mr-1" />
                          Excluir
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          className="bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => handleExcluirServico(selectedServico)}
                        >
                          <Trash2 size={16} className="mr-1" />
                          Excluir
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
