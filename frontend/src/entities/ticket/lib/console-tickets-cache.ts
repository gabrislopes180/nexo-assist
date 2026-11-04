import type { QueryClient } from "@tanstack/react-query";
import { consoleTicketKeys } from "../api/console-ticket-keys";
import type {
  ConsoleTicket,
  ConversationTickets,
} from "../model/console-ticket";
import type { ConsoleTicketDetail } from "../model/console-ticket-detail";

/** O item da lista a partir do detalhe: só os campos de `ConsoleTicket`. */
export function toConsoleTicket(detail: ConsoleTicketDetail): ConsoleTicket {
  return {
    code: detail.code,
    type: detail.type,
    category: detail.category,
    priority: detail.priority,
    status: detail.status,
    statusLabel: detail.statusLabel,
    title: detail.title,
    createdAt: detail.createdAt,
    resolvedAt: detail.resolvedAt,
    dueAt: detail.dueAt,
    overdue: detail.overdue,
  };
}

const sameCode = (a: string, b: string) => a.toUpperCase() === b.toUpperCase();

function replaceIn(
  data: ConversationTickets,
  ticket: ConsoleTicket,
): ConversationTickets {
  const current = data.conversationTicket;
  const hitsCurrent = current !== null && sameCode(current.code, ticket.code);
  const hitsOthers = data.otherTickets.some((item) =>
    sameCode(item.code, ticket.code),
  );
  // Sem o chamado, a referência fica: quem lê esta conversa não renderiza de novo.
  if (!hitsCurrent && !hitsOthers) return data;
  return {
    conversationTicket: hitsCurrent ? ticket : current,
    otherTickets: hitsOthers
      ? data.otherTickets.map((item) =>
          sameCode(item.code, ticket.code) ? ticket : item,
        )
      : data.otherTickets,
  };
}

/** Grava o detalhe vindo do POST e reflete status e prazo nas listas abertas. */
export function applyTicketDetail(
  qc: QueryClient,
  detail: ConsoleTicketDetail,
): void {
  qc.setQueryData(consoleTicketKeys.detail(detail.code), detail);
  const item = toConsoleTicket(detail);
  qc.setQueriesData<ConversationTickets>(
    { queryKey: consoleTicketKeys.conversations() },
    (data) => (data ? replaceIn(data, item) : data),
  );
}
