import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronLeft, ChevronRight, Plus, CircleDot, Share2, Download } from "lucide-react";
import { format, parseISO, startOfWeek, addDays, isSameDay, isValid } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAppContext } from "@/contexts/AppContext";
import type { Evento } from "@/types";
import { getTurnoLabelFromHorario } from "@/lib/turnos";

// --- helpers de data ---

const normalizeDate = (d: Date) => {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
};

// aceita ISO (yyyy-MM-dd) que vem do input type="date"
const parseDataEvento = (data: string): Date => {
  if (!data) return normalizeDate(new Date());
  const raw = data.trim();

  try {
    const iso = parseISO(raw);
    if (isValid(iso)) return normalizeDate(iso);
  } catch {}

  return normalizeDate(new Date());
};

// helper para hora: aceita "19:00"
const parseHoraEvento = (raw: string | undefined): { h: number; m: number } => {
  if (!raw) return { h: 0, m: 0 };
  const horaStr = raw.trim();
  const [hStr, mStr] = horaStr.split(":");
  const h = Number(hStr ?? 0);
  const m = Number(mStr ?? 0);
  return { h, m };
};

// helper para capitalizar primeira letra
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- tipos internos ---

type EventoCalendario = Evento & {
  dataDate: Date;
  dataHoraInicio: Date;
};

// --- componente ---

