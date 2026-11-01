import { formatShortDateTime } from "@/shared/lib/format-date";
import type { StatusTone } from "@/shared/ui/status-badge";
import type { TicketSummary } from "../model/ticket";
import {
  CATEGORY_LABELS,
  PRIORITY_LABELS,
  PRIORITY_TONES,
} from "./ticket-labels";

export interface TicketCardField {
  label: string;
  value: string;
  dot?: StatusTone;
  tone?: "warning";
  note?: string;
}

function dueField(ticket: TicketSummary): TicketCardField[] {
  if (!ticket.dueAt) return [];

  const value = formatShortDateTime(ticket.dueAt);
  return ticket.overdue
    ? [{ label: "Prazo", value, tone: "warning", note: "· prazo vencido" }]
    : [{ label: "Prazo", value }];
}

export function ticketCardFields(ticket: TicketSummary): TicketCardField[] {
  return [
    { label: "Categoria", value: CATEGORY_LABELS[ticket.category] },
    {
      label: "Prioridade",
      value: PRIORITY_LABELS[ticket.priority],
      dot: PRIORITY_TONES[ticket.priority],
    },
    { label: "Aberto em", value: formatShortDateTime(ticket.createdAt) },
    ...dueField(ticket),
  ];
}
