import {
  ArrowRightLeft,
  CircleDot,
  FilePlus2,
  Flag,
  MessageSquareText,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { formatShortDateTime } from "@/shared/lib/format-date";
import {
  ticketEventText,
  type TicketEventIcon,
} from "../lib/ticket-event-text";
import {
  TICKET_EVENTS_LIMIT,
  type ConsoleTicketEvent,
} from "../model/console-ticket-detail";

const ICONS: Record<TicketEventIcon, LucideIcon> = {
  created: FilePlus2,
  status: CircleDot,
  priority: Flag,
  comment: MessageSquareText,
  transfer: ArrowRightLeft,
  reopen: RotateCcw,
};

interface TicketHistoryProps {
  events: ConsoleTicketEvent[];
  now: Date;
}

/** Mais recente primeiro: o que acabou de acontecer fica no topo. */
export function TicketHistory({ events, now }: TicketHistoryProps) {
  const ordered = [...events].reverse();

  return (
    <section
      aria-labelledby="ticket-history-title"
      className="flex flex-col gap-3"
    >
      <h3
        id="ticket-history-title"
        className="text-caption font-medium text-ink-3"
      >
        Histórico
      </h3>
      {ordered.length === 0 ? (
        <p className="text-small text-ink-3">Sem eventos registrados.</p>
      ) : (
        <ol className="flex flex-col">
          {ordered.map((event) => {
            const view = ticketEventText(event, now);
            const Icon = ICONS[view.icon];
            return (
              <li
                key={event.id}
                className="flex gap-2.5 border-b border-rule py-3 first:pt-0 last:border-transparent"
              >
                <Icon
                  aria-hidden="true"
                  size={15}
                  className="mt-0.5 shrink-0 text-ink-3"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-small wrap-anywhere text-ink-2">
                    {view.text}
                  </p>
                  <p className="text-caption text-ink-3">
                    <time dateTime={event.createdAt}>
                      {formatShortDateTime(event.createdAt)}
                    </time>
                    {view.dueNote ? ` · ${view.dueNote}` : null}
                  </p>
                  {event.content && view.contentLabel ? (
                    <div className="mt-1 flex flex-col gap-0.5 rounded-md bg-desk px-3 py-2">
                      <p className="text-caption text-ink-3">
                        {view.contentLabel}
                      </p>
                      <p className="text-small whitespace-pre-line wrap-anywhere text-ink">
                        {event.content}
                      </p>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {events.length >= TICKET_EVENTS_LIMIT ? (
        <p className="text-caption text-ink-3">
          Mostrando os {TICKET_EVENTS_LIMIT} eventos mais recentes.
        </p>
      ) : null}
    </section>
  );
}
