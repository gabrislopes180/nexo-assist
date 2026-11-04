import { cn } from "@/shared/lib/utils";
import { ticketDueNote } from "../lib/console-ticket-sla";
import type { ConsoleTicket } from "../model/console-ticket";

interface TicketDueNoteTextProps {
  ticket: ConsoleTicket;
  now: Date;
}

/** Continua a linha de meta: " · resposta até 13:43", " · prazo vencido". */
export function TicketDueNoteText({ ticket, now }: TicketDueNoteTextProps) {
  const note = ticketDueNote(ticket, now);
  if (!note) return null;
  return (
    <>
      {" · "}
      <span className={cn(note.tone === "warning" && "text-warning-text")}>
        {note.text}
      </span>
    </>
  );
}
