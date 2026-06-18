# US1 — Cadastro de Serviço Recorrente com Configuração de Mensalidade

**Data:** 2026-06-17
**Status:** Aprovado (design) — pronto para planejamento de implementação

## Objetivo

Permitir que o operador cadastre um **serviço recorrente** definindo dias da semana,
turno, horário, período de vigência e a configuração de mensalidade (dia fixo de
vencimento, mês inicial, número de mensalidades e valor). Ao salvar, o sistema:

1. Gera automaticamente os **atendimentos** no calendário (uma linha por ocorrência).
2. Provisiona antecipadamente as **cobranças mensais** da série.

A série pode ser **editada** (alterar o dia de vencimento reflete nas cobranças futuras)
e **cancelada** (remove atendimentos e cobranças futuras, preservando o histórico).

## Decisões de design (resumo)

| Tema | Decisão |
|---|---|
| Geração das cobranças | **Antecipada**: todas criadas no momento do cadastro |
| Ocorrências no calendário | **Uma linha em `servicos` por atendimento** (eager) |
| Turno | Categoria obrigatória (`manha`/`tarde`/`noite`) |
| Horário | **Obrigatório, informado pelo operador** (um horário para a série; sem horário padrão de turno) |
| Nº de mensalidades | Campo próprio, informado pelo operador |
| Dia de vencimento | **Informado pelo operador; governa TODAS as cobranças** (inclusive a 1ª) |
| Início da cobrança | Operador escolhe o **mês inicial**; 1ª mensalidade vence no dia fixo desse mês |
| Dia inexistente no mês | Ajuste para o **último dia do mês** (ex.: dia 31 em fevereiro) |
| Edição do dia de vencimento | Recalcula **cobranças futuras** (`data_vencimento ≥ hoje` e `pendente`); passadas/pagas intactas |
| Cancelamento | Status `cancelado` + remove atendimentos futuros e cobranças futuras pendentes |
| Agrupamento | Tabela-pai `servicos_recorrentes` + coluna `recorrencia_id` nas filhas |
| Formulário | Componente dedicado `ServicoRecorrenteForm` (toggle Avulso × Recorrente) |
| Testes automatizados | **Fora de escopo** (verificação manual) |

## Arquitetura

```
Página Serviços (Eventos.tsx)
   └─ toggle "Avulso × Recorrente"
        └─ ServicoRecorrenteForm (componente novo, isolado)
              │ usa
              ▼
        services/supabaseApi.ts        lib/recorrencia.ts (funções puras de data)
        - createServicoRecorrente()  ◀─ calcularDataFim / gerarOcorrencias / gerarVencimentos
        - getServicosRecorrentes()
        - getServicoRecorrente(id)
        - updateDiaVencimentoRecorrente(id, novoDia)
        - cancelarServicoRecorrente(id)
              │
              ▼
        Supabase: servicos_recorrentes + servicos + cobrancas
```

O calendário ([Calendario.tsx](../../../src/pages/Calendario.tsx)) **não muda**: já consome
`getServicosApi()`, que lê as linhas de `servicos`. Como cada atendimento recorrente é uma
linha real de `servicos`, ele aparece no calendário automaticamente.

## Modelo de dados

### Nova tabela `servicos_recorrentes`

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | RLS (`= auth.uid()`) |
| `client_id` | uuid NOT NULL | cliente |
| `piscina_id` | uuid NOT NULL | piscina |
| `tipo_servico` | text | ex.: "Limpeza" |
| `dias_semana` | smallint[] NOT NULL | dias selecionados (0=Dom … 6=Sáb) |
| `turno` | text NOT NULL | `manha` / `tarde` / `noite` |
| `horario` | time NOT NULL | horário do atendimento (informado pelo operador) |
| `data_inicio` | date NOT NULL | início da vigência |
| `vigencia_qtd` | int NOT NULL | o "X" |
| `vigencia_unidade` | text NOT NULL | `semanas` / `meses` |
| `data_fim` | date NOT NULL | fim da vigência (calculado e gravado) |
| `dia_vencimento` | smallint NOT NULL | dia fixo (1–31) |
| `cobranca_inicio` | date NOT NULL | mês da 1ª mensalidade (só ano/mês são significativos) |
| `num_mensalidades` | int NOT NULL | quantas cobranças gerar |
| `valor_mensalidade` | numeric NOT NULL | valor de cada cobrança |
| `status` | text NOT NULL | default `ativo` (`ativo`/`cancelado`/`concluido`) |
| `observacoes` | text NULL | |
| `created_at` | timestamptz | `now()` |

### Colunas adicionadas nas tabelas existentes

- `servicos.recorrencia_id uuid NULL` → FK `servicos_recorrentes(id)`
- `cobrancas.recorrencia_id uuid NULL` → FK `servicos_recorrentes(id)`

Serviços/cobranças **avulsos** mantêm `recorrencia_id = NULL` — fluxo atual inalterado.
As **mensalidades** geradas têm `recorrencia_id` preenchido e `servico_id = NULL`
(a mensalidade pertence à série, não a um atendimento específico).

### RLS e índices

