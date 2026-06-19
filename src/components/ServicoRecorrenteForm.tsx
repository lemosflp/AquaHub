import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabaseClient";
import {
  calcularDataFim,
  contarMesesCobertos,
  gerarOcorrencias,
  gerarVencimentos,
} from "@/lib/recorrencia";
import { createServicoRecorrente, updateServicoRecorrente } from "@/services/supabaseApi";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

type ClienteOpt = { id: string; nome: string; sobrenome: string };
type PiscinaOpt = { id: string; tamanho: string; tipo: string | null; endereco: string | null };

const DIAS = [
  { n: 1, label: "Seg" },
  { n: 2, label: "Ter" },
  { n: 3, label: "Qua" },
  { n: 4, label: "Qui" },
  { n: 5, label: "Sex" },
  { n: 6, label: "Sáb" },
  { n: 0, label: "Dom" },
];

const MESES = [
  { n: 1, label: "Jan" },
  { n: 2, label: "Fev" },
  { n: 3, label: "Mar" },
  { n: 4, label: "Abr" },
  { n: 5, label: "Mai" },
  { n: 6, label: "Jun" },
  { n: 7, label: "Jul" },
  { n: 8, label: "Ago" },
  { n: 9, label: "Set" },
  { n: 10, label: "Out" },
  { n: 11, label: "Nov" },
  { n: 12, label: "Dez" },
];

type RecorrenciaEditavel = {
  id: string;
  client_id: string;
  piscina_id: string | null;
  cliente_nome?: string;
  piscina_label?: string;
  tipo_servico: string | null;
  dias_semana: number[];
  turno: "manha" | "tarde" | "noite";
  horario: string;
  data_inicio: string;
  vigencia_qtd: number;
  vigencia_unidade: "semanas" | "meses";
  dia_vencimento: number;
  num_mensalidades: number;
  valor_mensalidade: number;
  observacoes: string | null;
};

type Props = { onCreated?: () => void; recorrencia?: RecorrenciaEditavel };

function mergeById<T extends { id: string }>(items: T[], item: T | null | undefined) {
  if (!item || items.some((current) => current.id === item.id)) return items;
  return [...items, item];
}