export default function Calendario() {
  const navigate = useNavigate();
  const [servicos, setServicos] = useState<any[]>([]);
  const [currentDate, setCurrentDate] = useState(() => normalizeDate(new Date()));

  // carregar servicos para o calendário
  useState(() => {}); // placeholder to satisfy hooks ordering

  const EventosProcessados = useMemo<EventoCalendario[]>(() => {
    const result = servicos.map((evento: any, idx) => {
      // data field is data (YYYY-MM-DD):
      const dataBase = parseDataEvento(String(evento.data || evento.data_agendamento || ""));
      const horaStr = evento.horario || evento.hora || evento.horaInicio || "";
      const { h, m } = parseHoraEvento(horaStr as string);
      const dataHoraInicio = new Date(dataBase);
      dataHoraInicio.setHours(h || 0, m || 0, 0, 0);

      return {
        id: evento.id ?? `svc-${idx}`,
        titulo: evento.tipoServico ? `Serviço: ${evento.tipoServico}` : `Serviço - ${evento.clienteNome}`,
        clienteId: evento.clienteId,
        clienteNome: evento.clienteNome || "",
        data: evento.data || evento.data_agendamento || "",
        horaInicio: horaStr || "",
        tipo: evento.tipoServico || "servico",
        status: evento.status || "pendente",
        observacoes: evento.observacoes || "",
        valor: 0,
        userId: evento.userId || "",
        dataDate: dataBase,
        dataHoraInicio,
      } as EventoCalendario;
    });

    return result;
  }, [servicos]);

  // carregar servicos via API
  useMemo(() => {
    let canceled = false;
    (async () => {
      try {
        const { getServicosApi } = await import("@/services/supabaseApi");
        const s = await getServicosApi();
        if (!canceled) setServicos(s);
      } catch (err) {
        console.error('[Calendario] Erro ao carregar servicos:', err);
      }
    })();
    return () => { canceled = true; };
  }, []);

  // Semana atual
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 }); // domingo
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    normalizeDate(addDays(weekStart, i))
  );
  const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  // Eventos por dia da semana
  const EventosPorDia: Record<string, EventoCalendario[]> = useMemo(() => {
    const map: Record<string, EventoCalendario[]> = {};
    weekDays.forEach((day) => {
      const key = day.toISOString();
      map[key] = [];
    });

    EventosProcessados.forEach((ev) => {
      weekDays.forEach((day) => {
        if (isSameDay(ev.dataDate, day)) {
          const key = day.toISOString();
          map[key] = map[key] || [];
          map[key].push(ev);
        }
      });
    });

    Object.keys(map).forEach((k) => {
      map[k].sort(
        (a, b) => a.dataHoraInicio.getTime() - b.dataHoraInicio.getTime()
      );
    });

    return map;
  }, [EventosProcessados, weekDays]);

  const navigateWeek = (direction: "prev" | "next") => {
    const newDate = addDays(currentDate, direction === "next" ? 7 : -7);
    setCurrentDate(normalizeDate(newDate));
  };

  const goToToday = () => {
    setCurrentDate(normalizeDate(new Date()));
  };

  const handleGoogleCalendarIntegration = () => {
    if (EventosProcessados.length === 0) {
      alert("Nenhum evento para adicionar ao Google Calendar");
      return;
    }

    const firstEvent = EventosProcessados[0];

    const title = encodeURIComponent(firstEvent.titulo ?? "Evento");
    
    // Constrói descrição com todas informações
    const descriptionParts = [
      `Cliente: ${firstEvent.clienteNome ?? "N/A"}`,
      `Tipo: ${firstEvent.tipo ?? "N/A"}`,
      `Turno: ${getTurnoLabelFromHorario(firstEvent.horaInicio)}`,
      firstEvent.aniversarianteNome ? `Aniversariante: ${firstEvent.aniversarianteNome}${firstEvent.idade ? ` (${firstEvent.idade} anos)` : ""}` : null,
      firstEvent.decoracao ? `Decoração: ${firstEvent.decoracao}` : null,
      firstEvent.quantidadeConvidados ? `Quantidade de Convidados: ${firstEvent.quantidadeConvidados}` : null,
      firstEvent.observacoes ? `Observações: ${firstEvent.observacoes}` : null,
    ].filter(Boolean);
    
    const description = encodeURIComponent(descriptionParts.join("\n"));
    
    const startDate = format(firstEvent.dataDate, "yyyyMMdd");
    const [hours, minutes] = (firstEvent.horaInicio ?? "00:00").split(":");
    const startTime = `${hours}${minutes}00`;
    const endTime = `${String(Number(hours) + 1).padStart(2, "0")}${minutes}00`;

    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${description}&dates=${startDate}T${startTime}Z/${startDate}T${endTime}Z`;
    window.open(googleCalendarUrl, "_blank");
  };

  const handleExportCalendar = () => {
    if (EventosProcessados.length === 0) {
      alert("Nenhum evento para exportar");
      return;
    }

    // Constrói arquivo ICS
    let icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Meu Salao//Calendar//PT
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Meu Salao - Eventos
X-WR-TIMEZONE:America/Sao_Paulo
BEGIN:VTIMEZONE
TZID:America/Sao_Paulo
BEGIN:STANDARD
DTSTART:20230101T000000
TZOFFSETFROM:-0300
TZOFFSETTO:-0300
TZNAME:BRST
END:STANDARD
END:VTIMEZONE
`;

    EventosProcessados.forEach((ev) => {
      const startDate = format(ev.dataDate, "yyyyMMdd");
      const [hours, minutes] = (ev.horaInicio ?? "00:00").split(":");
      const startDateTime = `${startDate}T${hours}${minutes}00`;
      const endDateTime = `${startDate}T${String(Number(hours) + 1).padStart(2, "0")}${minutes}00`;
      const uid = `${ev.id}@meusalao.local`;
      const title = (ev.titulo ?? "Evento").replace(/"/g, '\\"');
      const description = `Cliente: ${ev.clienteNome ?? "N/A"} | Tipo: ${ev.tipo ?? "N/A"}`.replace(/"/g, '\\"');

      icsContent += `BEGIN:VEVENT
UID:${uid}
DTSTART:${startDateTime}
DTEND:${endDateTime}
SUMMARY:${title}
DESCRIPTION:${description}
STATUS:${ev.status === "confirmado" ? "CONFIRMED" : "TENTATIVE"}
END:VEVENT
`;
    });

    icsContent += `END:VCALENDAR`;

    // Cria blob e faz download
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `calendario_meusalao_${format(new Date(), "ddMMyyyy")}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const getTipoColor = (tipo?: string) => {
    switch (tipo) {
      case "festa":
        return "bg-event-primary text-white";
      case "casamento":
        return "bg-pink-500 text-white";
      // case "aniversario":
      //   return "bg-event-secondary text-white";
      case "corporativo":
        return "bg-gray-600 text-white";
      default:
        return "bg-primary text-primary-foreground";
    }
  };

  // Mini calendário: mês atual baseado em currentDate
  const monthStart = useMemo(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth(), 1),
    [currentDate]
  );
  const monthEnd = useMemo(
    () => new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0),
    [currentDate]
  );
  const daysInMonth = monthEnd.getDate();

  // dias da semana para o cabeçalho do mini calendário
  const miniWeekLabels = ["D", "S", "T", "Q", "Q", "S", "S"];

  // mapa de dias do mês que têm pelo menos um evento
  const daysWithEventsInMonth = useMemo(() => {
    const map = new Set<number>();
    EventosProcessados.forEach(ev => {
      const d = ev.dataDate;
      if (
        d.getFullYear() === currentDate.getFullYear() &&
        d.getMonth() === currentDate.getMonth()
      ) {
        map.add(d.getDate());
      }
    });
    return map;
  }, [EventosProcessados, currentDate]);

  return (
    <div className="p-3 md:p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      {/* Header */}
      <div className="mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold text-foreground">Calendário</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-2">
          Visualize os Serviços agendados na semana
        </p>
      </div>

      <div className="flex justify-end mb-6 md:mb-8">
        <Button
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 md:px-6 flex items-center gap-2 text-sm md:text-base"
          onClick={() => navigate(`/Eventos?showForm=true`)}
        >
          <Plus size={16} className="md:w-5 md:h-5" />
          <span className="hidden sm:inline">Agendar Serviço</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
        {/* Calendário semanal */}
        <div className="lg:col-span-3">
          <Card className="border-l-4 border-l-blue-600 shadow-lg bg-white">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2 text-blue-900">
                  <Calendar size={20} />
                  {capitalize(format(weekStart, "MMMM yyyy", { locale: ptBR }))}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={() => navigateWeek("prev")}
                  >
                    <ChevronLeft size={16} />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={() => navigateWeek("next")}
                  >
                    <ChevronRight size={16} />
                  </Button>
                  <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white ml-2"
                    onClick={goToToday}
                  >
                    Hoje
                  </Button>
                  {/* <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 ml-2"
                    onClick={handleGoogleCalendarIntegration}
                    title="Integrar com Google Calendar"
                  >
                    <Share2 size={16} />
                  </Button> */}
                  {/* <Button
                    variant="outline"
                    size="sm"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50 ml-2"
                    onClick={handleExportCalendar}
                    title="Exportar calendário como ICS"
                  >
                    <Download size={16} />
                  </Button> */}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {/* Cabeçalho dos dias */}
              <div className="grid grid-cols-7 gap-1 md:gap-2 mb-4">
                {dayLabels.map((label, index) => (
                  <div
                    key={index}
                    className="text-center font-semibold text-blue-700 p-1 md:p-2 text-xs md:text-sm bg-blue-50 rounded border border-blue-200"
                  >
                    <span className="hidden sm:inline">{label}</span>
                    <span className="sm:hidden">{label.charAt(0)}</span>
                  </div>
                ))}
              </div>

              {/* Grade da semana */}
              <div className="grid grid-cols-7 gap-1 md:gap-2 mb-6">
                {weekDays.map((day, index) => {
                  const key = day.toISOString();
                  const EventosDia = EventosPorDia[key] || [];
                  const hasEventos = EventosDia.length > 0;
                  const isToday = isSameDay(day, normalizeDate(new Date()));

                  return (
                    <div
                      key={index}
                      className={`min-h-24 md:min-h-32 border-2 rounded-lg p-2 md:p-3 flex flex-col transition-all ${
                        isToday
                          ? "border-blue-500 bg-blue-50"
                          : hasEventos
                          ? "border-blue-300 bg-slate-50"
                          : "border-slate-200 bg-white hover:border-blue-300"
                      }`}
                    >
                      {/* Dia */}
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className={`text-sm font-bold ${
                            isToday ? "text-blue-600" : "text-slate-700"
                          }`}
                        >
                          {format(day, "d")}
                        </span>
                        {hasEventos && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-blue-600 text-white font-semibold">
                            {EventosDia.length}
                          </span>
                        )}
                      </div>

                      <div className="flex-1" />

                      {/* Eventos (horários) na parte de baixo */}
                      <div className="space-y-1 mt-2">
                        {EventosDia.map((evento) => (
                          <div
                            key={evento.id}
                                                    onClick={() => navigate(`/Eventos?viewId=${evento.id}`)}
                                                    className={`cursor-pointer text-[10px] sm:text-xs px-2 py-1 rounded font-semibold text-center truncate ${getTipoColor(
                                                      evento.tipo
                                                    )}`}
                                                    title={`${evento.titulo ?? ""} - ${getTurnoLabelFromHorario(evento.horaInicio)}`}
                                                  >
                                                    <span className="mr-1">{getTurnoLabelFromHorario(evento.horaInicio)}</span>
                                                    <span className="hidden sm:inline truncate">
                                                      {evento.titulo ?? "Evento"}
                                                    </span>
                                                  </div>
                                                ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Lista dos Eventos da semana */}
              <div className="space-y-4 mt-8 pt-6 border-t-2 border-slate-200">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                  <Calendar size={18} className="text-blue-600" />
                  Serviços desta semana
                </h3>
                <div className="space-y-2">
                  {EventosProcessados
                    .filter((ev) =>
                      weekDays.some((day) => isSameDay(ev.dataDate, day))
                    )
                    .sort(
                      (a, b) =>
                        a.dataHoraInicio.getTime() - b.dataHoraInicio.getTime()
                    )
                    .map((ev) => (
                      <div
                        key={ev.id}
                        onClick={() => navigate('/eventos', { state: { showForm: false, selectedServico: true, pagamentoModal: false, viewId: ev.id } })}
                        className="cursor-pointer flex items-center gap-4 p-3 border border-blue-200 rounded-lg hover:shadow-md hover:border-blue-400 bg-white transition-all"
                      >
                        <div
                          className={`w-4 h-4 rounded-full flex-shrink-0 ${getTipoColor(
                            ev.tipo
                          ).split(" ")[0]}`}
                        ></div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-slate-800">
                            {ev.titulo ?? "Evento"}
                          </div>
                          <div className="text-xs text-slate-600">
                            <span className="font-medium">
                              {format(ev.dataDate, "dd/MM/yyyy")}
                            </span>
                            {" • "}
                            <span>{getTurnoLabelFromHorario(ev.horaInicio)}</span>
                            {ev.clienteNome && (
                              <>
                                {" • "}
                                <span className="font-medium">{ev.clienteNome}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {ev.tipo && (
                            <Badge
                              variant="secondary"
                              className="text-xs bg-blue-100 text-blue-800"
                            >
                              {ev.tipo}
                            </Badge>
                          )}
                          {ev.status && (
                            <Badge
                              variant={
                                ev.status === "confirmado"
                                  ? "default"
                                  : "secondary"
                              }
                              className={`text-xs ${
                                ev.status === "confirmado"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {ev.status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  {EventosProcessados.filter((ev) =>
                    weekDays.some((day) => isSameDay(ev.dataDate, day))
                  ).length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                      <Calendar size={32} className="mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">Nenhum evento cadastrado nesta semana.</p>
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
                {/* cabeçalho D S T Q Q S S */}
                {miniWeekLabels.map((label, idx) => (
                  <div
                    key={idx}
                    className="p-1 font-bold text-blue-700 text-xs"
                  >
                    {label}
                  </div>
                ))}

                {/* preenche dias em branco antes do dia 1, se necessário */}
                {Array.from(
                  { length: monthStart.getDay() },
                  (_, i) => i
                ).map(i => (
                  <div key={`empty-${i}`} className="p-1 text-xs text-transparent">
                    .
                  </div>
                ))}

                {/* dias do mês */}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                  const isTodayInMonth =
                    day === new Date().getDate() &&
                    currentDate.getMonth() === new Date().getMonth() &&
                    currentDate.getFullYear() === new Date().getFullYear();

                  const hasEvent = daysWithEventsInMonth.has(day);

                  return (
                    <div
                      key={day}
                      className={`relative flex flex-col items-center justify-center p-2 text-xs rounded-lg transition-all cursor-default font-medium ${
                        isTodayInMonth
                          ? "text-white bg-blue-600"
                          : hasEvent
                          ? "text-blue-700 bg-blue-50 border border-blue-300"
                          : "text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span>{day}</span>
                      {hasEvent && !isTodayInMonth && (
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Legenda */}
              <div className="mt-6 pt-4 border-t border-slate-200 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-600"></div>
                  <span className="text-slate-700">Hoje</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                  <span className="text-slate-700">Com Serviços</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
