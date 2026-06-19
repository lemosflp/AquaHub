import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Calendar, Clock, MapPin, Edit, CheckCircle2, Waves, DollarSign, X, CreditCard, History } from "lucide-react";
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
  cliente_nome?: string;
  piscina_tamanho?: string;
}

interface Cobranca {
  id: string;
  servico_id: string;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Eventos() {
  const location = useLocation();
  // support both location.state and URL search params (?viewId=...&showForm=true&editId=...)
  const locationShowForm = (location.state as any)?.showForm as boolean | undefined;
  const locationEditId = (location.state as any)?.editId as string | undefined;
  const locationViewId = (location.state as any)?.viewId as string | undefined;
  const params = new URLSearchParams(location.search);
  const paramShowForm = params.get("showForm") === "true";
  const paramEditId = params.get("editId") ?? undefined;
  const paramViewId = params.get("viewId") ?? undefined;
  const { toast } = useToast();
  const navigate = useNavigate();

  // initial showForm considers both sources
  const [showForm, setShowForm] = useState(!!locationShowForm || paramShowForm);
  const [modoCadastro, setModoCadastro] = useState<"avulso" | "recorrente">("avulso");
  const [recorrentesRefresh, setRecorrentesRefresh] = useState(0);
  // will set editing/service selections later based on params/state
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
  const pagamentoModalRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Load clientes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    async function fetchClientes() {
      setLoadingClientes(true);
      // garantir user_id em todas as queries (RLS)
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
    // incluir user_id nas consultas para respeitar RLS
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error('[Eventos] fetchServicos auth error:', authErr);
    const userId = authData?.user?.id ?? null;

    const { data, error } = await supabase
      .from("servicos")
      .select(`
        id, user_id, client_id, piscina_id,
        tipo_servico, data_agendamento, horario, status, observacoes, created_at,
        clientes(nome, sobrenome),
        piscinas(tamanho)
      `)
      .eq('user_id', userId)
      .order("data_agendamento", { ascending: false });

    if (error) {
      toast({ title: "Erro ao carregar serviços", description: error.message, variant: "destructive" });
      return;
    }

    const mapped: Servico[] = (data ?? []).map((s: any) => ({
      ...s,
      cliente_nome: s.clientes ? `${s.clientes.nome} ${s.clientes.sobrenome}` : "",
      piscina_tamanho: s.piscinas?.tamanho ?? "",
    }));
    setServicos(mapped);
  }

  // ---------------------------------------------------------------------------
  // Cobrança dos detalhes
  // ---------------------------------------------------------------------------
  async function fetchCobrancaDoServico(servicoId: string) {
    setSelectedCobranca(null);
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error('[Eventos] fetchCobrancaDoServico auth error:', authErr);
    const userId = authData?.user?.id ?? null;

    const { data } = await supabase
      .from("cobrancas")
      .select("id, servico_id, valor, data_vencimento, status")
      .eq("servico_id", servicoId)
      .eq('user_id', userId)
      .maybeSingle();
    setSelectedCobranca(data ?? null);
  }

  // ---------------------------------------------------------------------------
  // Pagamentos: abrir modal e carregar dados
  // ---------------------------------------------------------------------------
  async function abrirPagamentos(servicoId: string, clienteNome: string) {
    setPagamentoModal({ servicoId, clienteNome, cobranca: null, pagamentos: [], loading: true });
    setNovoPagamentoForm(PAGAMENTO_FORM_INITIAL);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error('[Eventos] abrirPagamentos auth error:', authErr);
    const userId = authData?.user?.id ?? null;

    const { data: cobrancaData, error: cobrancaError } = await supabase
      .from("cobrancas")
      .select("id, servico_id, valor, data_vencimento, status")
      .eq("servico_id", servicoId)
      .eq('user_id', userId)
      .maybeSingle();

    if (cobrancaError || !cobrancaData) {
      toast({ title: "Cobrança não encontrada para este serviço.", variant: "destructive" });
      setPagamentoModal(null);
      return;
    }

    const { data: pagamentosData } = await supabase
      .from("pagamentos")
      .select("id, cobranca_id, data_pagamento, valor_pago, forma_pagamento, observacoes, created_at")
      .eq("cobranca_id", cobrancaData.id)
      .eq('user_id', userId)
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

    // Atualiza status da cobrança
    const novoTotalPago = totalPago + novoPagamentoForm.valorPago;
    const novoStatus = novoTotalPago >= pagamentoModal.cobranca.valor - 0.001 ? "pago" : "parcial";

    await supabase
      .from("cobrancas")
      .update({ status: novoStatus })
      .eq("id", pagamentoModal.cobranca.id)
      .eq('user_id', user?.id);

    toast({ title: "Pagamento registrado com sucesso!" });
    setNovoPagamentoForm(PAGAMENTO_FORM_INITIAL);

    // Recarrega dados do modal
    await abrirPagamentos(pagamentoModal.servicoId, pagamentoModal.clienteNome);
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

    const { error } = await supabase.from("pagamentos").delete().eq("id", pagamentoId).eq('user_id', userId);
    if (error) {
      toast({ title: "Erro ao remover pagamento", description: error.message, variant: "destructive" });
      return;
    }

    // Recalcula status após remoção
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
      .eq('user_id', userId);

    toast({ title: "Pagamento removido." });
    await abrirPagamentos(pagamentoModal.servicoId, pagamentoModal.clienteNome);
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
      .eq('user_id', userId);

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
          .eq('user_id', user.id);
        if (error) throw error;
        toast({ title: "Serviço atualizado com sucesso!" });
        await fetchServicos();
        handleCancelForm();
      } else {
        // INSERT servico
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

        // INSERT cobranca
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

        // INSERT pagamento de entrada (se houver)
        if (formData.valorEntrada && formData.valorEntrada > 0) {
          const { error: pagamentoError } = await supabase.from("pagamentos").insert({
            user_id: user.id,
            cobranca_id: cobrancaData.id,
            data_pagamento: new Date().toISOString().split("T")[0],
            valor_pago: formData.valorEntrada,
            forma_pagamento: formData.formaPagamento,
          });
          if (pagamentoError) throw pagamentoError;

          // Atualiza status da cobrança se entrada cobre tudo
          if (formData.valorEntrada >= (formData.valor ?? 0)) {
            await supabase.from("cobrancas").update({ status: "pago" }).eq("id", cobrancaData.id).eq('user_id', user.id);
          } else {
            await supabase.from("cobrancas").update({ status: "parcial" }).eq("id", cobrancaData.id).eq('user_id', user.id);
          }
        }

        await fetchServicos();
        handleCancelForm();

        // Abre modal de pagamentos automaticamente
        const clienteNome =
          clientes.find(c => c.id === formData.clienteId)
            ? `${clientes.find(c => c.id === formData.clienteId)!.nome} ${clientes.find(c => c.id === formData.clienteId)!.sobrenome}`
            : "";
        await abrirPagamentos(servicoId, clienteNome);

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
      .eq('user_id', userId);
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

  // If navigation provided an editId in location.state (from the calendar), open the form
  // once services have been loaded so the requested service can be found.
  // This runs after fetchServicos populated `servicos`.
  // Compute effective ids considering both location.state and URL params
  const effectiveEditId = locationEditId || paramEditId;
  const effectiveViewId = locationViewId || paramViewId;

  useEffect(() => {
    // If a viewId was requested, prefer viewing over editing
    if (effectiveViewId) return;
    if (!effectiveEditId) return;
    if (!servicos || servicos.length === 0) return;
    const exists = servicos.some(s => s.id === effectiveEditId);
    if (exists) {
      handleEditServico(effectiveEditId);
    }
  }, [effectiveEditId, effectiveViewId, servicos]);

  // If navigation provided a viewId (from the calendar or URL), open the details panel
  useEffect(() => {
    if (!effectiveViewId) return;
    if (!servicos || servicos.length === 0) return;
    const exists = servicos.some(s => s.id === effectiveViewId);
    if (exists) {
      setSelectedServicoId(effectiveViewId);
      setShowForm(false);
      setEditingServicoId(null);
      fetchCobrancaDoServico(effectiveViewId);
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

  // calculos do modal
  const totalPago = pagamentoModal?.pagamentos.reduce((s, p) => s + (p.valor_pago ?? 0), 0) ?? 0;
  const saldoDevedor = (pagamentoModal?.cobranca?.valor ?? 0) - totalPago;
  const cobrancaQuitada = !!pagamentoModal?.cobranca && saldoDevedor <= 0.001;

  // auto-scroll
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
                  {/* Cliente + Piscina */}
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

                  {/* Tipo, Data, Horário */}
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

                  {/* Status */}
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

                  {/* Financeiro — só na criação */}
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

                  {/* Observações */}
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
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPagamentoModal(null)}
                  className="text-slate-500 hover:text-slate-800"
                >
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
                  {/* Resumo financeiro */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="rounded-lg border bg-slate-50 p-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Valor total</p>
                      <p className="text-2xl font-bold text-slate-800">
                        R$ {formatMoney(pagamentoModal.cobranca.valor)}
                      </p>
                    </div>
                    <div className="rounded-lg border bg-green-50 p-4 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Total pago</p>
                      <p className="text-2xl font-bold text-green-700">
                        R$ {formatMoney(totalPago)}
                      </p>
                    </div>
                    <div className={`rounded-lg border p-4 text-center ${cobrancaQuitada ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Saldo devedor</p>
                      <p className={`text-2xl font-bold ${cobrancaQuitada ? "text-green-700" : "text-red-700"}`}>
                        R$ {formatMoney(Math.max(0, saldoDevedor))}
                      </p>
                    </div>
                  </div>

                  {/* Status da cobrança + vencimento */}
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

                  {/* Histórico de pagamentos */}
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
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 text-sm"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-xs text-muted-foreground w-5 text-right">{idx + 1}.</span>
                              <div>
                                <div className="font-medium text-green-700">
                                  R$ {formatMoney(p.valor_pago ?? 0)}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {p.data_pagamento
                                    ? format(parseISO(p.data_pagamento), "dd/MM/yyyy", { locale: ptBR })
                                    : "—"}
                                  {p.forma_pagamento ? ` · ${p.forma_pagamento}` : ""}
                                  {p.observacoes ? ` · ${p.observacoes}` : ""}
                                </div>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50 px-2"
                              onClick={() => handleRemoverPagamento(p.id)}
                            >
                              <X size={14} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Registrar novo pagamento */}
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
                            onChange={e => setNovoPagamentoForm(prev => ({
                              ...prev,
                              valorPago: e.target.value === "" ? undefined : parseFloat(e.target.value),
                            }))}
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
                        <Button
                          type="button"
                          disabled={salvandoPagamento}
                          onClick={handleRegistrarPagamento}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
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
                    <Button variant="outline" onClick={() => setPagamentoModal(null)}>
                      Fechar
                    </Button>
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
              {filteredServicos.map(servico => (
                <Card
                  key={servico.id}
                  className="bg-white border-blue-200 hover:shadow-lg hover:border-blue-400 transition-all cursor-pointer"
                  onClick={() => { setSelectedServicoId(servico.id); setPagamentoModal(null); fetchCobrancaDoServico(servico.id); }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-3 flex-wrap">
                          <h3 className="font-bold text-lg text-blue-900">{servico.cliente_nome}</h3>
                          <Badge className={getStatusColor(servico.status)} variant="outline">
                            {servico.status ?? "pendente"}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                          <div className="flex items-center gap-2 bg-slate-50 rounded px-3 py-2">
                            <Calendar size={16} className="text-blue-600 flex-shrink-0" />
                            <span className="text-slate-700">
                              {servico.data_agendamento
                                ? format(parseISO(servico.data_agendamento), "dd/MM/yyyy", { locale: ptBR })
                                : "—"}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 bg-slate-50 rounded px-3 py-2">
                            <Clock size={16} className="text-blue-600 flex-shrink-0" />
                            <span className="text-slate-700">{servico.horario ?? "—"}</span>
                          </div>
                          <div className="flex items-center gap-2 bg-slate-50 rounded px-3 py-2">
                            <Waves size={16} className="text-blue-600 flex-shrink-0" />
                            <span className="text-slate-700">{servico.piscina_tamanho ?? "—"}</span>
                          </div>
                          <div className="flex items-center gap-2 bg-slate-50 rounded px-3 py-2">
                            <MapPin size={16} className="text-blue-600 flex-shrink-0" />
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
                        {servico.status === "agendado" && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white text-xs px-3 whitespace-nowrap"
                            onClick={async e => {
                              e.stopPropagation();
                              const { data: authData, error: authErr } = await supabase.auth.getUser();
                              if (authErr) console.error('[Eventos] confirmar servico auth error:', authErr);
                              const userId = authData?.user?.id ?? null;
                              await supabase.from("servicos").update({ status: "confirmado" }).eq("id", servico.id).eq('user_id', userId);
                              fetchServicos();
                            }}
                          >
                            <CheckCircle2 size={14} className="mr-1" />
                            Confirmar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-blue-300 text-blue-700 hover:bg-blue-50 text-xs px-3"
                          onClick={e => { e.stopPropagation(); setSelectedServicoId(servico.id); setPagamentoModal(null); fetchCobrancaDoServico(servico.id); }}
                        >
                          <Edit size={14} className="mr-1" />
                          Detalhes
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-300 text-emerald-700 hover:bg-emerald-50 text-xs px-3"
                          onClick={e => { e.stopPropagation(); setSelectedServicoId(null); abrirPagamentos(servico.id, servico.cliente_nome ?? ""); }}
                        >
                          <DollarSign size={14} className="mr-1" />
                          Pagamentos
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
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
            <Card className="border-l-4 border-l-blue-600 shadow-lg">
              <CardHeader className="bg-gradient-to-r from-blue-50 to-white border-b border-blue-200">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl flex items-center gap-3">
                      <span>{selectedServico.cliente_nome}</span>
                      <Badge className={getStatusColor(selectedServico.status)}>
                        {selectedServico.status ?? "pendente"}
                      </Badge>
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
                          <span className="font-medium">Valor total:</span>
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
                          <span className="font-medium">Status do pagamento:</span>
                          <Badge className={getCobrancaStatusColor(selectedCobranca.status)}>
                            {selectedCobranca.status ?? "pendente"}
                          </Badge>
                        </div>
                      </>
                    ) : (
                      <div className="text-muted-foreground text-xs">Carregando dados financeiros...</div>
                    )}
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap gap-2 justify-end">
                  <Button type="button" variant="outline" onClick={() => setSelectedServicoId(null)}>
                    Voltar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                    onClick={() => { setSelectedServicoId(null); abrirPagamentos(selectedServico.id, selectedServico.cliente_nome ?? ""); }}
                  >
                    <DollarSign size={16} className="mr-1" />
                    Ver pagamentos
                  </Button>
                  <Button
                    type="button"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => handleEditServico(selectedServico.id)}
                  >
                    Editar
                  </Button>
                  {selectedServico.status === "agendado" && (
                    <Button
                      type="button"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={async () => {
                        const { data: authData, error: authErr } = await supabase.auth.getUser();
                        if (authErr) console.error('[Eventos] confirmar selectedServico auth error:', authErr);
                        const userId = authData?.user?.id ?? null;
                        await supabase.from("servicos").update({ status: "confirmado" }).eq("id", selectedServico.id).eq('user_id', userId);
                        await fetchServicos();
                        setSelectedServicoId(null);
                      }}
                    >
                      <CheckCircle2 size={16} className="mr-1" />
                      Confirmar serviço
                    </Button>
                  )}
                  <Button
                    type="button"
                    className="bg-red-600 hover:bg-red-700 text-white"
                    onClick={async () => {
                      const { data: authData, error: authErr } = await supabase.auth.getUser();
                      if (authErr) console.error('[Eventos] remover selectedServico auth error:', authErr);
                      const userId = authData?.user?.id ?? null;
                      await supabase.from("servicos").delete().eq("id", selectedServico.id).eq('user_id', userId);
                      await fetchServicos();
                      setSelectedServicoId(null);
                    }}
                  >
                    Remover
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        </div>
      )}
    </div>
  );
}
