export { formatLocalDateTime } from "../../tickets/sla.js";

export type Ago = { days?: number; hours?: number; minutes?: number };

/** Instante relativo a `now` (o seed fixa `now` uma única vez). */
export function ago({ days = 0, hours = 0, minutes = 0 }: Ago, now: Date): Date {
  return new Date(now.getTime() - ((days * 24 + hours) * 60 + minutes) * 60_000);
}
