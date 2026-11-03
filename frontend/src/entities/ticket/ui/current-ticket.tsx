import { ArrowRightLeft, Headset } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { statusDotClass, statusTextClass } from "@/shared/ui/status-badge";
import { currentTicketMeta } from "../lib/console-ticket-fields";
import { CONSOLE_STATUS_TONES } from "../lib/ticket-labels";
import type { ConsoleTicket } from "../model/console-ticket";

interface CurrentTicketProps {
  ticket: ConsoleTicket;
  event: {
    icon: "transfer" | "headset";
    text: string;
    time: string | null;
  } | null;
}

export function CurrentTicket({ ticket, event }: CurrentTicketProps) {
  const tone = CONSOLE_STATUS_TONES[ticket.status];
  const EventIcon = event?.icon === "headset" ? Headset : ArrowRightLeft;

  return (
    <div className="flex flex-col gap-3.5 rounded-lg bg-desk p-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
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
        </div>
        <p className="text-heading wrap-anywhere text-ink">{ticket.title}</p>
        <p className="text-small leading-normal text-ink-3">
          {currentTicketMeta(ticket)}
        </p>
      </div>
      {event ? (
        <div className="flex items-center gap-2 border-t border-rule pt-3 text-ink-3">
          <EventIcon aria-hidden="true" size={15} className="shrink-0" />
          <span className="flex-1 text-small leading-normal text-ink-2">
            {event.text}
          </span>
          {event.time ? (
            <span className="text-caption text-ink-3">{event.time}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
