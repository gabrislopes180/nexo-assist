import type { PrismaClient } from "../generated/prisma/client.js";
import type { TicketStatus } from "../generated/prisma/enums.js";
import type { TicketLookupCriteria, TicketLookupResult } from "../shared/chat.js";
import { matchTickets, type MatchableTicket } from "./ticket-matching.js";
import { isOpen, OPEN_STATUSES, type OpenTicketStatus } from "./ticket-rules.js";

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

const matchableTicketSelect = {
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

function isOpenTicket<T extends { status: TicketStatus }>(ticket: T): ticket is T & { status: OpenTicketStatus } {
  return isOpen(ticket);
}

export function createTicketService(client: Pick<PrismaClient, "ticket">): TicketService {
  return {
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
