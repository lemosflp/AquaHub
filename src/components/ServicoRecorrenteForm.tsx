import { useEffect, useState } from "react";
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
  gerarOcorrencias,
  gerarVencimentos,
} from "@/lib/recorrencia";
import { createServicoRecorrente } from "@/services/supabaseApi";
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

type Props = { onCreated?: () => void };

export function ServicoRecorrenteForm({ onCreated }: Props) {
  const { toast } = useToast();

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
  const [cobrancaInicio, setCobrancaInicio] = useState("");
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
    if (!piscinaId) return "Selecione a piscina.";
    if (diasSemana.length === 0) return "Selecione ao menos um dia da semana.";
    if (!turno) return "Selecione o turno.";
    if (!horario) return "Informe o horário.";
    if (!dataInicio) return "Informe a data de início.";
    if (!vigenciaQtd || vigenciaQtd <= 0) return "Informe a duração da vigência.";
    if (!diaVencimento || diaVencimento < 1 || diaVencimento > 31)
      return "Informe um dia de vencimento entre 1 e 31.";
    if (!cobrancaInicio) return "Informe o mês de início da cobrança.";
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
        // type="month" devolve "YYYY-MM"; normaliza para data válida (1º do mês)
        cobrancaInicio: cobrancaInicio.length === 7 ? `${cobrancaInicio}-01` : cobrancaInicio,
        numMensalidades: numMensalidades!,
        valorMensalidade: valorMensalidade!,
        observacoes: observacoes || null,
      });
      toast({
        title: "Serviço recorrente criado!",
        description: `${res.atendimentos} atendimentos e ${res.cobrancas} cobranças gerados.`,
      });
      onCreated?.();
    } catch (err: any) {
      toast({ title: "Erro ao criar", description: err.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="mb-8 border-l-4 border-l-blue-600 shadow-lg">
      <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
        <CardTitle className="text-blue-900">Serviço recorrente</CardTitle>
        <p className="text-xs text-blue-700 mt-1">
          Gera os atendimentos no calendário e as mensalidades automaticamente
        </p>
      </CardHeader>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Cliente + Piscina */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Cliente: <span className="text-red-500">*</span></Label>
              <Select value={clienteId} onValueChange={handleCliente}>
                <SelectTrigger><SelectValue placeholder="Selecione o cliente" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome} {c.sobrenome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Piscina: <span className="text-red-500">*</span></Label>
              <Select value={piscinaId} onValueChange={setPiscinaId} disabled={!clienteId}>
                <SelectTrigger>
                  <SelectValue placeholder={!clienteId ? "Selecione um cliente primeiro" : "Selecione a piscina"} />
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
              <Input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
            </div>
            <div>
              <Label>Duração: <span className="text-red-500">*</span></Label>
              <Input
                type="number" min={1}
                value={vigenciaQtd ?? ""}
                onChange={(e) => setVigenciaQtd(e.target.value === "" ? undefined : parseInt(e.target.value))}
                placeholder="Ex.: 8"
              />
            </div>
            <div>
              <Label>Unidade:</Label>
              <Select value={vigenciaUnidade} onValueChange={(v) => setVigenciaUnidade(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="semanas">Semanas</SelectItem>
                  <SelectItem value="meses">Meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Financeiro */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label>Dia de vencimento: <span className="text-red-500">*</span></Label>
              <Input
                type="number" min={1} max={31}
                value={diaVencimento ?? ""}
                onChange={(e) => setDiaVencimento(e.target.value === "" ? undefined : parseInt(e.target.value))}
                placeholder="Ex.: 10"
              />
            </div>
            <div>
              <Label>Início da cobrança (mês): <span className="text-red-500">*</span></Label>
              <Input type="month" value={cobrancaInicio} onChange={(e) => setCobrancaInicio(e.target.value)} />
            </div>
            <div>
              <Label>Nº de mensalidades: <span className="text-red-500">*</span></Label>
              <Input
                type="number" min={1}
                value={numMensalidades ?? ""}
                onChange={(e) => setNumMensalidades(e.target.value === "" ? undefined : parseInt(e.target.value))}
                placeholder="Ex.: 6"
              />
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
              {submitting ? "Criando..." : "Criar serviço recorrente"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