- RLS habilitado em `servicos_recorrentes` com políticas `user_id = auth.uid()` para
  `select`/`insert`/`update`/`delete` (mesmo padrão das demais tabelas).
- Índices: `servicos(recorrencia_id)` e `cobrancas(recorrencia_id)`.

> **Atenção:** o repositório não tem migrations. O DDL (apêndice) deve ser aplicado
> manualmente no painel do Supabase antes de usar a feature.

## Formulário (UI)

Componente dedicado `ServicoRecorrenteForm`, acionado por um toggle **Avulso × Recorrente**
no topo do formulário da página de Serviços.

**Dados do atendimento**
- Cliente (select) → carrega Piscina (mesmo fluxo atual)
- Tipo de serviço (texto)
- Dias da semana — toggles Seg…Dom (multi-seleção, ≥1 obrigatório)
- Turno — Manhã / Tarde / Noite (obrigatório)
- Horário — `time` (obrigatório)

**Vigência (alimenta o calendário)**
- Data de início (`date`)
- Duração — número `X` + unidade (`semanas` / `meses`)

**Financeiro (mensalidade)**
- Dia fixo de vencimento — número 1–31 (obrigatório)
- Início da cobrança — `date`, usado apenas como mês inicial (obrigatório)
- Nº de mensalidades — número (obrigatório)
- Valor da mensalidade (R$) — (obrigatório)

**Observações** (texto)

**Prévia antes de salvar:** "Serão gerados **N atendimentos** entre dd/mm e dd/mm e
**M cobranças** de R$ X (vencimentos: dd/mm, dd/mm, …)". Permite conferir antes de criar
muitas linhas.

## Lógica de geração

Ao salvar (em sequência, com rollback manual por `recorrencia_id` se algum passo falhar):

### 1. Cria a série (`servicos_recorrentes`)
Calcula `data_fim`:
- `semanas` → `data_inicio + (X × 7) dias`
- `meses` → `data_inicio + X meses`

### 2. Gera os atendimentos (`servicos`)
- Varre de `data_inicio` a `data_fim`.
- Para cada dia cujo dia-da-semana ∈ `dias_semana`, cria `servicos` com:
  `data_agendamento` = a data, `horario` = horário informado, `status = 'agendado'`,
  `recorrencia_id` = série, `client_id`/`piscina_id`/`user_id`/`tipo_servico` da série.

### 3. Gera as mensalidades (`cobrancas`)
- 1ª cobrança: dia fixo (`dia_vencimento`) do mês de `cobranca_inicio`.
- Demais: dia fixo dos meses subsequentes, até completar `num_mensalidades`.
- Cada cobrança: `valor = valor_mensalidade`, `status = 'pendente'`,
  `recorrencia_id` = série, `client_id` preenchido, `servico_id = NULL`.
- **Ajuste de fim de mês:** se o mês não tem o dia (ex.: 31 em fevereiro), usa o último
  dia do mês.

### Funções puras (`src/lib/recorrencia.ts`)
Sem dependência de banco, para manter a lógica isolada e legível:
- `calcularDataFim(dataInicio, qtd, unidade): Date`
- `gerarOcorrencias(dataInicio, dataFim, diasSemana): Date[]`
- `gerarVencimentos(mesInicial, diaFixo, numMensalidades): Date[]`

## Edição da série

Alterar o **dia de vencimento** após a criação:
- Grava o novo `dia_vencimento` na série.
- Recalcula `data_vencimento` de todas as cobranças **futuras** —
  definidas como `data_vencimento ≥ hoje` **e** `status = 'pendente'`.
- Cada cobrança futura vai para o novo dia fixo **dentro do seu próprio mês**
  (com ajuste de fim de mês).
- Cobranças **passadas ou pagas** ficam intactas (preserva histórico).

Exemplo: cobranças 10/07 (paga), 10/08, 10/09 (pendentes); hoje = 20/07; novo dia = 15
→ 10/07 mantém, 10/08 → 15/08, 10/09 → 15/09.

## Cancelamento da série

Botão **Cancelar série**:
- `status` → `cancelado`.
- Remove **atendimentos futuros** (`data_agendamento ≥ hoje`, não `concluido`).
- Remove **cobranças futuras pendentes** (`data_vencimento ≥ hoje`, `status = 'pendente'`).
- Passado e pagamentos preservados.

## Casos de borda

- Nenhum dia da semana selecionado, ou vigência que não gera atendimento → validação
  bloqueia o submit.
- Dia fixo inexistente no mês → último dia do mês.
- Geração grande (muitas linhas) → a prévia informa a quantidade antes de confirmar.

## Fora de escopo (futuras stories)

- Tela de gestão/pagamentos das mensalidades recorrentes (o modal atual de pagamentos
  busca cobrança por `servico_id`; mensalidades recorrentes usam `recorrencia_id`).
- Remarcar/concluir/cancelar um atendimento isolado da série pela própria série.
- Selo visual "recorrente" no card do calendário.
- Geração server-side (Supabase pg_cron / Edge Function).
- Testes automatizados.

## Apêndice — DDL (aplicar no painel do Supabase)

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
