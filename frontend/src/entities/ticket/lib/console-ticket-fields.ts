import { formatShortDate } from "@/shared/lib/format-date";
import type { ConsoleTicket } from "../model/console-ticket";
import { CATEGORY_LABELS, PRIORITY_LABELS } from "./ticket-labels";

export function currentTicketMeta(ticket: ConsoleTicket): string {
  return `${CATEGORY_LABELS[ticket.category]} · prioridade ${PRIORITY_LABELS[ticket.priority].toLowerCase()}`;
}

export function ticketListMeta(ticket: ConsoleTicket): string {
  if (ticket.status === "RESOLVED" && ticket.resolvedAt) {
    return `${ticket.code} · Resolvido em ${formatShortDate(ticket.resolvedAt)}`;
  }
  return `${ticket.code} · ${ticket.statusLabel}`;
}

const isOpen = (ticket: ConsoleTicket) => ticket.status !== "RESOLVED";
const time = (iso: string | null) => (iso ? Date.parse(iso) : 0);

/** Abertos primeiro, mais novos antes; depois os resolvidos, pelo fim mais recente. */
export function sortOtherTickets(tickets: ConsoleTicket[]): ConsoleTicket[] {
  const open = tickets
    .filter(isOpen)
    .sort((a, b) => time(b.createdAt) - time(a.createdAt));
  const resolved = tickets
    .filter((ticket) => !isOpen(ticket))
    .sort((a, b) => time(b.resolvedAt) - time(a.resolvedAt));
  return [...open, ...resolved];
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

export function ticketCountsLabel(all: ConsoleTicket[]): string {
  const open = all.filter(isOpen).length;
  const closed = all.length - open;
  const parts = [
    open > 0 ? plural(open, "aberto", "abertos") : null,
    closed > 0 ? plural(closed, "encerrado", "encerrados") : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Nenhum chamado";
}
