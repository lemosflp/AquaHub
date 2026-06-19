import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronLeft, ChevronRight, DollarSign, AlertTriangle } from "lucide-react";
import { format, parseISO, startOfWeek, addDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getCobrancasPagamentos, type CobrancaPagamentoItem } from "@/services/supabaseApi";
import { toISODate } from "@/lib/recorrencia";
import { RegistrarPagamentoModal } from "@/components/RegistrarPagamentoModal";

const normalizeDate = (d: Date) => {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type Filtro = "todos" | "avulso" | "recorrente" | "pendentes";

const FILTROS: { v: Filtro; label: string }[] = [
  { v: "todos", label: "Todos" },
  { v: "avulso", label: "Avulso" },
  { v: "recorrente", label: "Recorrente" },
  { v: "pendentes", label: "Pendentes" },
];

function getStatusBadge(item: CobrancaPagamentoItem) {
  if (item.atrasada) return { label: "Atrasado", className: "bg-red-100 text-red-800" };
  switch (item.status) {
    case "pago": return { label: "Pago", className: "bg-green-100 text-green-800" };
    case "parcial": return { label: "Parcial", className: "bg-yellow-100 text-yellow-800" };
    default: return { label: "Pendente", className: "bg-blue-100 text-blue-800" };
  }
}

function formatMoney(v: number) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

export default function Pagamentos() {
  const [currentDate, setCurrentDate] = useState(() => normalizeDate(new Date()));
  const [cobrancas, setCobrancas] = useState<CobrancaPagamentoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [pagamentoAtivo, setPagamentoAtivo] = useState<{ id: string; clienteNome: string } | null>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = Array.from({ length: 7 }, (_, i) => normalizeDate(addDays(weekStart, i)));
  const weekEnd = weekDays[6];
  const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  async function carregar() {
    setLoading(true);
    const data = await getCobrancasPagamentos(toISODate(weekStart), toISODate(weekEnd));
    setCobrancas(data);
    setLoading(false);
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart.getTime()]);

  const navigateWeek = (direction: "prev" | "next") => {
    setCurrentDate(normalizeDate(addDays(currentDate, direction === "next" ? 7 : -7)));
  };
  const goToToday = () => setCurrentDate(normalizeDate(new Date()));

  const filtered = useMemo(() => {
    return cobrancas.filter((c) => {
      if (filtro === "avulso") return c.origem === "avulso";
      if (filtro === "recorrente") return c.origem === "recorrente";
      if (filtro === "pendentes") return c.status !== "pago";
      return true;
    });
  }, [cobrancas, filtro]);

  const atrasadasList = useMemo(
    () => filtered.filter((c) => c.atrasada).sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)),
    [filtered]
  );
  const semanaList = useMemo(
    () =>
      filtered
        .filter((c) => !c.atrasada && weekDays.some((d) => isSameDay(parseISO(c.dataVencimento), d)))
        .sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento)),
    [filtered, weekDays]
  );

  const totalEmAberto = filtered
    .filter((c) => c.status !== "pago")
    .reduce((s, c) => s + c.valor, 0);

  function itensDoDia(day: Date) {
    return filtered.filter((c) => isSameDay(parseISO(c.dataVencimento), day));
  }

  function abrirPagamento(item: CobrancaPagamentoItem) {
    setPagamentoAtivo({ id: item.id, clienteNome: item.clienteNome });
  }

  function fecharPagamento() {
    setPagamentoAtivo(null);
  }

  function aoMudarPagamento() {
    carregar();
  }

  // --- mini calendário: mês atual baseado em currentDate ---
  const monthStart = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1), [currentDate]);
  const monthEnd = useMemo(() => new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0), [currentDate]);
  const daysInMonth = monthEnd.getDate();
  const miniWeekLabels = ["D", "S", "T", "Q", "Q", "S", "S"];

  const diaCorMap = useMemo(() => {
    const map = new Map<number, "red" | "yellow" | "green" | "blue">();
    filtered.forEach((c) => {
      const d = parseISO(c.dataVencimento);
      if (d.getFullYear() !== currentDate.getFullYear() || d.getMonth() !== currentDate.getMonth()) return;
      const dia = d.getDate();
      const cor: "red" | "yellow" | "green" | "blue" = c.atrasada ? "red" : c.status === "parcial" ? "yellow" : c.status === "pago" ? "green" : "blue";
      const atual = map.get(dia);
      const prioridade = { red: 3, blue: 2, yellow: 1, green: 0 };
      if (!atual || prioridade[cor] > prioridade[atual]) map.set(dia, cor);
    });
    return map;
  }, [filtered, currentDate]);

  const corHex: Record<"red" | "yellow" | "green" | "blue", string> = {
    red: "#dc2626",
    yellow: "#ca8a04",
    green: "#16a34a",
    blue: "#2563eb"
  };

  return (
    <div className="p-3 md:p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold text-foreground">Pagamentos</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-2">
          Cobranças avulsas e recorrentes em um só lugar
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTROS.map((f) => (
          <button
            key={f.v}
            type="button"
            onClick={() => setFiltro(f.v)}
            className={`px-4 py-2 rounded-md text-sm font-medium border transition ${
              filtro === f.v
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="text-sm text-muted-foreground mb-6">
        {loading ? "Carregando..." : `${filtered.length} cobranças no período · R$ ${formatMoney(totalEmAberto)} em aberto`}
      </div>

      {pagamentoAtivo && (
        <RegistrarPagamentoModal
          cobrancaId={pagamentoAtivo.id}
          clienteNome={pagamentoAtivo.clienteNome}
          onClose={fecharPagamento}
          onChanged={aoMudarPagamento}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Grid semanal */}
        <div className="lg:col-span-3">
          <Card className="border-l-4 border-l-blue-600 shadow-lg bg-white">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2 text-blue-900">
                  <Calendar size={20} />
                  {capitalize(format(weekStart, "MMMM yyyy", { locale: ptBR }))}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => navigateWeek("prev")}>
                    <ChevronLeft size={16} />
                  </Button>
                  <Button variant="outline" size="sm" className="border-blue-300 text-blue-700 hover:bg-blue-50" onClick={() => navigateWeek("next")}>
                    <ChevronRight size={16} />
                  </Button>
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white ml-2" onClick={goToToday}>
                    Hoje
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {/* Cabeçalho dos dias */}
              <div className="grid grid-cols-7 gap-1 md:gap-2 mb-4">
                {dayLabels.map((label, index) => (
                  <div key={index} className="text-center font-semibold text-blue-700 p-1 md:p-2 text-xs md:text-sm bg-blue-50 rounded border border-blue-200">
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{label.charAt(0)}</span>
                  </div>
                ))}
              </div>

              {/* Grade da semana */}
              <div className="grid grid-cols-7 gap-1 md:gap-2 mb-6">
                {weekDays.map((day, index) => {
                  const itens = itensDoDia(day);
                  const hasItens = itens.length > 0;
                  const isToday = isSameDay(day, normalizeDate(new Date()));

                  return (
                    <div
                      key={index}
                      className={`min-h-24 md:min-h-32 border-2 rounded-lg p-2 md:p-3 flex flex-col transition-all ${
                        isToday ? "border-blue-500 bg-blue-50" : hasItens ? "border-blue-300 bg-slate-50" : "border-slate-200 bg-white hover:border-blue-300"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`text-sm font-bold ${isToday ? "text-blue-600" : "text-slate-700"}`}>{format(day, "d")}</span>
                        {hasItens && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-blue-600 text-white font-semibold">{itens.length}</span>
                        )}
                      </div>

                      <div className="flex-1" />

                      <div className="space-y-1 mt-2">
                        {itens.map((item) => {
                          const badge = getStatusBadge(item);
                          const corPill = item.atrasada
                            ? "bg-red-600 text-white"
                            : item.status == "pendente"
                            ? "bg-blue-600 text-white"
                            : item.status === "pago"
                            ? "bg-green-600 text-white"
                            : item.status === "parcial"
                            ? "bg-yellow-600 text-white"
                            : "bg-red-600 text-white"
                          return (
                            <div
                              key={item.id}
                              onClick={() => abrirPagamento(item)}
                              className={`cursor-pointer text-[10px] sm:text-xs px-2 py-1 rounded font-semibold text-center truncate ${corPill}`}
                              title={`${item.clienteNome} · R$ ${formatMoney(item.valor)} · ${badge.label}`}
                            >
                              R$ {formatMoney(item.valor)}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Atrasadas: sempre visíveis, independente da semana exibida */}
              <div className="space-y-3 mt-8 pt-6 border-t-2 border-slate-200">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <AlertTriangle size={18} className="text-red-600" />
                  Atrasadas
                  <span className="text-xs font-normal text-red-700">(independem da semana exibida)</span>
                </h3>
                <div className="space-y-2">
                  {atrasadasList.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-sm">Nenhuma cobrança atrasada. 🎉</div>
                  ) : (
                    atrasadasList.map((item) => {
                      const badge = getStatusBadge(item);
                      return (
                        <div
                          key={item.id}
                          onClick={() => abrirPagamento(item)}
                          className="cursor-pointer flex items-center gap-4 p-3 border border-blue-200 rounded-lg hover:shadow-md hover:border-blue-400 bg-white transition-all"
                        >
                          <div className="w-4 h-4 rounded-full flex-shrink-0 bg-red-600" />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-slate-800">{item.clienteNome}</div>
                            <div className="text-xs text-slate-600">
                              <span className="font-medium">{format(parseISO(item.dataVencimento), "dd/MM/yyyy")}</span>
                              {item.tipoServico && <> {" • "}<span>{item.tipoServico}</span></>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                              {item.origem === "avulso" ? "Avulso" : "Recorrente"}
                            </Badge>
                            <Badge className={`text-xs ${badge.className}`}>{badge.label}</Badge>
                            <span className="font-bold text-slate-800 text-sm">R$ {formatMoney(item.valor)}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Cobranças desta semana */}
              <div className="space-y-3 mt-8 pt-6 border-t-2 border-slate-200">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <DollarSign size={18} className="text-blue-600" />
                  Cobranças desta semana
                </h3>
                <div className="space-y-2">
                  {semanaList.map((item) => {
                    const badge = getStatusBadge(item);
                    return (
                      <div
                        key={item.id}
                        onClick={() => abrirPagamento(item)}
                        className="cursor-pointer flex items-center gap-4 p-3 border border-blue-200 rounded-lg hover:shadow-md hover:border-blue-400 bg-white transition-all"
                      >
                        <div
                          className={`w-4 h-4 rounded-full flex-shrink-0 ${
                            item.status === "pago" ? "bg-green-600" : item.status === "parcial" ? "bg-yellow-600" : "bg-blue-600"
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800">{item.clienteNome}</div>
                          <div className="text-xs text-slate-600">
                            <span className="font-medium">{format(parseISO(item.dataVencimento), "dd/MM/yyyy")}</span>
                            {item.tipoServico && <> {" • "}<span>{item.tipoServico}</span></>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-800">
                            {item.origem === "avulso" ? "Avulso" : "Recorrente"}
                          </Badge>
                          <Badge className={`text-xs ${badge.className}`}>{badge.label}</Badge>
                          <span className="font-bold text-slate-800 text-sm">R$ {formatMoney(item.valor)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {semanaList.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      <Calendar size={32} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">Nenhuma cobrança nesta semana.</p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: mini calendário */}
        <div className="space-y-6">
          <Card className="border-l-4 border-l-blue-500 shadow-lg bg-white">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-200">
              <CardTitle className="text-base flex items-center gap-2 text-blue-900">
                <Calendar size={18} />
                {capitalize(format(currentDate, "MMMM yyyy", { locale: ptBR }))}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {miniWeekLabels.map((label, idx) => (
                  <div key={idx} className="p-1 font-bold text-blue-700 text-xs">
                    {label}
                  </div>
                ))}

                {Array.from({ length: monthStart.getDay() }, (_, i) => i).map((i) => (
                  <div key={`empty-${i}`} className="p-1 text-xs text-transparent">.</div>
                ))}

                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const isTodayInMonth =
                    day === new Date().getDate() &&
                    currentDate.getMonth() === new Date().getMonth() &&
                    currentDate.getFullYear() === new Date().getFullYear();
                  const cor = diaCorMap.get(day);

                  return (
                    <div
                      key={day}
                      className={`relative flex flex-col items-center justify-center p-2 text-xs rounded-lg transition-all cursor-default font-medium ${
                        isTodayInMonth ? "text-white bg-blue-600" : cor ? "text-blue-700 bg-blue-50 border border-blue-300" : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span>{day}</span>
                      {cor && !isTodayInMonth && (
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: corHex[cor] }} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-slate-200 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-600" />
                  <span className="text-slate-700">Hoje</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: corHex.red }} />
                  <span className="text-slate-700">Atrasada</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: corHex.blue }} />
                  <span className="text-slate-700">Pendente</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: corHex.yellow }} />
                  <span className="text-slate-700">Parcial</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: corHex.green }} />
                  <span className="text-slate-700">Pago</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
