// Tipos usados nas telas atuais: Clientes, Piscinas, Serviços, Cobranças, Pagamentos, Calendário

export interface Cliente {
  id: string;               // uuid (clientes.id)
  nome: string;
  sobrenome?: string;
  numero_celular?: string;  // coluna: numero_celular
  numero_telefone?: string;
  email?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  observacoes?: string;
  user_id?: string;         // uuid (clientes.user_id)
  created_at?: string;      // timestamptz

  // Campos derivados usados na UI
  piscinas_count?: number;
}

export interface Piscina {
  id: string;               // uuid (piscinas.id)
  client_id: string;       // pode ser client_id ou client_id no DB; usar client_id no front
  tipo?: string | null;
  tamanho?: string | null;
  endereco?: string | null;
  observacoes?: string | null;
  user_id?: string | null;
  created_at?: string | null;
}

export interface Servico {
  id: string;               // uuid (servicos.id)
  user_id?: string | null;
  client_id: string;
  piscina_id: string;
  tipo_servico?: string | null;
  data_agendamento?: string | null; // yyyy-MM-dd
  horario?: string | null;          // HH:mm
  status?: string | null;           // ex: 'agendado','confirmado','concluido','cancelado'
  observacoes?: string | null;
  created_at?: string | null;

  // Campos auxiliares para UI
  cliente_nome?: string;
  piscina_tamanho?: string;
}

export interface Cobranca {
  id: string;               // uuid (cobrancas.id)
  user_id?: string | null;
  client_id?: string | null;
  servico_id?: string | null;
  valor?: number | null;
  data_vencimento?: string | null; // yyyy-MM-dd
  status?: string | null;          // ex: 'pendente','parcial','paga'
  created_at?: string | null;
}

export interface Pagamento {
  id: string;               // uuid (pagamentos.id)
  user_id?: string | null;
  cobranca_id: string;
  data_pagamento?: string | null; // yyyy-MM-dd
  valor_pago?: number | null;
  forma_pagamento?: string | null;
  observacoes?: string | null;
  created_at?: string | null;
}

// Tipo usado pelo Calendário / listagens simplificadas
export type EventoCalendario = {
  id: string;
  titulo?: string;
  clienteNome?: string;
  clienteId?: string;
  data?: string;        // yyyy-MM-dd
  horaInicio?: string;  // HH:mm
  tipo?: string;
  status?: string;
  observacoes?: string;
  valor?: number;
  userId?: string;
};

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
