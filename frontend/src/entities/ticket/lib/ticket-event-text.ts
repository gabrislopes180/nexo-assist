import { formatDueTime } from "@/shared/lib/format-date";
import type {
  ConsoleTicketEvent,
  TicketEventType,
} from "../model/console-ticket-detail";
import { CONSOLE_STATUS_LABELS, PRIORITY_LABELS } from "./ticket-labels";

export type TicketEventIcon =
  "created" | "status" | "priority" | "comment" | "transfer" | "reopen";

export interface TicketEventText {
  icon: TicketEventIcon;
  text: string;
  /** Rótulo do bloco com `content`; null quando não há conteúdo. */
  contentLabel: string | null;
  dueNote: string | null;
}

const ICONS: Record<TicketEventType, TicketEventIcon> = {
  CREATED: "created",
  STATUS_CHANGED: "status",
  PRIORITY_CHANGED: "priority",
  COMMENT: "comment",
  TRANSFERRED: "transfer",
  REOPENED: "reopen",
};

const CONTENT_LABELS: Record<TicketEventType, string> = {
  CREATED: "Nota",
  STATUS_CHANGED: "Nota interna",
  PRIORITY_CHANGED: "Nota",
  COMMENT: "Complemento",
  TRANSFERRED: "Nota",
  REOPENED: "Motivo",
};

const FALLBACK_ACTOR: Record<ConsoleTicketEvent["actorType"], string> = {
  EMPLOYEE: "Funcionário",
  AGENT: "Nexo Assist",
  ANALYST: "Analista",
  SYSTEM: "Sistema",
};

function actorName(event: ConsoleTicketEvent): string {
  return event.actor?.name ?? FALLBACK_ACTOR[event.actorType];
}

function mainText(event: ConsoleTicketEvent): string {
  const actor = actorName(event);
  switch (event.type) {
    case "CREATED":
      return `Chamado aberto por ${actor}`;
    case "STATUS_CHANGED":
      return event.toStatus
        ? `${actor} mudou para ${CONSOLE_STATUS_LABELS[event.toStatus]}`
        : `${actor} mudou o status`;
    case "PRIORITY_CHANGED": {
      if (!event.toPriority) return "Prioridade alterada";
      const to = PRIORITY_LABELS[event.toPriority];
      return event.fromPriority
        ? `Prioridade: ${PRIORITY_LABELS[event.fromPriority]} → ${to}`
        : `Prioridade: ${to}`;
    }
    case "COMMENT":
      return `Complemento de ${actor}`;
    case "TRANSFERRED":
      return "Transferido para um analista";
    case "REOPENED":
      return `Reaberto por ${actor}`;
  }
}

export function ticketEventText(
  event: ConsoleTicketEvent,
  now: Date,
): TicketEventText {
  return {
    icon: ICONS[event.type],
    text: mainText(event),
    contentLabel: event.content ? CONTENT_LABELS[event.type] : null,
    dueNote: event.dueAt
      ? `novo prazo ${formatDueTime(event.dueAt, now)}`
      : null,
  };
}
