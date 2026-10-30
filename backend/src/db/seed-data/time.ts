import { BUSINESS_UTC_OFFSET_MINUTES } from "../../tickets/sla.js";

export type Ago = { days?: number; hours?: number; minutes?: number };

/** Instante relativo a `now` (o seed fixa `now` uma única vez). */
export function ago({ days = 0, hours = 0, minutes = 0 }: Ago, now: Date): Date {
  return new Date(now.getTime() - ((days * 24 + hours) * 60 + minutes) * 60_000);
}

/** "16/11 às 15:00" no horário de São Paulo, independente do fuso da máquina. */
export function formatLocalDateTime(date: Date): string {
  const local = new Date(date.getTime() + BUSINESS_UTC_OFFSET_MINUTES * 60_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(local.getUTCDate())}/${pad(local.getUTCMonth() + 1)} às ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}
