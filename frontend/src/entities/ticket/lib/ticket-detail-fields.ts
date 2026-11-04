import { formatShortDateTime } from "@/shared/lib/format-date";
import type { ConsoleTicketDetail } from "../model/console-ticket-detail";
import { ticketDueState } from "./console-ticket-sla";
import type { TicketCardField } from "./ticket-card-fields";
import {
  AFFECTED_SCOPE_CONSOLE_LABELS,
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONES,
} from "./ticket-labels";

function dueField(ticket: ConsoleTicketDetail, now: Date): TicketCardField[] {
  const state = ticketDueState(ticket, now);
  switch (state.kind) {
    case "due":
      return [{ label: "Prazo", value: formatShortDateTime(state.dueAt) }];
    case "overdue":
      return [
        {
          label: "Prazo",
          value: formatShortDateTime(state.dueAt),
          tone: "warning",
          note: "· prazo vencido",
        },
      ];
    case "paused":
      return [
        { label: "Prazo", value: "Pausado", note: "· aguardando funcionário" },
      ];
    case "resolved":
      return ticket.resolvedAt
        ? [
            {
              label: "Resolvido em",
              value: formatShortDateTime(ticket.resolvedAt),
            },
          ]
        : [];
    case "none":
      return [];
  }
}

const withNote = (note: string | null | undefined) =>
  note ? { note: `· ${note}` } : {};

/** Grade do detalhe no painel: duas colunas, campos longos na linha inteira. */
export function ticketDetailFields(
  ticket: ConsoleTicketDetail,
  now: Date,
): TicketCardField[] {
  return [
    { label: "Categoria", value: CATEGORY_LABELS[ticket.category] },
    {
      label: "Prioridade",
      value: PRIORITY_LABELS[ticket.priority],
      dot: PRIORITY_TONES[ticket.priority],
    },
    ...dueField(ticket, now),
    { label: "Aberto em", value: formatShortDateTime(ticket.createdAt) },
    {
      label: "Última atualização",
      value: formatShortDateTime(ticket.updatedAt),
    },
    {
      label: "Afetados",
      value: AFFECTED_SCOPE_CONSOLE_LABELS[ticket.affectedScope],
      ...withNote(ticket.affectedDescription),
      wide: true,
    },
    {
      label: "Funcionário",
      value: ticket.owner.name,
      ...withNote(ticket.owner.department),
      wide: true,
    },
  ];
}
