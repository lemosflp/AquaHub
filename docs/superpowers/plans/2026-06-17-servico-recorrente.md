# Serviço Recorrente com Mensalidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastrar serviços recorrentes que geram automaticamente os atendimentos no calendário e provisionam as mensalidades, com edição do dia de vencimento (reflete em cobranças futuras) e cancelamento da série.

**Architecture:** Tabela-pai `servicos_recorrentes` agrupa a série; cada atendimento é uma linha em `servicos` e cada mensalidade uma linha em `cobrancas`, ambas com `recorrencia_id`. Funções puras de data isoladas em `src/lib/recorrencia.ts`; orquestração no `src/services/supabaseApi.ts`; UI num componente dedicado `ServicoRecorrenteForm` acionado por um toggle na página de Serviços.

**Tech Stack:** React 18 + TypeScript, Vite, shadcn/ui, Supabase JS, date-fns.

**Spec:** `docs/superpowers/specs/2026-06-17-servico-recorrente-design.md`

---

## ⚠️ Convenções deste plano (preferências do usuário)

- **NÃO commitar automaticamente.** Onde houver "Checkpoint", apenas verifique. Commitar é decisão do usuário.
- **Sem testes automatizados.** A verificação de cada task é: type-check (`npx tsc --noEmit`) sem erros + conferência manual no navegador (`npm run dev`).
- O schema do banco é gerido no painel do Supabase (não há migrations no repo). A Task 1 entrega o SQL para aplicar manualmente.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| (painel Supabase) | Tabela `servicos_recorrentes` + colunas `recorrencia_id` + RLS | Manual (SQL) |
| `src/types/index.ts` | Tipo `ServicoRecorrente` e tipos auxiliares | Modificar |
| `src/lib/recorrencia.ts` | Funções puras de data (vigência, ocorrências, vencimentos) | Criar |
| `src/services/supabaseApi.ts` | `createServicoRecorrente`, `getServicosRecorrentes`, `updateDiaVencimentoRecorrente`, `cancelarServicoRecorrente` | Modificar |
| `src/components/ServicoRecorrenteForm.tsx` | Formulário de cadastro + prévia | Criar |
| `src/components/ServicosRecorrentesList.tsx` | Lista das séries + editar dia + cancelar | Criar |
| `src/pages/Eventos.tsx` | Toggle Avulso × Recorrente; render do form recorrente e da lista | Modificar |

---

## Task 1: Schema no Supabase (manual)

**Files:** nenhum no repo — aplicar SQL no painel do Supabase (SQL Editor).

- [ ] **Step 1: Rodar o DDL no SQL Editor do Supabase**

```sql
-- 1) Tabela-pai
create table public.servicos_recorrentes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  client_id uuid not null,
  piscina_id uuid not null,
  tipo_servico text,
  dias_semana smallint[] not null,
  turno text not null,
  horario time not null,
  data_inicio date not null,
  vigencia_qtd int not null,
  vigencia_unidade text not null,
  data_fim date not null,
  dia_vencimento smallint not null,
  cobranca_inicio date not null,
  num_mensalidades int not null,
  valor_mensalidade numeric not null,
  status text not null default 'ativo',
  observacoes text,
  created_at timestamptz default now()
);

-- 2) Vínculo nas tabelas filhas
alter table public.servicos  add column recorrencia_id uuid references public.servicos_recorrentes(id);
alter table public.cobrancas add column recorrencia_id uuid references public.servicos_recorrentes(id);

create index on public.servicos  (recorrencia_id);
create index on public.cobrancas (recorrencia_id);

-- 3) RLS
alter table public.servicos_recorrentes enable row level security;

create policy "select_own" on public.servicos_recorrentes
  for select using (auth.uid() = user_id);
create policy "insert_own" on public.servicos_recorrentes
  for insert with check (auth.uid() = user_id);
create policy "update_own" on public.servicos_recorrentes
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete_own" on public.servicos_recorrentes
  for delete using (auth.uid() = user_id);
```

- [ ] **Step 2: Verificar**

No Supabase → Table Editor: confirmar que `servicos_recorrentes` existe, que `servicos` e `cobrancas` ganharam a coluna `recorrencia_id`, e que RLS está habilitado em `servicos_recorrentes`.

---

## Task 2: Tipo `ServicoRecorrente`

**Files:**
- Modify: `src/types/index.ts` (acrescentar ao final)

- [ ] **Step 1: Adicionar o tipo e auxiliares**

Acrescente ao final de `src/types/index.ts`:

