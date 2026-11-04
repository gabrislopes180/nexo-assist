import type { Ref } from "react";
import { StatusBadge } from "@/shared/ui/status-badge";
import { ticketDetailFields } from "../lib/ticket-detail-fields";
import { CONSOLE_STATUS_TONES, TYPE_LABELS } from "../lib/ticket-labels";
import type { ConsoleTicketDetail } from "../model/console-ticket-detail";
import { TicketFields } from "./ticket-fields";

interface TicketDetailProps {
  ticket: ConsoleTicketDetail;
  now: Date;
  titleId: string;
  /** Recebe o foco ao abrir o detalhe. */
  titleRef?: Ref<HTMLHeadingElement>;
}

/** Cabeçalho, descrição e grade do chamado no painel do console. */
export function TicketDetail({
  ticket,
  now,
  titleId,
  titleRef,
}: TicketDetailProps) {
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-x-1.5 text-caption text-ink-3">
          <span>{TYPE_LABELS[ticket.type]}</span>
          <span aria-hidden="true">·</span>
          <span>{ticket.code}</span>
          <span aria-hidden="true">·</span>
          <StatusBadge tone={CONSOLE_STATUS_TONES[ticket.status]} strong>
            {ticket.statusLabel}
          </StatusBadge>
        </p>
        <h2
          id={titleId}
          ref={titleRef}
          tabIndex={-1}
          className="text-card-title wrap-anywhere text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
        >
          {ticket.title}
        </h2>
      </div>
      {ticket.description ? (
        <p className="text-small whitespace-pre-line wrap-anywhere text-ink-2">
          {ticket.description}
        </p>
      ) : null}
      <TicketFields fields={ticketDetailFields(ticket, now)} layout="panel" />
    </section>
  );
}
