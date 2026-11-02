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

/** Prazo curto: só a hora quando vence hoje ("13:43"), senão "16 out, 14:20". */
export function formatDueTime(iso: string, now: Date): string {
  const date = new Date(iso);
  const isToday = date.toDateString() === now.toDateString();
  const time = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
  return isToday ? time : formatShortDateTime(iso);
}