```ts
export type Turno = "manha" | "tarde" | "noite";
export type VigenciaUnidade = "semanas" | "meses";
export type StatusRecorrencia = "ativo" | "cancelado" | "concluido";

export interface ServicoRecorrente {
  id: string;
  user_id: string;
  client_id: string;
  piscina_id: string;
  tipo_servico?: string | null;
  dias_semana: number[];        // 0=Dom .. 6=Sáb
  turno: Turno;
  horario: string;              // 'HH:mm:ss' ou 'HH:mm'
  data_inicio: string;          // 'yyyy-MM-dd'
  vigencia_qtd: number;
  vigencia_unidade: VigenciaUnidade;
  data_fim: string;             // 'yyyy-MM-dd'
  dia_vencimento: number;       // 1..31
  cobranca_inicio: string;      // 'yyyy-MM-dd' (apenas ano/mês importam)
  num_mensalidades: number;
  valor_mensalidade: number;
  status: StatusRecorrencia;
  observacoes?: string | null;
  created_at?: string;
}
```

- [ ] **Step 2: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: sem novos erros.

---

## Task 3: Funções puras de data (`src/lib/recorrencia.ts`)

**Files:**
- Create: `src/lib/recorrencia.ts`

- [ ] **Step 1: Criar o módulo completo**

```ts
import {
  addDays,
  addMonths,
  format,
  getDay,
  getDaysInMonth,
  parseISO,
  startOfMonth,
} from "date-fns";

export type VigenciaUnidade = "semanas" | "meses";

/** Converte Date -> 'yyyy-MM-dd' (data local, sem fuso). */
export function toISODate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** Faz parse de 'yyyy-MM-dd' em Date local normalizada (00:00). */
export function fromISODate(s: string): Date {
  const d = parseISO(s);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Fim da vigência a partir do início + quantidade + unidade. */
export function calcularDataFim(
  dataInicio: Date,
  qtd: number,
  unidade: VigenciaUnidade
): Date {
  return unidade === "semanas"
    ? addDays(dataInicio, qtd * 7)
    : addMonths(dataInicio, qtd);
}

/**
 * Lista de datas de atendimento dentro de [dataInicio, dataFim] (inclusive)
 * cujos dias-da-semana estão em diasSemana (0=Dom..6=Sáb).
 */
export function gerarOcorrencias(
  dataInicio: Date,
  dataFim: Date,
  diasSemana: number[]
): Date[] {
  const ocorrencias: Date[] = [];
  const dias = new Set(diasSemana);
  let cursor = new Date(dataInicio);
  cursor.setHours(0, 0, 0, 0);
  const fim = new Date(dataFim);
  fim.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= fim.getTime()) {
    if (dias.has(getDay(cursor))) {
      ocorrencias.push(new Date(cursor));
    }
    cursor = addDays(cursor, 1);
  }
  return ocorrencias;
}

/** Aplica o dia fixo dentro do mês de `base`, com clamp no último dia do mês. */
export function aplicarDiaFixo(base: Date, diaFixo: number): Date {
  const ultimoDia = getDaysInMonth(base);
  const dia = Math.min(diaFixo, ultimoDia);
  return new Date(base.getFullYear(), base.getMonth(), dia);
}

/**
 * Datas de vencimento das mensalidades, começando no mês de `mesInicial`,
 * sempre no `diaFixo` (com clamp de fim de mês), por `numMensalidades` meses.
 */
export function gerarVencimentos(
  mesInicial: Date,
  diaFixo: number,
  numMensalidades: number
): Date[] {
  const vencimentos: Date[] = [];
  const primeiroMes = startOfMonth(mesInicial);
  for (let i = 0; i < numMensalidades; i++) {
    const mes = addMonths(primeiroMes, i);
    vencimentos.push(aplicarDiaFixo(mes, diaFixo));
  }
  return vencimentos;
}
```

- [ ] **Step 2: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Conferência manual rápida (raciocínio)**

Confira mentalmente com a spec:
- `calcularDataFim(2026-06-17, 4, "semanas")` → 2026-07-15.
- `gerarVencimentos(2026-07-01, 31, 3)` → 2026-07-31, 2026-08-31, 2026-09-30 (clamp em setembro).
- `gerarVencimentos(2026-01-15, 31, 2)` → 2026-01-31, 2026-02-28 (clamp em fevereiro).

- [ ] **Step 4: Checkpoint** (sem commit — verificação acima concluída)

---

## Task 4: API `createServicoRecorrente` (criação + rollback)

**Files:**
- Modify: `src/services/supabaseApi.ts`

- [ ] **Step 1: Adicionar imports no topo de `supabaseApi.ts`**

Logo abaixo da linha `import { supabase } from "@/lib/supabaseClient";` adicione:

```ts
import { parseISO } from "date-fns";
import {
  calcularDataFim,
  gerarOcorrencias,
  gerarVencimentos,
  aplicarDiaFixo,
  toISODate,
} from "@/lib/recorrencia";
import type { ServicoRecorrente } from "@/types";
```

