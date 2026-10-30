import type { TicketPriority } from "../generated/prisma/enums.js";

/**
 * Regras de prazo (SLA). Módulo puro: sem Prisma e sem relógio implícito.
 * Horário de negócio: America/Sao_Paulo com offset fixo (sem horário de verão).
 * Feriados são ignorados.
 */
export const BUSINESS_UTC_OFFSET_MINUTES = -180;
export const BUSINESS_DAY_START_HOUR = 8;
export const BUSINESS_DAY_END_HOUR = 18;

export type SlaClock = "CALENDAR" | "BUSINESS";
export type SlaRule = { clock: SlaClock; minutes: number };

/** Minutos de prazo por prioridade (dia útil = 10h). */
export const SLA_BY_PRIORITY = {
  CRITICAL: { clock: "CALENDAR", minutes: 60 },
  HIGH: { clock: "BUSINESS", minutes: 240 },
  MEDIUM: { clock: "BUSINESS", minutes: 1800 },
  LOW: { clock: "BUSINESS", minutes: 3000 },
} as const satisfies Record<TicketPriority, SlaRule>;

/**
 * Duração corrida (em horas) entre o início da janela e o prazo, nos piores e
 * melhores casos. Útil para montar dados relativos a "agora" (seed) que precisam
 * estar garantidamente vencidos ou no prazo, independentemente do dia da semana.
 */
export const SLA_ELAPSED_BOUNDS_HOURS = {
  CRITICAL: { min: 1, max: 1 },
  HIGH: { min: 4, max: 4 + 14 + 48 }, // sex 18:00 -> seg 12:00
  MEDIUM: { min: 58, max: 120 },
  LOW: { min: 106, max: 168 },
} as const satisfies Record<TicketPriority, { min: number; max: number }>;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const OFFSET_MS = BUSINESS_UTC_OFFSET_MINUTES * MINUTE_MS;

/**
 * "Relógio local": um instante deslocado pelo offset, lido com getUTC*.
 * Assim os cálculos não dependem do fuso da máquina.
 */
const toLocal = (d: Date): number => d.getTime() + OFFSET_MS;
const fromLocal = (localMs: number): Date => new Date(localMs - OFFSET_MS);

const startOfLocalDay = (localMs: number): number => Math.floor(localMs / DAY_MS) * DAY_MS;
const isWeekend = (localMs: number): boolean => {
  const dow = new Date(localMs).getUTCDay();
  return dow === 0 || dow === 6;
};

/** Se o instante local está fora do expediente, avança para 08:00 do próximo dia útil. */
function moveIntoBusinessHours(localMs: number): number {
  let day = startOfLocalDay(localMs);
  let t = localMs;
  for (;;) {
    const open = day + BUSINESS_DAY_START_HOUR * 60 * MINUTE_MS;
    const close = day + BUSINESS_DAY_END_HOUR * 60 * MINUTE_MS;
    if (!isWeekend(day) && t < close) return Math.max(t, open);
    day += DAY_MS;
    t = day;
  }
}

/**
 * Soma minutos úteis (seg-sex, 08:00-18:00 local).
 * Começar exatamente às 18:00 é fora do expediente; terminar exatamente às 18:00 é válido.
 */
export function addBusinessMinutes(from: Date, minutes: number): Date {
  let remaining = minutes * MINUTE_MS;
  let t = toLocal(from);
  while (remaining > 0) {
    t = moveIntoBusinessHours(t);
    const close = startOfLocalDay(t) + BUSINESS_DAY_END_HOUR * 60 * MINUTE_MS;
    const step = Math.min(remaining, close - t);
    t += step;
    remaining -= step;
  }
  return fromLocal(t);
}

export function computeDueAt(priority: TicketPriority, from: Date): Date {
  const rule: SlaRule = SLA_BY_PRIORITY[priority];
  return rule.clock === "CALENDAR"
    ? new Date(from.getTime() + rule.minutes * MINUTE_MS)
    : addBusinessMinutes(from, rule.minutes);
}

export function isOverdue(ticket: { dueAt: Date | null }, now: Date): boolean {
  return ticket.dueAt !== null && ticket.dueAt < now;
}
