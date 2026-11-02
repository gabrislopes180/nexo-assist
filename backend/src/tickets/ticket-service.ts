import type { PrismaClient } from "../generated/prisma/client.js";
import type { TicketStatus } from "../generated/prisma/enums.js";
import type { SimilarTicket, TicketLookupCriteria, TicketLookupResult, TicketSummary } from "../shared/chat.js";
import { isOverdue } from "./sla.js";
import { byUrgency, MAX_LOOKUP_TICKETS, matchTickets, similarTicketMatches, toTicketSummary, type MatchableTicket } from "./ticket-matching.js";
import { canReopen, isOpen, OPEN_STATUSES, TICKET_STATUS_LABEL, type OpenTicketStatus } from "./ticket-rules.js";

/** A futura tool converte este erro no resultado `UNAVAILABLE`. */
export class TicketServiceUnavailableError extends Error {
  constructor() {
    super("Serviço de chamados indisponível");
    this.name = "TicketServiceUnavailableError";
  }
}

/** `ownerId` vem só da sessão: nem o cliente nem a LLM escolhem de quem são os chamados. */
export type TicketService = {
  lookupOpenTickets(ownerId: string, criteria: TicketLookupCriteria, now: Date): Promise<TicketLookupResult>;
};

/**
 * Leitura com escopo de dono, para validar um chamado por código. Null para chamado
 * inexistente, resolvido ou de outro dono: quem chama não distingue os casos.
 */
export type TicketCodeReader = {
  findOpenTicketByCode(ownerId: string, code: string, now: Date): Promise<TicketSummary | null>;
};

/** `only: "reopenable"` deixa só resolvidos ainda reabríveis, filtrados antes do corte em 5. */
export type SimilarTicketOptions = { only?: "reopenable" };

/**
 * Possíveis duplicados do dono: abertos e resolvidos ainda reabríveis, com escopo de dono.
 * Sem opções, abertos parecidos podem ocupar as 5 vagas; para reabertura, use `only: "reopenable"`.
 */
export type SimilarTicketReader = {
  findSimilarTickets(ownerId: string, keywords: readonly string[], now: Date, options?: SimilarTicketOptions): Promise<SimilarTicket[]>;
};

/**
 * Para reabertura. Null só para inexistente ou de outro dono. Chamado aberto volta com o status
 * aberto e `canReopen: false`: é assim que quem chama distingue "ainda aberto" de "fora da janela".
 */
export type ResolvedTicketReader = {
  findResolvedTicketByCode(ownerId: string, code: string, now: Date): Promise<{ ticket: SimilarTicket; canReopen: boolean } | null>;
};

/** Falha com TicketServiceUnavailableError quando o serviço não pode receber uma escrita. */
export type TicketAvailability = {
  ensureAvailable(): Promise<void>;
};

export type FullTicketService = TicketService & TicketCodeReader & SimilarTicketReader & ResolvedTicketReader & TicketAvailability;

export const matchableTicketSelect = {
  code: true,
  type: true,
  category: true,
  priority: true,
  status: true,
  title: true,
  description: true,
  createdAt: true,
  dueAt: true,
} as const;

type SimilarSource = MatchableTicket extends infer T ? Omit<T, "status"> & { status: TicketStatus; resolvedAt: Date | null } : never;

function toSimilarTicket(ticket: SimilarSource, now: Date): SimilarTicket {
  return {
    code: ticket.code,
    type: ticket.type,
    category: ticket.category,
    priority: ticket.priority,
    status: ticket.status,
    statusLabel: TICKET_STATUS_LABEL[ticket.status],
    title: ticket.title,
    createdAt: ticket.createdAt.toISOString(),
    dueAt: ticket.dueAt?.toISOString() ?? null,
    overdue: isOverdue(ticket, now),
    canReopen: canReopen(ticket, now),
  };
}

export function isOpenTicket<T extends { status: TicketStatus }>(ticket: T): ticket is T & { status: OpenTicketStatus } {
  return isOpen(ticket);
}

export function createTicketService(client: Pick<PrismaClient, "ticket">): FullTicketService {
  return {
    async ensureAvailable() {
      await client.ticket.findFirst({ select: { id: true } });
    },

    async findSimilarTickets(ownerId, keywords, now, options = {}) {
      const rows = await client.ticket.findMany({ where: { ownerId }, select: { ...matchableTicketSelect, resolvedAt: true } });
      const candidates = rows.filter((ticket) =>
        options.only === "reopenable" ? canReopen(ticket, now) : isOpen(ticket) || canReopen(ticket, now),
      );
      return [...similarTicketMatches(candidates, keywords)]
        .sort(byUrgency(now))
        .slice(0, MAX_LOOKUP_TICKETS)
        .map((ticket) => toSimilarTicket(ticket, now));
    },

    async findResolvedTicketByCode(ownerId, code, now) {
      const ticket = await client.ticket.findFirst({
        where: { ownerId, code: code.toUpperCase() },
        select: { ...matchableTicketSelect, resolvedAt: true },
      });
      if (!ticket) return null;
      const similar = toSimilarTicket(ticket, now);
      return { ticket: similar, canReopen: similar.canReopen };
    },


    async findOpenTicketByCode(ownerId, code, now) {
      const ticket = await client.ticket.findFirst({
        where: { ownerId, code: code.toUpperCase(), status: { in: [...OPEN_STATUSES] } },
        select: matchableTicketSelect,
      });
      return ticket && isOpenTicket(ticket) ? toTicketSummary(ticket, now) : null;
    },

    async lookupOpenTickets(ownerId, criteria, now) {
      const rows = await client.ticket.findMany({
        where: { ownerId, status: { in: [...OPEN_STATUSES] } },
        select: matchableTicketSelect,
      });
      const open: MatchableTicket[] = rows.filter(isOpenTicket);
      if (open.length === 0) return { outcome: "NO_OPEN_TICKETS", openTicketCount: 0, totalMatches: 0, tickets: [] };

      const openTicketCount = open.length;
      const { totalMatches, tickets } = matchTickets(open, criteria, now);
      const [first] = tickets;
      if (first === undefined) return { outcome: "NO_MATCH", openTicketCount, totalMatches: 0, tickets: [] };
      if (totalMatches === 1) return { outcome: "SINGLE_MATCH", openTicketCount, totalMatches: 1, tickets: [first] };
      return { outcome: "MULTIPLE_MATCHES", openTicketCount, totalMatches, tickets };
    },
  };
}
