import type { Prisma, PrismaClient } from "../generated/prisma/client.js";
import type { TicketStatus } from "../generated/prisma/enums.js";
import type { Person } from "../shared/chat.js";
import type { ConsoleTicketDetail, ConsoleTicketEvent } from "../shared/console-tickets.js";
import { isOverdue } from "./sla.js";
import {
  allowedAnalystStatuses,
  applyTicketEvent,
  canTransition,
  requiresStatusNote,
  STATUS_NOTE_REQUIRED,
  TICKET_STATUS_LABEL,
} from "./ticket-rules.js";

export class TicketNotFoundError extends Error {
  constructor() {
    super("Chamado não encontrado");
    this.name = "TicketNotFoundError";
  }
}

/** O status atual não é o que o analista viu (outro analista ou o sistema mudou antes). */
export class TicketStatusConflictError extends Error {
  constructor() {
    super("Status do chamado mudou");
    this.name = "TicketStatusConflictError";
  }
}

export class TicketTransitionNotAllowedError extends Error {
  constructor() {
    super("Transição de status não permitida");
    this.name = "TicketTransitionNotAllowedError";
  }
}

export class TicketStatusNoteRequiredError extends Error {
  constructor() {
    super("Nota obrigatória para este status");
    this.name = "TicketStatusNoteRequiredError";
  }
}

/** Conversa inexistente ou de outro dono: o evento não pode apontar para ela. */
export class InvalidTicketConversationError extends Error {
  constructor() {
    super("Conversa não pertence ao dono do chamado");
    this.name = "InvalidTicketConversationError";
  }
}

export const MAX_DETAIL_EVENTS = 200;

export type ChangeStatusInput = {
  code: string;
  /** Sempre da sessão. */
  actor: Person;
  toStatus: TicketStatus;
  expectedStatus: TicketStatus;
  note: string | null;
  conversationId: string | null;
  now: Date;
};

export type ChangeStatusResult = { changed: boolean; ownerId: string; ticketCode: string; conversationId: string | null };

export type TicketStatusService = {
  getDetail(code: string, now: Date): Promise<ConsoleTicketDetail>;
  /** Uma transação; repetir com o mesmo `expectedStatus` é seguro (changed: false). */
  changeStatus(input: ChangeStatusInput): Promise<ChangeStatusResult>;
};

const iso = (date: Date | null) => date?.toISOString() ?? null;

const detailSelect = {
  id: true,
  code: true,
  type: true,
  category: true,
  priority: true,
  status: true,
  title: true,
  description: true,
  affectedScope: true,
  affectedDescription: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  slaStartedAt: true,
  dueAt: true,
  owner: { select: { id: true, name: true, department: true } },
} as const;

const eventSelect = {
  id: true,
  type: true,
  actorType: true,
  actor: { select: { id: true, name: true } },
  content: true,
  fromStatus: true,
  toStatus: true,
  fromPriority: true,
  toPriority: true,
  dueAt: true,
  conversationId: true,
  createdAt: true,
} as const;

type EventRow = Prisma.TicketEventGetPayload<{ select: typeof eventSelect }>;

function toEventView(event: EventRow): ConsoleTicketEvent {
  const hasPerson = event.actorType === "EMPLOYEE" || event.actorType === "ANALYST";
  return {
    id: event.id,
    type: event.type,
    actorType: event.actorType,
    actor: hasPerson && event.actor ? { id: event.actor.id, name: event.actor.name } : null,
    content: event.content,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    fromPriority: event.fromPriority,
    toPriority: event.toPriority,
    dueAt: iso(event.dueAt),
    conversationId: event.conversationId,
    createdAt: event.createdAt.toISOString(),
  };
}

const normalizeCode = (code: string) => code.toUpperCase();

/**
 * Escrita de status pelo analista. Mesmo padrão da reabertura: `at = max(now, updatedAt)`,
 * update condicional no status esperado e evento append-only na mesma transação.
 * Não checa papel: quem chama (ConsoleTicketService) garante que o ator é analista.
 */
