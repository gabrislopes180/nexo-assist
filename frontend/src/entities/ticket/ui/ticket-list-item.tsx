import { ChevronRight } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { statusDotClass } from "@/shared/ui/status-badge";
import { ticketListMeta } from "../lib/console-ticket-fields";
import { CONSOLE_STATUS_TONES } from "../lib/ticket-labels";
import type { ConsoleTicket } from "../model/console-ticket";
import { TicketDueNoteText } from "./ticket-due-note";

interface TicketListItemProps {
  ticket: ConsoleTicket;
  now: Date;
  onOpen: () => void;
}

export function TicketListItem({ ticket, now, onOpen }: TicketListItemProps) {
  return (
    <li className="border-b border-rule last:border-transparent">
      <button
        type="button"
        data-ticket-code={ticket.code}
        onClick={onOpen}
        className="-mx-2 flex w-[calc(100%+1rem)] cursor-pointer items-center gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-desk focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta"
      >
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
            <TicketDueNoteText ticket={ticket} now={now} />
          </span>
        </span>
        <ChevronRight
          aria-hidden="true"
          size={16}
          className="shrink-0 text-ink-3"
        />
      </button>
    </li>
  );
}
