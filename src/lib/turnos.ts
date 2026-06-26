export type Turno = "manha" | "tarde" | "noite";

export const TURNO_HORARIOS: Record<Turno, string> = {
  manha: "08:00",
  tarde: "14:00",
  noite: "18:00",
};

export const TURNO_LABELS: Record<Turno, string> = {
  manha: "Manhã",
  tarde: "Tarde",
  noite: "Noite",
};

export const TURNO_OPTIONS = [
  { value: "manha", label: "Manhã", horario: TURNO_HORARIOS.manha },
  { value: "tarde", label: "Tarde", horario: TURNO_HORARIOS.tarde },
  { value: "noite", label: "Noite", horario: TURNO_HORARIOS.noite },
] as const;

export function normalizeHorario(horario?: string | null) {
  return horario?.slice(0, 5) ?? "";
}

export function getTurnoFromHorario(horario?: string | null): Turno | null {
  const normalized = normalizeHorario(horario);
  if (!normalized) return null;

  const [hourText, minuteText = "0"] = normalized.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  if (hour >= 6 && hour < 12) return "manha";
  if (hour >= 12 && hour < 18) return "tarde";
  return "noite";
}

export function getHorarioPadraoFromHorario(horario?: string | null) {
  const turno = getTurnoFromHorario(horario);
  return turno ? TURNO_HORARIOS[turno] : normalizeHorario(horario);
}

export function getTurnoLabelFromHorario(horario?: string | null) {
  const turno = getTurnoFromHorario(horario);
  return turno ? TURNO_LABELS[turno] : normalizeHorario(horario) || "—";
}