- [ ] **Step 2: Adicionar o payload e a função (ao final do arquivo)**

```ts
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
```

- [ ] **Step 3: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Checkpoint** (a verificação funcional acontece na Task 8, pela UI)

---

## Task 5: API de leitura, edição do dia e cancelamento

**Files:**
- Modify: `src/services/supabaseApi.ts` (acrescentar após `createServicoRecorrente`)

- [ ] **Step 1: Adicionar `getServicosRecorrentes`**

```ts
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
```

- [ ] **Step 2: Adicionar `updateDiaVencimentoRecorrente`**

```ts
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
```

- [ ] **Step 3: Adicionar `cancelarServicoRecorrente`**

```ts
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
```

- [ ] **Step 4: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 5: Checkpoint**

---

## Task 6: Componente `ServicoRecorrenteForm`

**Files:**
- Create: `src/components/ServicoRecorrenteForm.tsx`

- [ ] **Step 1: Criar o componente completo**

```tsx
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
  toISODate,
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
        cobrancaInicio,
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
              <Input type="date" value={cobrancaInicio} onChange={(e) => setCobrancaInicio(e.target.value)} />
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
```

- [ ] **Step 2: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Checkpoint** (render/funcional na Task 8)

---

## Task 7: Componente `ServicosRecorrentesList` (editar dia + cancelar)

**Files:**
- Create: `src/components/ServicosRecorrentesList.tsx`

- [ ] **Step 1: Criar o componente completo**

```tsx
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  getServicosRecorrentes,
  updateDiaVencimentoRecorrente,
  cancelarServicoRecorrente,
} from "@/services/supabaseApi";
import type { ServicoRecorrente } from "@/types";

type Serie = ServicoRecorrente & { cliente_nome?: string };

export function ServicosRecorrentesList({ refreshKey }: { refreshKey?: number }) {
  const { toast } = useToast();
  const [series, setSeries] = useState<Serie[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [novoDia, setNovoDia] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await getServicosRecorrentes();
    setSeries(data);
  }

  useEffect(() => {
    load();
  }, [refreshKey]);

  async function salvarDia(id: string) {
    if (!novoDia || novoDia < 1 || novoDia > 31) {
      toast({ title: "Dia inválido", description: "Informe um dia entre 1 e 31.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await updateDiaVencimentoRecorrente(id, novoDia);
      toast({ title: "Dia de vencimento atualizado", description: `${res.atualizadas} cobranças futuras ajustadas.` });
      setEditId(null);
      setNovoDia(undefined);
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao atualizar", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function cancelar(id: string) {
    if (!window.confirm("Cancelar esta série? Atendimentos e cobranças futuras serão removidos.")) return;
    setBusy(true);
    try {
      await cancelarServicoRecorrente(id);
      toast({ title: "Série cancelada" });
      await load();
    } catch (err: any) {
      toast({ title: "Erro ao cancelar", description: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (series.length === 0) {
    return <div className="text-sm text-muted-foreground">Nenhum serviço recorrente cadastrado.</div>;
  }

  return (
    <div className="space-y-3">
      {series.map((s) => (
        <Card key={s.id} className="bg-white border-blue-200">
          <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-blue-900">{s.cliente_nome || "Cliente"}</span>
                <Badge className={s.status === "ativo" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}>
                  {s.status}
                </Badge>
              </div>
              <div className="text-xs text-slate-600">
                {s.tipo_servico || "Serviço"} · vencimento dia {s.dia_vencimento} ·{" "}
                R$ {Number(s.valor_mensalidade).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ·{" "}
                {s.num_mensalidades} mensalidades
              </div>
            </div>

            <div className="flex items-center gap-2">
              {editId === s.id ? (
                <>
                  <Input
                    type="number" min={1} max={31}
                    value={novoDia ?? ""}
                    onChange={(e) => setNovoDia(e.target.value === "" ? undefined : parseInt(e.target.value))}
                    className="w-20"
                    placeholder="Dia"
                  />
                  <Button size="sm" disabled={busy} onClick={() => salvarDia(s.id)} className="bg-blue-600 text-white">
                    Salvar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditId(null); setNovoDia(undefined); }}>
                    Cancelar
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    size="sm" variant="outline"
                    className="border-blue-300 text-blue-700"
                    disabled={s.status !== "ativo"}
                    onClick={() => { setEditId(s.id); setNovoDia(s.dia_vencimento); }}
                  >
                    Editar dia
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="border-red-300 text-red-700"
                    disabled={s.status !== "ativo" || busy}
                    onClick={() => cancelar(s.id)}
                  >
                    Cancelar série
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 3: Checkpoint**

---

## Task 8: Integrar na página de Serviços (`Eventos.tsx`)

**Files:**
- Modify: `src/pages/Eventos.tsx`

- [ ] **Step 1: Importar os componentes novos**

No bloco de imports do topo de `src/pages/Eventos.tsx`, adicione:

```tsx
import { ServicoRecorrenteForm } from "@/components/ServicoRecorrenteForm";
import { ServicosRecorrentesList } from "@/components/ServicosRecorrentesList";
```

- [ ] **Step 2: Adicionar estado do modo de cadastro**

Logo após a linha `const [showForm, setShowForm] = useState(...)` (perto da linha 131), adicione:

```tsx
const [modoCadastro, setModoCadastro] = useState<"avulso" | "recorrente">("avulso");
const [recorrentesRefresh, setRecorrentesRefresh] = useState(0);
```

- [ ] **Step 3: Inserir o toggle e o form recorrente dentro do bloco `{showForm && (...)}`**

Localize o início do bloco do formulário (em torno da linha 716: `{showForm && (`). Logo após a abertura `<div ref={showFormRef}>`, insira o seletor de modo e, quando `recorrente`, renderize o componente novo (e oculte o form avulso). Estrutura resultante:

```tsx
{showForm && (
  <div ref={showFormRef}>
    {/* Seletor de modo (só ao criar, não na edição) */}
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
        {/* ...todo o conteúdo do formulário avulso que já existe permanece aqui... */}
      </Card>
    )}
  </div>
)}
```

> Importante: o `<Card>` do formulário avulso **já existente** (do `<CardHeader>` ao `</Card>`) deve passar a ficar dentro do ramo `else` (`: (...)`). Não duplique o conteúdo — apenas envolva o Card atual com a condição ternária.

- [ ] **Step 4: Adicionar uma seção "Serviços recorrentes" na listagem**

Dentro do bloco `{!showForm && !pagamentoModal && (...)}` (a área da lista, em torno da linha 1088), logo antes da `<div className="space-y-4">` da lista de serviços, insira:

```tsx
<div className="mb-8">
  <h2 className="text-lg font-bold text-slate-800 mb-3">Serviços recorrentes</h2>
  <ServicosRecorrentesList refreshKey={recorrentesRefresh} />