export function ServicoRecorrenteForm({ onCreated, recorrencia }: Props) {
  const { toast } = useToast();
  const touchedVigenciaRef = useRef(false);

  const [clientes, setClientes] = useState<ClienteOpt[]>([]);
  const [piscinas, setPiscinas] = useState<PiscinaOpt[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // form state
  const [clienteId, setClienteId] = useState("");
  const [piscinaId, setPiscinaId] = useState("");
  const [tipoServico, setTipoServico] = useState("");
  const [diasSemana, setDiasSemana] = useState<number[]>([]);
  const [turno, setTurno] = useState<"manha" | "tarde" | "noite" | "">("");
  const [horario, setHorario] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [vigenciaQtd, setVigenciaQtd] = useState<number | undefined>(undefined);
  const [vigenciaUnidade, setVigenciaUnidade] = useState<"semanas" | "meses">("semanas");
  const [diaVencimento, setDiaVencimento] = useState<number | undefined>(undefined);
  const [cobrancaMes, setCobrancaMes] = useState<number | undefined>(undefined);
  const [numMensalidades, setNumMensalidades] = useState<number | undefined>(undefined);
  const [valorMensalidade, setValorMensalidade] = useState<number | undefined>(undefined);
  const [observacoes, setObservacoes] = useState("");

  // carregar clientes
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;
      const { data } = await supabase
        .from("clientes")
        .select("id, nome, sobrenome")
        .eq("user_id", userId)
        .order("nome");
      setClientes(data ?? []);
    })();
  }, []);

  // pré-popula o form quando estamos editando uma série existente
  useEffect(() => {
    if (!recorrencia) return;
    let cancelled = false;

    setClienteId(recorrencia.client_id);
    setPiscinaId(recorrencia.piscina_id ?? "");
    setTipoServico(recorrencia.tipo_servico ?? "");
    setDiasSemana(recorrencia.dias_semana);
    setTurno(recorrencia.turno);
    setHorario(recorrencia.horario.slice(0, 5));
    setDataInicio(recorrencia.data_inicio);
    setVigenciaQtd(recorrencia.vigencia_qtd);
    setVigenciaUnidade(recorrencia.vigencia_unidade);
    setDiaVencimento(recorrencia.dia_vencimento);
    setNumMensalidades(recorrencia.num_mensalidades);
    setValorMensalidade(Number(recorrencia.valor_mensalidade));
    setObservacoes(recorrencia.observacoes ?? "");

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id ?? null;

      const [{ data: clienteAtual }, { data: piscinasCliente }, { data: atendimentoComPiscina }] = await Promise.all([
        supabase
          .from("clientes")
          .select("id, nome, sobrenome")
          .eq("id", recorrencia.client_id)
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("piscinas")
          .select("id, tamanho, tipo, endereco")
          .eq("client_id", recorrencia.client_id)
          .eq("user_id", userId),
        recorrencia.piscina_id
          ? Promise.resolve({ data: null })
          : supabase
              .from("servicos")
              .select("piscina_id")
              .eq("recorrencia_id", recorrencia.id)
              .eq("user_id", userId)
              .not("piscina_id", "is", null)
              .limit(1)
              .maybeSingle(),
      ]);

      if (cancelled) return;

      const piscinaIdAtual = recorrencia.piscina_id ?? atendimentoComPiscina?.piscina_id ?? "";
      let piscinasLista = piscinasCliente ?? [];

      if (piscinaIdAtual && !piscinasLista.some((p) => p.id === piscinaIdAtual)) {
        const { data: piscinaAtual } = await supabase
          .from("piscinas")
          .select("id, tamanho, tipo, endereco")
          .eq("id", piscinaIdAtual)
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelled) return;
        piscinasLista = mergeById(piscinasLista, piscinaAtual);
      }

      setClientes((prev) => mergeById(prev, clienteAtual));
      setPiscinas(piscinasLista);
      setPiscinaId(piscinaIdAtual);
    })();

    return () => {
      cancelled = true;
    };
  }, [recorrencia]);

  // carregar piscinas ao escolher cliente
  async function handleCliente(id: string) {
    setClienteId(id);
    setPiscinaId("");
    setPiscinas([]);
    if (!id) return;
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;
    const { data } = await supabase
      .from("piscinas")
      .select("id, tamanho, tipo, endereco")
      .eq("client_id", id)
      .eq("user_id", userId);
    const lista = data ?? [];
    setPiscinas(lista);
    if (lista.length === 1) setPiscinaId(lista[0].id);
  }

  function toggleDia(n: number) {
    setDiasSemana((prev) =>
      prev.includes(n) ? prev.filter((d) => d !== n) : [...prev, n]
    );
  }

  // Nº de mensalidades sugerido a partir da vigência:
  // - meses  => a própria duração (6 meses = 6 mensalidades)
  // - semanas => meses-calendário cobertos entre início e fim (mín. 1)
  const numMensalidadesSugerido = (() => {
    if (!vigenciaQtd || vigenciaQtd <= 0) return undefined;
    if (vigenciaUnidade === "meses") return vigenciaQtd;
    if (!dataInicio) return undefined;
    const ini = parseISO(dataInicio);
    const fim = calcularDataFim(ini, vigenciaQtd, "semanas");
    return contarMesesCobertos(ini, fim);
  })();

  // Preenche automaticamente o campo (editável) sempre que a sugestão mudar.
  // Em modo de edição, só aplica a sugestão depois que o usuário de fato
  // alterar duração/unidade — senão sobrescreveria o valor real da série.
  useEffect(() => {
    if (recorrencia && !touchedVigenciaRef.current) return;
    setNumMensalidades(numMensalidadesSugerido);
  }, [numMensalidadesSugerido]);

  // Mês escolhido + ano derivado do início da vigência (rola p/ o próximo ano
  // quando o mês escolhido é anterior ao mês de início). Resulta em "YYYY-MM-01".
  const cobrancaInicio = (() => {
    if (!cobrancaMes) return "";
    const base = dataInicio ? parseISO(dataInicio) : new Date();
    const anoBase = base.getFullYear();
    const ano = cobrancaMes < base.getMonth() + 1 ? anoBase + 1 : anoBase;
    return `${ano}-${String(cobrancaMes).padStart(2, "0")}-01`;
  })();

  // prévia (calculada quando há dados suficientes)
  const previa = (() => {
    if (!dataInicio || !vigenciaQtd || diasSemana.length === 0) return null;
    const ini = parseISO(dataInicio);
    const fim = calcularDataFim(ini, vigenciaQtd, vigenciaUnidade);
    const ocorrencias = gerarOcorrencias(ini, fim, diasSemana);
    const vencimentos =
      cobrancaInicio && diaVencimento && numMensalidades
        ? gerarVencimentos(parseISO(cobrancaInicio), diaVencimento, numMensalidades)
        : [];
    return { fim, ocorrencias, vencimentos };
  })();

  function validar(): string | null {
    if (!clienteId) return "Selecione o cliente.";
    if (diasSemana.length === 0) return "Selecione ao menos um dia da semana.";
    if (!turno) return "Selecione o turno.";
    if (!horario) return "Informe o horário.";
    if (!dataInicio) return "Informe a data de início.";
    if (!vigenciaQtd || vigenciaQtd <= 0) return "Informe a duração da vigência.";
    if (!diaVencimento || diaVencimento < 1 || diaVencimento > 31)
      return "Informe um dia de vencimento entre 1 e 31.";
    if (!recorrencia && !cobrancaMes) return "Selecione o mês de início da cobrança.";
    if (!numMensalidades || numMensalidades <= 0)
      return "Informe o número de mensalidades.";
    if (valorMensalidade == null || valorMensalidade <= 0)
      return "Informe o valor da mensalidade.";
    if (previa && previa.ocorrencias.length === 0)
      return "A configuração não gera nenhum atendimento. Revise os dias/vigência.";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const erro = validar();
    if (erro) {
      toast({ title: "Campos obrigatórios", description: erro, variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      if (recorrencia) {
        const res = await updateServicoRecorrente(recorrencia.id, {
          piscinaId,
          tipoServico: tipoServico || null,
          diasSemana,
          turno: turno as "manha" | "tarde" | "noite",
          horario,
          vigenciaQtd: vigenciaQtd!,
          vigenciaUnidade,
          diaVencimento: diaVencimento!,
          numMensalidades: numMensalidades!,
          valorMensalidade: valorMensalidade!,
          observacoes: observacoes || null,
        });
        toast({
          title: "Série recorrente atualizada!",
          description: `${res.atendimentosGerados} atendimentos e ${res.cobrancasGeradas} cobranças futuras regeneradas.`,
        });
      } else {
        const res = await createServicoRecorrente({
          clientId: clienteId,
          piscinaId,
          tipoServico: tipoServico || null,
          diasSemana,
          turno: turno as "manha" | "tarde" | "noite",
          horario,
          dataInicio,
          vigenciaQtd: vigenciaQtd!,
          vigenciaUnidade,
          diaVencimento: diaVencimento!,
          cobrancaInicio,
          numMensalidades: numMensalidades!,
          valorMensalidade: valorMensalidade!,
          observacoes: observacoes || null,
        });
        toast({
          title: "Serviço recorrente criado!",
          description: `${res.atendimentos} atendimentos e ${res.cobrancas} cobranças gerados.`,
        });
      }
      onCreated?.();
    } catch (err: any) {
      toast({
        title: recorrencia ? "Erro ao salvar" : "Erro ao criar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  }

  const clienteSelecionado = clientes.find((c) => c.id === clienteId);
  const clienteLabel = clienteSelecionado
    ? `${clienteSelecionado.nome} ${clienteSelecionado.sobrenome}`
    : recorrencia?.cliente_nome ?? "";

  const piscinaSelecionada = piscinas.find((p) => p.id === piscinaId);
  const piscinaLabel = piscinaSelecionada
    ? `${piscinaSelecionada.tamanho}${piscinaSelecionada.tipo ? ` - ${piscinaSelecionada.tipo}` : ""}${piscinaSelecionada.endereco ? ` (${piscinaSelecionada.endereco})` : ""}`
    : recorrencia?.piscina_label ?? "";

  return (
    <Card className="mb-8 border-l-4 border-l-blue-600 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
        <CardTitle className="text-blue-900">
          {recorrencia ? "Editar serviço recorrente" : "Serviço recorrente"}
        </CardTitle>
        <p className="text-xs text-blue-700 mt-1">
          {recorrencia
            ? "Altera a série a partir de hoje. Atendimentos concluídos e cobranças pagas/vencidas são preservados."
            : "Gera os atendimentos no calendário e as mensalidades automaticamente"}
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cliente + Piscina */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Cliente: <span className="text-red-500">*</span></Label>
              <Select value={clienteId} onValueChange={handleCliente} disabled={!!recorrencia}>
                <SelectTrigger>
                  {clienteLabel ? (
                    <span className="truncate">{clienteLabel}</span>
                  ) : (
                    <SelectValue placeholder={clienteId ? "Carregando cliente..." : "Selecione o cliente"} />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome} {c.sobrenome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Piscina:</Label>
              <Select value={piscinaId} onValueChange={setPiscinaId} disabled={!clienteId}>
                <SelectTrigger>
                  {piscinaLabel ? (
                    <span className="truncate">{piscinaLabel}</span>
                  ) : (
                    <SelectValue placeholder={!clienteId ? "Selecione um cliente primeiro" : piscinaId ? "Carregando piscina..." : "Selecione a piscina (opcional)"} />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {piscinas.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.tamanho}{p.tipo ? ` — ${p.tipo}` : ""}{p.endereco ? ` (${p.endereco})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Tipo */}
          <div>
            <Label>Tipo de serviço:</Label>
            <Input value={tipoServico} onChange={(e) => setTipoServico(e.target.value)} placeholder="Ex.: Limpeza semanal" />
          </div>

          {/* Dias da semana */}
          <div>
            <Label>Dias da semana: <span className="text-red-500">*</span></Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {DIAS.map((d) => (
                <button
                  key={d.n}
                  type="button"
                  onClick={() => toggleDia(d.n)}
                  className={`px-3 py-2 rounded-md text-sm border transition ${
                    diasSemana.includes(d.n)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-slate-700 border-slate-300 hover:border-blue-400"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Turno + Horário */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Turno: <span className="text-red-500">*</span></Label>
              <Select value={turno} onValueChange={(v) => setTurno(v as any)}>
                <SelectTrigger><SelectValue placeholder="Selecione o turno" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manha">Manhã</SelectItem>
                  <SelectItem value="tarde">Tarde</SelectItem>
                  <SelectItem value="noite">Noite</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Horário: <span className="text-red-500">*</span></Label>
              <Input type="time" value={horario} onChange={(e) => setHorario(e.target.value)} />
            </div>
          </div>

          {/* Vigência */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Início: <span className="text-red-500">*</span></Label>
              <Input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                disabled={!!recorrencia}
              />
            </div>
            <div>
              <Label>Duração: <span className="text-red-500">*</span></Label>
              <Input
                type="number" min={1}
                value={vigenciaQtd ?? ""}
                onChange={(e) => {
                  touchedVigenciaRef.current = true;
                  setVigenciaQtd(e.target.value === "" ? undefined : parseInt(e.target.value));
                }}
                placeholder="Ex.: 8"
              />
            </div>
            <div>
              <Label>Unidade:</Label>
              <Select
                value={vigenciaUnidade}
                onValueChange={(v) => {
                  touchedVigenciaRef.current = true;
                  setVigenciaUnidade(v as any);
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanas">Semanas</SelectItem>
                  <SelectItem value="meses">Meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Financeiro */}
          <div className={`grid grid-cols-1 gap-4 ${recorrencia ? "md:grid-cols-3" : "md:grid-cols-4"}`}>
            <div>
              <Label>Dia de vencimento: <span className="text-red-500">*</span></Label>
              <Input
                type="number" min={1} max={31}
                value={diaVencimento ?? ""}
                onChange={(e) => setDiaVencimento(e.target.value === "" ? undefined : parseInt(e.target.value))}
                placeholder="Ex.: 10"
              />
            </div>
            {!recorrencia && (
              <div>
                <Label>Início da cobrança (mês): <span className="text-red-500">*</span></Label>
                <Select
                  value={cobrancaMes ? String(cobrancaMes) : ""}
                  onValueChange={(v) => setCobrancaMes(parseInt(v))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m.n} value={String(m.n)}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Nº de mensalidades: <span className="text-red-500">*</span></Label>
              <Input
                type="number" min={1}
                value={numMensalidades ?? ""}
                onChange={(e) => setNumMensalidades(e.target.value === "" ? undefined : parseInt(e.target.value))}
                placeholder="Calculado pela vigência"
              />
              {vigenciaUnidade === "semanas" && !!vigenciaQtd && !dataInicio && (
                <p className="text-xs text-amber-600 mt-1">
                  Informe a data de início para calcular os meses cobertos.
                </p>
              )}
            </div>
            <div>
              <Label>Valor da mensalidade (R$): <span className="text-red-500">*</span></Label>
              <Input
                type="number" min={0} step="0.01"
                value={valorMensalidade ?? ""}
                onChange={(e) => setValorMensalidade(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                placeholder="Ex.: 250,00"
              />
            </div>
          </div>

          {/* Observações */}
          <div>
            <Label>Observações:</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
          </div>

          {/* Prévia */}
          {previa && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 text-sm text-blue-900 space-y-1">
              <p className="font-semibold">Prévia</p>
              <p>
                <strong>{previa.ocorrencias.length}</strong> atendimentos entre{" "}
                {dataInicio ? format(parseISO(dataInicio), "dd/MM/yyyy", { locale: ptBR }) : "—"} e{" "}
                {format(previa.fim, "dd/MM/yyyy", { locale: ptBR })}.
              </p>
              {previa.vencimentos.length > 0 && (
                <p>
                  <strong>{previa.vencimentos.length}</strong> cobranças — vencimentos:{" "}
                  {previa.vencimentos
                    .map((d) => format(d, "dd/MM/yyyy", { locale: ptBR }))
                    .join(", ")}
                  .
                </p>
              )}
            </div>
          )}

          <div className="flex justify-center pt-2">
            <Button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 text-white px-8">
              {recorrencia
                ? submitting ? "Salvando..." : "Salvar alterações"
                : submitting ? "Criando..." : "Criar serviço recorrente"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
