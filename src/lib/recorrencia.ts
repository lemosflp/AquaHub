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