</div>
```

- [ ] **Step 5: Verificar type-check**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Verificação manual no navegador**

Run: `npm run dev` e faça login.
1. Em Serviços → "Agendar Serviço" → alterne para **Recorrente**.
2. Preencha cliente, piscina, dias (ex.: Seg+Qui), turno, horário, início, duração (ex.: 4 semanas), dia de vencimento (ex.: 10), mês de início da cobrança, nº mensalidades (ex.: 3), valor. Confira a **Prévia**.
3. Clique em **Criar serviço recorrente**. Confirme o toast com a contagem.
4. Vá ao **Calendário**: os atendimentos das datas Seg/Qui devem aparecer.
5. Volte a Serviços: a série aparece em "Serviços recorrentes". Clique **Editar dia**, troque para 15, salve → confira o toast de cobranças ajustadas.
6. No Supabase (Table Editor), confira `cobrancas` da série: vencimentos futuros movidos para dia 15; passados/pagos intactos.
7. Clique **Cancelar série** → status vira `cancelado`; atendimentos/cobranças futuros removidos.

- [ ] **Step 7: Checkpoint final**

Confirme que o fluxo avulso antigo continua funcionando (criar um serviço avulso normalmente).

---

## Self-Review (preenchido)

**Cobertura da spec:**
- Dias da semana (multi) → Task 6 (toggles) + Task 3 (`gerarOcorrencias`).
- Turno + horário → Task 6 (campos) + Task 2 (tipo) + Task 1 (colunas).
- Vigência X semanas/meses → Task 3 (`calcularDataFim`) + Task 6.
- Alimentar calendário automaticamente → Task 4 (gera linhas `servicos`) + calendário existente (sem mudança).
- Dia fixo de vencimento obrigatório → Task 6 (validação) + Task 1 (NOT NULL).
- Gerar cobrança mensal enquanto ativo → Task 4 (geração antecipada) + Task 5 (cancelamento limpa futuro).
- Editar dia reflete em cobranças futuras → Task 5 (`updateDiaVencimentoRecorrente`) + Task 7 (UI).

**Placeholders:** nenhum — todos os passos de código têm código completo. O único "..." é a instrução explícita de **reusar** o Card avulso já existente (Task 8 Step 3), não um trecho a inventar.

**Consistência de tipos:** `CreateRecorrentePayload` (Task 4) bate com os campos enviados pelo form (Task 6). `ServicoRecorrente` (Task 2) é usado em `getServicosRecorrentes` (Task 5) e na lista (Task 7). Funções `toISODate`/`aplicarDiaFixo`/`gerarVencimentos` definidas na Task 3 e importadas nas Tasks 4–6 com os mesmos nomes.
