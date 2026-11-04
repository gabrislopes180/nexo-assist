import { CONVERSATION_MESSAGE_LIMIT } from "../conversations/conversation-rules.js";
import type { ConsoleRow, ConversationQueries } from "../conversations/conversation-queries.js";
import type { ConversationService } from "../conversations/conversation-service.js";
import { toTimelineMessageView } from "../conversations/timeline.js";
import type { ConsoleConversation, ConsoleListQuery, ConsoleTickets, TimelineMessageView } from "../shared/console.js";
import type { SessionUser } from "../shared/session.js";
import type { OwnerTicketReader } from "../tickets/ticket-service.js";

export class AnalystOnlyError extends Error {
  constructor() {
    super("Console disponível só para analistas");
    this.name = "AnalystOnlyError";
  }
}

export type ConsoleService = {
  listConversations(actor: SessionUser, query: ConsoleListQuery): Promise<ConsoleConversation[]>;
  getConversation(actor: SessionUser, conversationId: string): Promise<ConsoleConversation>;
  getMessages(actor: SessionUser, conversationId: string): Promise<TimelineMessageView[]>;
  getTickets(actor: SessionUser, conversationId: string): Promise<ConsoleTickets>;
  takeOver(actor: SessionUser, conversationId: string): Promise<ConsoleConversation>;
  reply(actor: SessionUser, conversationId: string, content: string): Promise<{ message: TimelineMessageView; conversation: ConsoleConversation }>;
  returnToAgent(actor: SessionUser, conversationId: string): Promise<ConsoleConversation>;
  close(actor: SessionUser, conversationId: string): Promise<ConsoleConversation>;
};

type ConsoleServiceDeps = {
  conversations: ConversationService;
  queries: ConversationQueries;
  tickets: OwnerTicketReader;
  now?: () => Date;
};

const iso = (date: Date | null) => date?.toISOString() ?? null;

/** `assignedToMe` depende de quem lê: a mesma linha vira views diferentes por analista. */
export function toConsoleConversation(row: ConsoleRow, viewerId: string): ConsoleConversation {
  return {
    id: row.id,
    status: row.status,
    owner: row.owner,
    analyst: row.analyst,
    assignedToMe: row.analyst?.id === viewerId,
    assignedAt: iso(row.assignedAt),
    handoffReason: row.handoffReason,
    handoffSummary: row.handoffSummary,
    handoffAt: iso(row.handoffAt),
    lastMessageAt: row.lastMessageAt.toISOString(),
    closedAt: iso(row.closedAt),
    messageCount: row.messageCount,
    messageLimit: CONVERSATION_MESSAGE_LIMIT,
    lastMessage: row.lastMessage && { ...row.lastMessage, createdAt: row.lastMessage.createdAt.toISOString() },
    lastAgentConfidence: row.lastAgentConfidence,
    ticketCode: row.ticketCode,
  };
}

/** Exportada para o router checar o papel antes de validar query/corpo (403 antes de 400). */
export function assertAnalyst(actor: SessionUser): void {
  if (actor.role !== "ANALYST") throw new AnalystOnlyError();
}

/** O analista vem sempre da sessão; qualquer analista lê qualquer conversa (a fila é compartilhada). */
export function createConsoleService({ conversations, queries, tickets, now = () => new Date() }: ConsoleServiceDeps): ConsoleService {
  const analystOf = (actor: SessionUser) => ({ id: actor.id, name: actor.name });
  const viewOf = async (actor: SessionUser, conversationId: string) => toConsoleConversation(await queries.find(conversationId), actor.id);

  return {
    async listConversations(actor, { filter, q }) {
      assertAnalyst(actor);
      const rows = await queries.list({ now: now(), filter, analystId: actor.id, ...(q === undefined ? {} : { q }) });
      return rows.map((row) => toConsoleConversation(row, actor.id));
    },

    async getConversation(actor, conversationId) {
      assertAnalyst(actor);
      return viewOf(actor, conversationId);
    },

    async getMessages(actor, conversationId) {
      assertAnalyst(actor);
      return (await queries.messages(conversationId)).map(toTimelineMessageView);
    },

    /** O chamado da conversa vem da regra de `ticketCode`; os demais são os outros do mesmo dono. */
    async getTickets(actor, conversationId) {
      assertAnalyst(actor);
      const row = await queries.find(conversationId);
      const owned = await tickets.listOwnerTickets(row.owner.id, now());
      return {
        conversationTicket: owned.find((ticket) => ticket.code === row.ticketCode) ?? null,
        otherTickets: owned.filter((ticket) => ticket.code !== row.ticketCode),
      };
    },

    async takeOver(actor, conversationId) {
      assertAnalyst(actor);
      await conversations.takeOver(conversationId, analystOf(actor), now());
      return viewOf(actor, conversationId);
    },

    async reply(actor, conversationId, content) {
      assertAnalyst(actor);
      const { message } = await conversations.replyAsAnalyst(conversationId, analystOf(actor), content, now());
      return { message: toTimelineMessageView(message), conversation: await viewOf(actor, conversationId) };
    },

    async returnToAgent(actor, conversationId) {
      assertAnalyst(actor);
      await conversations.returnToAgent(conversationId, analystOf(actor), now());
      return viewOf(actor, conversationId);
    },

    async close(actor, conversationId) {
      assertAnalyst(actor);
      await conversations.closeAttendance(conversationId, analystOf(actor), now());
      return viewOf(actor, conversationId);
    },
  };
}
