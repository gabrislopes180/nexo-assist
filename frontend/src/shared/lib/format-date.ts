// Lista própria: o Intl pt-BR gera "16 de out." e o design system pede "16 out".
const MONTHS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

const twoDigits = (value: number) => String(value).padStart(2, "0");

export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return `${twoDigits(date.getDate())} ${MONTHS[date.getMonth()]}`;
}

export function formatShortDateTime(iso: string): string {
  const date = new Date(iso);
  const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
  return `${formatShortDate(iso)}, ${time}`;
}

export function formatTime(iso: string): string {
  const date = new Date(iso);
  return `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
}

/** Prazo curto: só a hora quando vence hoje ("13:43"), senão "16 out, 14:20". */
export function formatDueTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const isToday = date.toDateString() === now.toDateString();
  const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
  return isToday ? time : formatShortDateTime(iso);
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** 0 hoje, 1 ontem, negativo no futuro. */
function daysAgo(date: Date, now: Date): number {
  return Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
}

/** Hora na lista de conversas: "agora", "10:05", "ontem" ou "16 out". */
export function formatListTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const elapsed = now.getTime() - date.getTime();
  if (elapsed >= 0 && elapsed < 60_000) return "agora";

  const days = daysAgo(date, now);
  if (days <= 0) return formatTime(iso);
  if (days === 1) return "ontem";
  return formatShortDate(iso);
}

/** Pílula de dia no histórico: "Hoje", "Ontem" ou "16 out". */
export function formatDayLabel(iso: string, now: Date): string {
  const days = daysAgo(new Date(iso), now);
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  return formatShortDate(iso);
}
