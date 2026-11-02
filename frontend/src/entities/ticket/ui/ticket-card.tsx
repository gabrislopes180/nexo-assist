import { StatusBadge } from "@/shared/ui/status-badge";
import { ticketCardFields } from "../lib/ticket-card-fields";
import { STATUS_TONES } from "../lib/ticket-labels";
import type { TicketSummary } from "../model/ticket";
import { TicketCardHeader } from "./ticket-card-header";
import { TicketFields } from "./ticket-fields";

interface TicketCardProps {
  ticket: TicketSummary;
}

export function TicketCard({ ticket }: TicketCardProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-line-card bg-paper shadow-card">
      <TicketCardHeader
        kind="Chamado"
        number={ticket.code}
        status={
          <StatusBadge tone={STATUS_TONES[ticket.status]} strong>
            {ticket.statusLabel}
          </StatusBadge>
        }
        title={ticket.title}
      />
      <TicketFields fields={ticketCardFields(ticket)} />
    </article>
  );
}
