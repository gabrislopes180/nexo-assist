import { ArrowRightLeft, ChevronRight, Headset } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { statusDotClass, statusTextClass } from "@/shared/ui/status-badge";
import { currentTicketMeta } from "../lib/console-ticket-fields";
import { CONSOLE_STATUS_TONES } from "../lib/ticket-labels";
import type { ConsoleTicket } from "../model/console-ticket";
import { TicketDueNoteText } from "./ticket-due-note";

interface CurrentTicketProps {
  ticket: ConsoleTicket;
  event: {
    icon: "transfer" | "headset";
    text: string;
    time: string | null;
  } | null;
  now: Date;
  /** O card inteiro vira botão e abre o detalhe. */
  onOpen?: () => void;
}

// Só spans dentro do card: ele pode ser um <button>, que aceita só conteúdo de frase.
// Sem aria-label: o conteúdo nomeia o botão, e assim prazo e evento também são lidos.
export function CurrentTicket({
  ticket,
  event,
  now,
  onOpen,
}: CurrentTicketProps) {
  const tone = CONSOLE_STATUS_TONES[ticket.status];
  const EventIcon = event?.icon === "headset" ? Headset : ArrowRightLeft;

  const content = (
    <>
      <span className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2">
          <span className="flex-1 text-caption font-medium text-ink-3">
            {ticket.code}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 text-caption-strong",
              statusTextClass(tone),
            )}
          >
            <span
              aria-hidden="true"
              className={cn("size-1.75 rounded-pill", statusDotClass(tone))}
            />
            {ticket.statusLabel}
          </span>
          {onOpen ? (
            <ChevronRight
              aria-hidden="true"
              size={16}
              className="-mr-1 shrink-0 text-ink-3"
            />
          ) : null}
        </span>
        <span className="text-heading wrap-anywhere text-ink">
          {ticket.title}
        </span>
        <span className="text-small leading-normal text-ink-3">
          {currentTicketMeta(ticket)}
          <TicketDueNoteText ticket={ticket} now={now} />
        </span>
      </span>
      {event ? (
        <span className="flex items-center gap-2 border-t border-rule pt-3 text-ink-3">
          <EventIcon aria-hidden="true" size={15} className="shrink-0" />
          <span className="flex-1 text-small leading-normal text-ink-2">
            {event.text}
          </span>
          {event.time ? (
            <span className="text-caption text-ink-3">{event.time}</span>
          ) : null}
        </span>
      ) : null}
    </>
  );

  const cardClass = "flex flex-col gap-3.5 rounded-lg bg-desk p-4 text-left";

  if (!onOpen) return <div className={cardClass}>{content}</div>;

  return (
    <button
      type="button"
      data-ticket-code={ticket.code}
      onClick={onOpen}
      className={cn(
        cardClass,
        "w-full cursor-pointer border border-transparent transition-colors hover:border-line-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta",
      )}
    >
      {content}
    </button>
  );
}
