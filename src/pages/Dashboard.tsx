import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar, TrendingUp, Eye, EyeOff, RefreshCw, CreditCard } from "lucide-react";
import { format, isAfter, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/lib/supabaseClient";
import { getTurnoLabelFromHorario } from "@/lib/turnos";

interface ProximoServico {
  id: string;
  tipo_servico: string | null;
  data_agendamento: string;
  horario: string | null;
  status: string | null;
  cliente_nome: string;
  endereco_piscina: string | null;
  cidade_piscina: string | null;
}

interface ResumoFinanceiro {
  valorTotalMes: number;
  totalPagoMes: number;
  saldoReceberMes: number;
}

interface ResumoRecorrente {
  valorTotalMes: number;
  totalPagoMes: number;
  saldoReceberMes: number;
  quantidadeMes: number;
  mediaMesPassado: number;
  quantidadeMesPassado: number;
  mediaProximoMes: number;
  quantidadeProximoMes: number;
}

interface ProximoPagamento {
  id: string;
  valor: number;
  data_vencimento: string;
  status: string | null;
  origem: "avulso" | "recorrente";
  cliente_nome: string;
  tipo_servico: string | null;
}

function getMonthRange(date: Date) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();

  return {
    inicio: `${year}-${String(month).padStart(2, "0")}-01`,
    fim: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

const RESUMO_RECORRENTE_INITIAL: ResumoRecorrente = {
  valorTotalMes: 0,
  totalPagoMes: 0,
  saldoReceberMes: 0,
  quantidadeMes: 0,
  mediaMesPassado: 0,
  quantidadeMesPassado: 0,
  mediaProximoMes: 0,
  quantidadeProximoMes: 0,
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [showFinancialValues, setShowFinancialValues] = useState(false);
  const [proximosServicos, setProximosServicos] = useState<ProximoServico[]>([]);
  const [resumo, setResumo] = useState<ResumoFinanceiro>({ valorTotalMes: 0, totalPagoMes: 0, saldoReceberMes: 0 });
  const [resumoRecorrente, setResumoRecorrente] = useState<ResumoRecorrente>(RESUMO_RECORRENTE_INITIAL);
  const [proximosPagamentos, setProximosPagamentos] = useState<ProximoPagamento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      setLoading(true);
      try {
        // obter usuário atual (necessário para RLS)
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) console.error('[Dashboard] erro ao obter usuário:', userErr);
        const userId = userData?.user?.id ?? null;
        if (!userId) {
          console.warn('[Dashboard] usuário não autenticado');
          setProximosServicos([]);
          setProximosPagamentos([]);
          setResumo({ valorTotalMes: 0, totalPagoMes: 0, saldoReceberMes: 0 });
          setResumoRecorrente(RESUMO_RECORRENTE_INITIAL);
          setLoading(false);
          return;
        }

        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const mesInicio = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
        const lastDay = new Date(currentYear, currentMonth, 0).getDate();
        const mesFim = `${currentYear}-${String(currentMonth).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
        const mesAnterior = getMonthRange(new Date(currentYear, currentMonth - 2, 1));
        const proximoMes = getMonthRange(new Date(currentYear, currentMonth, 1));

        // --- Próximos serviços ---
        const { data: servicosData, error: servicosError } = await supabase
          .from("servicos")
          .select(`
          id, tipo_servico, data_agendamento, horario, status,
          clientes(nome, sobrenome, cidade),
          piscinas(endereco)
        `)
          .eq('user_id', userId)
          .gte("data_agendamento", now.toISOString().split("T")[0])
          .order("data_agendamento", { ascending: true })
          .limit(4);

        if (servicosError) console.error("Erro ao buscar serviços:", servicosError);

        const proximosMapped: ProximoServico[] = (servicosData ?? []).map((s: any) => ({
          id: s.id,
          tipo_servico: s.tipo_servico,
          data_agendamento: s.data_agendamento,
          horario: s.horario,
          status: s.status,
          cliente_nome: s.clientes ? `${s.clientes.nome} ${s.clientes.sobrenome}` : "—",
          endereco_piscina: s.piscinas?.endereco ?? null,
          cidade_piscina: s.clientes?.cidade ?? null,
        }));
        setProximosServicos(proximosMapped);

        // --- Cobranças do mês ---
        const { data: cobrancasData, error: cobrancasError } = await supabase
          .from("cobrancas")
          .select("id, valor, status, data_vencimento, recorrencia_id")
          .eq('user_id', userId)
          .gte("data_vencimento", mesInicio)
          .lte("data_vencimento", mesFim);

        if (cobrancasError) console.error("Erro ao buscar cobranças:", cobrancasError);

        const cobrancas = cobrancasData ?? [];
        const valorTotalMes = (cobrancas as any[]).reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0);
        const cobrancaIds = cobrancas.map((c: any) => c.id);
        const cobrancasRecorrentes = (cobrancas as any[]).filter((c: any) => !!c.recorrencia_id);
        const cobrancasRecorrentesIds = new Set(cobrancasRecorrentes.map((c: any) => c.id));
        const valorTotalRecorrenteMes = cobrancasRecorrentes.reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0);

        const [
          { data: recorrentesMesPassadoData, error: recorrentesMesPassadoError },
          { data: recorrentesProximoMesData, error: recorrentesProximoMesError },
        ] = await Promise.all([
          supabase
            .from("cobrancas")
            .select("id, valor")
            .eq("user_id", userId)
            .not("recorrencia_id", "is", null)
            .gte("data_vencimento", mesAnterior.inicio)
            .lte("data_vencimento", mesAnterior.fim),
          supabase
            .from("cobrancas")
            .select("id, valor")
            .eq("user_id", userId)
            .not("recorrencia_id", "is", null)
            .gte("data_vencimento", proximoMes.inicio)
            .lte("data_vencimento", proximoMes.fim),
        ]);

        if (recorrentesMesPassadoError) console.error("Erro ao buscar recorrentes do mês passado:", recorrentesMesPassadoError);
        if (recorrentesProximoMesError) console.error("Erro ao buscar recorrentes do próximo mês:", recorrentesProximoMesError);

        const recorrentesMesPassado = recorrentesMesPassadoData ?? [];
        const recorrentesProximoMes = recorrentesProximoMesData ?? [];
        const totalRecorrenteMesPassado = recorrentesMesPassado.reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0);
        const totalRecorrenteProximoMes = recorrentesProximoMes.reduce((s: number, c: any) => s + (Number(c.valor) || 0), 0);

        // --- Pagamentos das cobranças do mês ---
        let totalPagoMes = 0;
        let totalPagoRecorrenteMes = 0;
        if (cobrancaIds.length > 0) {
          const { data: pagamentosData, error: pagamentosError } = await supabase
            .from("pagamentos")
            .select("cobranca_id, valor_pago")
            .eq('user_id', userId)
            .in("cobranca_id", cobrancaIds);

          if (pagamentosError) console.error("Erro ao buscar pagamentos:", pagamentosError);

          totalPagoMes = (pagamentosData ?? []).reduce((s: number, p: any) => s + (Number(p.valor_pago) || 0), 0);
          totalPagoRecorrenteMes = (pagamentosData ?? [])
            .filter((p: any) => cobrancasRecorrentesIds.has(p.cobranca_id))
            .reduce((s: number, p: any) => s + (Number(p.valor_pago) || 0), 0);
        }

        setResumo({
          valorTotalMes,
          totalPagoMes,
          saldoReceberMes: Math.max(0, valorTotalMes - totalPagoMes),
        });
        setResumoRecorrente({
          valorTotalMes: valorTotalRecorrenteMes,
          totalPagoMes: totalPagoRecorrenteMes,
          saldoReceberMes: Math.max(0, valorTotalRecorrenteMes - totalPagoRecorrenteMes),
          quantidadeMes: cobrancasRecorrentes.length,
          mediaMesPassado: recorrentesMesPassado.length > 0 ? totalRecorrenteMesPassado / recorrentesMesPassado.length : 0,
          quantidadeMesPassado: recorrentesMesPassado.length,
          mediaProximoMes: recorrentesProximoMes.length > 0 ? totalRecorrenteProximoMes / recorrentesProximoMes.length : 0,
          quantidadeProximoMes: recorrentesProximoMes.length,
        });

        // --- Próximos pagamentos em aberto ---
        const { data: proximasCobrancasData, error: proximasCobrancasError } = await supabase
          .from("cobrancas")
          .select("id, servico_id, recorrencia_id, valor, data_vencimento, status")
          .eq("user_id", userId)
          .in("status", ["pendente", "parcial"])
          .gte("data_vencimento", now.toISOString().split("T")[0])
          .order("data_vencimento", { ascending: true })
          .limit(2);

        if (proximasCobrancasError) console.error("Erro ao buscar próximos pagamentos:", proximasCobrancasError);

        const proximasCobrancas = proximasCobrancasData ?? [];
        const servicoIds = Array.from(new Set(proximasCobrancas.map((c: any) => c.servico_id).filter(Boolean)));
        const recorrenciaIds = Array.from(new Set(proximasCobrancas.map((c: any) => c.recorrencia_id).filter(Boolean)));

        const [servicosResult, recorrenciasResult] = await Promise.all([
          servicoIds.length > 0
            ? supabase.from("servicos").select("id, client_id, tipo_servico").in("id", servicoIds)
            : Promise.resolve({ data: [] }),
          recorrenciaIds.length > 0
            ? supabase.from("servicos_recorrentes").select("id, client_id, tipo_servico").in("id", recorrenciaIds)
            : Promise.resolve({ data: [] }),
        ]);

        const servicosMap: Record<string, any> = {};
        (servicosResult.data ?? []).forEach((s: any) => { servicosMap[s.id] = s; });

        const recorrenciasMap: Record<string, any> = {};
        (recorrenciasResult.data ?? []).forEach((s: any) => { recorrenciasMap[s.id] = s; });

        const clienteIds = Array.from(new Set([
          ...Object.values(servicosMap).map((s: any) => s.client_id),
          ...Object.values(recorrenciasMap).map((s: any) => s.client_id),
        ].filter(Boolean)));

        const { data: clientesData } = clienteIds.length > 0
          ? await supabase.from("clientes").select("id, nome, sobrenome").in("id", clienteIds)
          : { data: [] };

        const clientesMap: Record<string, any> = {};
        (clientesData ?? []).forEach((c: any) => { clientesMap[c.id] = c; });

        setProximosPagamentos(proximasCobrancas.map((c: any) => {
          const origem: "avulso" | "recorrente" = c.recorrencia_id ? "recorrente" : "avulso";
          const pai = origem === "recorrente" ? recorrenciasMap[c.recorrencia_id] : servicosMap[c.servico_id];
          const cliente = pai ? clientesMap[pai.client_id] : null;

          return {
            id: c.id,
            valor: Number(c.valor) || 0,
            data_vencimento: c.data_vencimento,
            status: c.status,
            origem,
            cliente_nome: cliente ? `${cliente.nome} ${cliente.sobrenome}` : "Cliente",
            tipo_servico: pai?.tipo_servico ?? null,
          };
        }));
      } catch (err) {
        console.error("fetchDashboard - erro:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-2">Bem-vindo ao seu painel de controle</p>
      </div>

      <div className="flex flex-col gap-6">
      {/* Grid de conteúdo */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 order-2 md:order-1">
        {/* Próximos Serviços */}
        <Card className="border-l-4 border-l-blue-600 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
            <CardTitle className="flex items-center gap-2 text-blue-900">
              <Calendar size={20} />
              Próximos Serviços
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : proximosServicos.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Nenhum serviço próximo</p>
                <Button
                  size="sm"
                  className="mt-3 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => navigate("/Eventos")}
                >
                  + Agendar Serviço
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {proximosServicos.map(servico => (
                  <div
                    key={servico.id}
                    onClick={() => navigate('/eventos', { state: { showForm: false, selectedServico: true, pagamentoModal: false, viewId: servico.id } })}
                    className="cursor-pointer flex p-3 border border-blue-200 rounded-lg bg-gradient-to-r from-blue-50 to-white hover:shadow-md transition"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold text-blue-900">{servico.cliente_nome}</h4>
                        <p className="text-xs text-slate-600 mt-1">
                          {servico.tipo_servico && <span className="mr-2">🔧 {servico.tipo_servico}</span>}
                          📅 {servico.data_agendamento
                            ? new Date(servico.data_agendamento + "T00:00:00").toLocaleDateString("pt-BR")
                            : "—"}
                          {servico.horario ? ` às ${getTurnoLabelFromHorario(servico.horario)}` : ""}
                        </p>
                        {servico.endereco_piscina && (
                          <p className="text-xs text-slate-500 mt-0.5">📍 {servico.endereco_piscina} / {servico.cidade_piscina}</p>
                        )}
                      </div>
                      <span className={`text-xs font-semibold px-2 py-1 rounded ${
                        servico.status === "confirmado"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {servico.status ?? "pendente"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumo Financeiro */}
        <Card className="border-l-4 border-l-blue-500 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-cyan-50 to-blue-50 border-b border-blue-200">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-blue-800">
                <TrendingUp size={20} />
                Resumo Financeiro - {format(new Date(), "MMMM/yyyy", { locale: ptBR })}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowFinancialValues(!showFinancialValues)}
                className="text-slate-600 hover:text-blue-700"
              >
                {showFinancialValues ? <Eye size={18} /> : <EyeOff size={18} />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-gradient-to-br from-blue-50 to-white border border-blue-200 rounded-lg">
                  <p className="text-xs text-slate-600">Valor Total em Serviços</p>
                  <p className="text-2xl font-bold text-blue-700 mt-1">
                    {showFinancialValues
                      ? `R$ ${resumo.valorTotalMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : "••••••"}
                  </p>
                </div>
                <div className="p-3 bg-gradient-to-br from-green-50 to-white border border-green-200 rounded-lg">
                  <p className="text-xs text-slate-600">Entradas Recebidas</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">
                    {showFinancialValues
                      ? `R$ ${resumo.totalPagoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : "••••••"}
                  </p>
                </div>
                <div className="p-3 bg-gradient-to-br from-orange-50 to-white border border-orange-200 rounded-lg">
                  <p className="text-xs text-slate-600">Saldo a Receber</p>
                  <p className="text-2xl font-bold text-orange-700 mt-1">
                    {showFinancialValues
                      ? `R$ ${resumo.saldoReceberMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : "••••••"}
                  </p>
                </div>
                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Próximos pagamentos
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-blue-700 hover:bg-blue-50"
                      onClick={() => navigate("/pagamentos")}
                    >
                      Ver todos
                    </Button>
                  </div>
                  {proximosPagamentos.length === 0 ? (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                      Nenhum pagamento próximo
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {proximosPagamentos.map((pagamento) => (
                        <button
                          key={pagamento.id}
                          type="button"
                          onClick={() => navigate("/pagamentos")}
                          className="w-full rounded-lg border border-blue-100 bg-white px-3 py-2 text-left hover:border-blue-300 hover:bg-blue-50/40 transition"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {pagamento.cliente_nome}
                              </p>
                              <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                                <CreditCard size={12} />
                                {pagamento.data_vencimento
                                  ? format(parseISO(pagamento.data_vencimento), "dd/MM/yyyy", { locale: ptBR })
                                  : "—"}
                                {" • "}
                                {pagamento.origem === "recorrente" ? "Recorrente" : "Avulso"}
                              </p>
                              {pagamento.tipo_servico && (
                                <p className="mt-0.5 truncate text-xs text-slate-500">{pagamento.tipo_servico}</p>
                              )}
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-sm font-bold text-blue-700">
                                {showFinancialValues
                                  ? `R$ ${pagamento.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                                  : "••••••"}
                              </p>
                              <span className="mt-1 inline-block rounded bg-yellow-100 px-2 py-0.5 text-[10px] font-semibold text-yellow-700">
                                {pagamento.status ?? "pendente"}
                              </span>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagamentos Recorrentes */}
        <Card className="border-l-4 border-l-emerald-500 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-200">
            <CardTitle className="flex items-center gap-2 text-emerald-800">
              <RefreshCw size={20} />
              Pagamentos Recorrentes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-gradient-to-br from-emerald-50 to-white border border-emerald-200 rounded-lg">
                  <p className="text-xs text-slate-600">Mensalidades do mês</p>
                  <p className="text-2xl font-bold text-emerald-700 mt-1">
                    {showFinancialValues
                      ? `R$ ${resumoRecorrente.valorTotalMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : "••••••"}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {resumoRecorrente.quantidadeMes} cobrança{resumoRecorrente.quantidadeMes === 1 ? "" : "s"} recorrente{resumoRecorrente.quantidadeMes === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="p-3 bg-gradient-to-br from-green-50 to-white border border-green-200 rounded-lg">
                  <p className="text-xs text-slate-600">Recorrentes recebidos</p>
                  <p className="text-2xl font-bold text-green-700 mt-1">
                    {showFinancialValues
                      ? `R$ ${resumoRecorrente.totalPagoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : "••••••"}
                  </p>
                </div>
                <div className="p-3 bg-gradient-to-br from-amber-50 to-white border border-amber-200 rounded-lg">
                  <p className="text-xs text-slate-600">Recorrentes a receber</p>
                  <p className="text-2xl font-bold text-amber-700 mt-1">
                    {showFinancialValues
                      ? `R$ ${resumoRecorrente.saldoReceberMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                      : "••••••"}
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-lg">
                    <p className="text-xs text-slate-600">Média mês passado</p>
                    <p className="text-xl font-bold text-slate-700 mt-1">
                      {showFinancialValues
                        ? `R$ ${resumoRecorrente.mediaMesPassado.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : "••••••"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {resumoRecorrente.quantidadeMesPassado} cobrança{resumoRecorrente.quantidadeMesPassado === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-teal-50 to-white border border-teal-200 rounded-lg">
                    <p className="text-xs text-slate-600">Média próximo mês</p>
                    <p className="text-xl font-bold text-teal-700 mt-1">
                      {showFinancialValues
                        ? `R$ ${resumoRecorrente.mediaProximoMes.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : "••••••"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {resumoRecorrente.quantidadeProximoMes} cobrança{resumoRecorrente.quantidadeProximoMes === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Ações Rápidas */}
      <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-200 order-1 md:order-2">
        <CardHeader className="bg-gradient-to-r from-blue-100 to-blue-50 border-b border-blue-200">
          <CardTitle className="text-blue-900">Ações Rápidas</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => navigate("/Eventos")}
            >
              + Novo Serviço
            </Button>
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => navigate("/clientes")}
            >
              + Novo Cliente
            </Button>
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => navigate("/calendario")}
            >
              Ver Calendário
            </Button>
            <Button
              variant="outline"
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
              onClick={() => navigate("/pagamentos")}
            >
              Pagamentos
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