export function createTicketStatusService(client: PrismaClient): TicketStatusService {
  return {
    async getDetail(code, now) {
      const ticket = await client.ticket.findUnique({ where: { code: normalizeCode(code) }, select: detailSelect });
      if (!ticket) throw new TicketNotFoundError();
      const latest = await client.ticketEvent.findMany({
        where: { ticketId: ticket.id },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: MAX_DETAIL_EVENTS,
        select: eventSelect,
      });
      return {
        code: ticket.code,
        type: ticket.type,
        category: ticket.category,
        priority: ticket.priority,
        status: ticket.status,
        statusLabel: TICKET_STATUS_LABEL[ticket.status],
        title: ticket.title,
        createdAt: ticket.createdAt.toISOString(),
        resolvedAt: iso(ticket.resolvedAt),
        dueAt: iso(ticket.dueAt),
        overdue: isOverdue(ticket, now),
        description: ticket.description,
        affectedScope: ticket.affectedScope,
        affectedDescription: ticket.affectedDescription,
        owner: ticket.owner,
        updatedAt: ticket.updatedAt.toISOString(),
        slaStartedAt: iso(ticket.slaStartedAt),
        slaPaused: ticket.status === "WAITING_EMPLOYEE",
        allowedStatuses: allowedAnalystStatuses(ticket.type, ticket.status),
        statusNoteRequired: [...STATUS_NOTE_REQUIRED],
        events: latest.reverse().map(toEventView),
      };
    },

    changeStatus({ code, actor, toStatus, expectedStatus, note, conversationId, now }) {
      return client.$transaction(async (tx) => {
        const ticket = await tx.ticket.findUnique({
          where: { code: normalizeCode(code) },
          select: { id: true, code: true, ownerId: true, type: true, status: true, priority: true, slaStartedAt: true, dueAt: true, resolvedAt: true, updatedAt: true },
        });
        if (!ticket) throw new TicketNotFoundError();
        if (conversationId !== null) {
          const conversation = await tx.conversation.findUnique({ where: { id: conversationId }, select: { ownerId: true } });
          if (conversation?.ownerId !== ticket.ownerId) throw new InvalidTicketConversationError();
        }
        const result = { ownerId: ticket.ownerId, ticketCode: ticket.code, conversationId };
        if (ticket.status === toStatus) return { ...result, changed: false };
        if (ticket.status !== expectedStatus) throw new TicketStatusConflictError();
        if (!canTransition(ticket.type, ticket.status, toStatus, "ANALYST")) throw new TicketTransitionNotAllowedError();
        if (requiresStatusNote(toStatus) && note === null) throw new TicketStatusNoteRequiredError();

        // `now` é lido fora da transação: outro evento pode ter sido gravado depois.
        const at = new Date(Math.max(now.getTime(), ticket.updatedAt.getTime()));
        const { next, eventDueAt, fromStatus } = applyTicketEvent(ticket, { type: "STATUS_CHANGED", actorType: "ANALYST", at, toStatus }, at);

        const { count } = await tx.ticket.updateMany({
          where: { id: ticket.id, status: expectedStatus },
          data: { status: next.status, slaStartedAt: next.slaStartedAt, dueAt: next.dueAt, resolvedAt: next.resolvedAt, updatedAt: next.updatedAt },
        });
        if (count === 0) {
          const current = await tx.ticket.findUniqueOrThrow({ where: { id: ticket.id }, select: { status: true } });
          if (current.status === toStatus) return { ...result, changed: false };
          throw new TicketStatusConflictError();
        }
        await tx.ticketEvent.create({
          data: {
            ticketId: ticket.id,
            type: "STATUS_CHANGED",
            actorType: "ANALYST",
            actorId: actor.id,
            content: note,
            fromStatus,
            toStatus: next.status,
            dueAt: eventDueAt,
            conversationId,
            createdAt: at,
          },
        });
        return { ...result, changed: true };
      });
    },
  };
}
