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
