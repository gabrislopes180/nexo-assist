import { cn } from "@/shared/lib/utils";
import { statusDotClass } from "@/shared/ui/status-badge";
import { ticketListMeta } from "../lib/console-ticket-fields";
import { CONSOLE_STATUS_TONES } from "../lib/ticket-labels";
import type { ConsoleTicket } from "../model/console-ticket";

/** Linha estática: ainda não há tela de detalhe do chamado. */
export function TicketListItem({ ticket }: { ticket: ConsoleTicket }) {
  return (
    <li className="flex items-center gap-3 border-b border-rule py-3 last:border-transparent">
      <span
        aria-hidden="true"
        className={cn(
          "size-1.75 shrink-0 rounded-pill",
          statusDotClass(CONSOLE_STATUS_TONES[ticket.status]),
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.75">
        <span className="truncate text-body-strong text-ink">
          {ticket.title}
        </span>
        <span className="text-caption text-ink-3">
          {ticketListMeta(ticket)}
        </span>
      </span>
    </li>
  );
}
