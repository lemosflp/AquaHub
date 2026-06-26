import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  HelpCircle,
  LayoutDashboard,
  ListChecks,
  RefreshCw,
  UserPlus,
  Users,
  Waves,
} from "lucide-react";

const fluxo = [
  {
    title: "Cadastre o cliente",
    description: "Comece em Clientes, registre os dados do responsável e associe as piscinas atendidas.",
    icon: Users,
    route: "/clientes",
    action: "Abrir Clientes",
  },
  {
    title: "Agende o serviço",
    description: "Em Serviços, escolha cliente, piscina, tipo, data e turno. Use recorrente para mensalidades e atendimentos fixos.",
    icon: Waves,
    route: "/Eventos",
    action: "Abrir Serviços",
  },
  {
    title: "Acompanhe cobranças",
    description: "Cada serviço gera cobrança. Em Pagamentos, veja pendências, atrasos, recorrentes e registre recebimentos.",
    icon: CreditCard,
    route: "/pagamentos",
    action: "Abrir Pagamentos",
  },
  {
    title: "Organize a rotina",
    description: "Use o Calendário para enxergar os serviços da semana e abrir rapidamente os detalhes de cada atendimento.",
    icon: Calendar,
    route: "/calendario",
    action: "Abrir Calendário",
  },
];

const telas = [
  {
    title: "Dashboard",
    icon: LayoutDashboard,
    route: "/",
    points: [
      "Mostra os próximos serviços agendados.",
      "Resume o financeiro do mês e os próximos pagamentos.",
      "Destaca pagamentos recorrentes e médias de mensalidades.",
      "No celular, mantém Ações Rápidas no topo para acesso imediato.",
    ],
  },
  {
    title: "Clientes",
    icon: UserPlus,
    route: "/clientes",
    points: [
      "Centraliza dados de contato do cliente.",
      "Permite cadastrar e revisar piscinas vinculadas.",
      "Serve como base para agendamentos e cobranças.",
    ],
  },
  {
    title: "Serviços",
    icon: Waves,
    route: "/Eventos",
    points: [
      "Cria serviços avulsos com cobrança e pagamento inicial.",
      "Cria serviços recorrentes com atendimentos e mensalidades.",
      "Usa turnos Manhã, Tarde e Noite, mantendo o horário técnico no banco.",
      "Permite editar, cancelar, reativar, confirmar e abrir pagamentos.",
    ],
  },
  {
    title: "Pagamentos",
    icon: CreditCard,
    route: "/pagamentos",
    points: [
      "Lista cobranças avulsas e recorrentes no período.",
      "Inclui cobranças atrasadas em aberto.",
      "Filtra por todos, avulso, recorrente e pendentes.",
      "Registra pagamentos totais ou parciais.",
    ],
  },
  {
    title: "Calendário",
    icon: Calendar,
    route: "/calendario",
    points: [
      "Mostra os serviços da semana em visão de agenda.",
      "Usa os turnos para leitura rápida da rotina.",
      "Abre o serviço selecionado para detalhes e ações.",
    ],
  },
];

const boasPraticas = [
  "Cadastre a piscina antes de agendar o primeiro serviço.",
  "Use serviço recorrente quando o atendimento e a cobrança se repetem por vários meses.",
  "Registre pagamentos assim que receber para manter saldo e pendências confiáveis.",
  "Cancele serviços que não serão executados em vez de perder o histórico.",
  "Revise o Dashboard no início do dia para ver próximos serviços e recebimentos.",
];

export default function Ajuda() {
  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 bg-gradient-to-br from-slate-50 to-slate-100 min-h-screen">
      <div className="mb-6 md:mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-foreground">Ajuda</h1>
        <p className="text-muted-foreground mt-2">
          Guia rápido para operar clientes, serviços, recorrências e pagamentos.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-6">
        <div className="space-y-6">
          <Card className="border-l-4 border-l-blue-600 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200">
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <ListChecks size={20} />
                Fluxo recomendado
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {fluxo.map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="rounded-lg border border-blue-200 bg-white p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <Badge className="mb-2 bg-blue-50 text-blue-700 border border-blue-200" variant="outline">
                            Passo {index + 1}
                          </Badge>
                          <h2 className="font-semibold text-slate-900">{item.title}</h2>
                          <p className="mt-1 text-sm text-slate-600 leading-relaxed">{item.description}</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-3 border-blue-300 text-blue-700 hover:bg-blue-50"
                            onClick={() => navigate(item.route)}
                          >
                            {item.action}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-cyan-500 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-cyan-50 to-white border-b border-cyan-200">
              <CardTitle className="flex items-center gap-2 text-cyan-900">
                <HelpCircle size={20} />
                O que cada tela faz
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {telas.map((tela) => {
                  const Icon = tela.icon;
                  return (
                    <div key={tela.title} className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Icon size={18} className="text-cyan-700" />
                          <h2 className="font-semibold text-slate-900">{tela.title}</h2>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs text-cyan-700 hover:bg-cyan-50"
                          onClick={() => navigate(tela.route)}
                        >
                          Abrir
                        </Button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {tela.points.map((point) => (
                          <div key={point} className="flex items-start gap-2 text-sm text-slate-600">
                            <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-green-600" />
                            <span>{point}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-l-4 border-l-emerald-500 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-emerald-50 to-white border-b border-emerald-200">
              <CardTitle className="flex items-center gap-2 text-emerald-900">
                <RefreshCw size={20} />
                Recorrências
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-3 text-sm text-slate-600">
              <p>
                Use recorrência quando o mesmo cliente terá atendimentos repetidos e mensalidades geradas automaticamente.
              </p>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                <p className="font-semibold text-emerald-900">Como funciona</p>
                <p className="mt-1">
                  O sistema cria a série, os atendimentos em Serviços e as cobranças em Pagamentos usando a vigência escolhida.
                </p>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-white p-3">
                <p className="font-semibold text-emerald-900">Ao editar uma série</p>
                <p className="mt-1">
                  O passado é preservado e os próximos atendimentos/cobranças são regenerados conforme a nova configuração.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-amber-500 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-amber-50 to-white border-b border-amber-200">
              <CardTitle className="text-amber-900">Boas práticas</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="space-y-3">
                {boasPraticas.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-amber-600" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-slate-500 shadow-lg">
            <CardHeader className="bg-gradient-to-r from-slate-100 to-white border-b border-slate-200">
              <CardTitle className="text-slate-900">Atalhos úteis</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" className="border-blue-300 text-blue-700" onClick={() => navigate("/")}>
                  Dashboard
                </Button>
                <Button variant="outline" className="border-blue-300 text-blue-700" onClick={() => navigate("/Eventos")}>
                  Serviços
                </Button>
                <Button variant="outline" className="border-blue-300 text-blue-700" onClick={() => navigate("/pagamentos")}>
                  Pagamentos
                </Button>
                <Button variant="outline" className="border-blue-300 text-blue-700" onClick={() => navigate("/clientes")}>
                  Clientes
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
