import { formatDueTime } from "@/shared/lib/format-date";
import type { ConsoleTicket } from "../model/console-ticket";

type DueFields = Pick<ConsoleTicket, "status" | "dueAt" | "overdue">;

export type TicketDueState =
  | { kind: "due"; dueAt: string }
  | { kind: "overdue"; dueAt: string }
  | { kind: "paused" }
  | { kind: "resolved" }
  | { kind: "none" };

/** Vencido pelo backend ou porque o prazo passou desde a última leitura. */
export function ticketDueState(ticket: DueFields, now: Date): TicketDueState {
  if (ticket.status === "RESOLVED") return { kind: "resolved" };
  if (ticket.status === "WAITING_EMPLOYEE") return { kind: "paused" };
  if (!ticket.dueAt) return { kind: "none" };
  const overdue = ticket.overdue || Date.parse(ticket.dueAt) < now.getTime();
  return { kind: overdue ? "overdue" : "due", dueAt: ticket.dueAt };
}

export interface TicketDueNote {
  text: string;
  tone: "warning" | null;
}

/** Nota curta de prazo para a lista: "resposta até 13:43", "prazo vencido". */
export function ticketDueNote(
  ticket: DueFields,
  now: Date,
): TicketDueNote | null {
  const state = ticketDueState(ticket, now);
  switch (state.kind) {
    case "due":
      return {
        text: `resposta até ${formatDueTime(state.dueAt, now)}`,
        tone: null,
      };
    case "overdue":
      return { text: "prazo vencido", tone: "warning" };
    case "paused":
      return { text: "prazo pausado", tone: null };
    default:
      return null;
  }
}
