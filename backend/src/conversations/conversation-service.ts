import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus, MessageAuthorType } from "../generated/prisma/enums.js";
import type { AgentTrace } from "../shared/transparency.js";
import { CONVERSATION_MESSAGE_LIMIT } from "./conversation-rules.js";

export class ConversationNotFoundError extends Error {
  constructor() {
    super("Conversa não encontrada");
    this.name = "ConversationNotFoundError";
  }
}

export class ConversationMessageLimitReachedError extends Error {
  constructor() {
    super("Limite de mensagens da conversa atingido");
    this.name = "ConversationMessageLimitReachedError";
  }
}

export class ConversationClosedError extends Error {
  constructor() {
    super("Conversa encerrada");
    this.name = "ConversationClosedError";
  }
}

export class ConversationNotWithAgentError extends Error {
  constructor() {
    super("Conversa não está com o agent");
    this.name = "ConversationNotWithAgentError";
  }
}

export type HistoryAuthorType = Extract<MessageAuthorType, "EMPLOYEE" | "AGENT" | "ANALYST">;
export type HistoryMessage = { authorType: HistoryAuthorType; content: string };

export type TurnReservation = {
  conversationId: string;
  isNew: boolean;
  employeeMessageId: string;
  messageCount: number;
  status: ConversationStatus;
  previousLastMessageAt: Date;
  history: HistoryMessage[];
};

export type StoredAgentMessage = { id: string; content: string; trace: AgentTrace; createdAt: Date };

export type ConversationService = {
  startTurn(ownerId: string, input: { conversationId?: string; content: string; now: Date }): Promise<TurnReservation>;
  completeTurn(reservation: TurnReservation, reply: { content: string; trace: AgentTrace; now: Date }): Promise<StoredAgentMessage>;
  abortTurn(reservation: TurnReservation): Promise<void>;
};

const HISTORY_LIMIT = 20;
const HISTORY_AUTHOR_TYPES = ["EMPLOYEE", "AGENT", "ANALYST"] as const satisfies readonly HistoryAuthorType[];

type TurnClient = Pick<PrismaClient, "conversation" | "message">;

function isHistoryAuthor(authorType: MessageAuthorType): authorType is HistoryAuthorType {
  return (HISTORY_AUTHOR_TYPES as readonly MessageAuthorType[]).includes(authorType);
}

/** Lança o erro que impede o turno; sem impedimento, não faz nada. */
function assertAcceptsTurn(conversation: { status: ConversationStatus; messageCount: number } | null): void {
  if (!conversation) throw new ConversationNotFoundError();
  if (conversation.status === "CLOSED") throw new ConversationClosedError();
  if (conversation.status !== "WITH_AGENT") throw new ConversationNotWithAgentError();
  if (conversation.messageCount >= CONVERSATION_MESSAGE_LIMIT) throw new ConversationMessageLimitReachedError();
}

async function readHistory(client: TurnClient, conversationId: string): Promise<HistoryMessage[]> {
  const rows = await client.message.findMany({
    where: { conversationId, authorType: { in: [...HISTORY_AUTHOR_TYPES] } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
    select: { authorType: true, content: true },
  });
  return rows.reverse().flatMap(({ authorType, content }) => (isHistoryAuthor(authorType) ? [{ authorType, content }] : []));
}

async function createConversationTurn(client: TurnClient, ownerId: string, content: string, now: Date): Promise<TurnReservation> {
  const conversation = await client.conversation.create({
    data: {
      ownerId,
      status: "WITH_AGENT",
      messageCount: 1,
      lastMessageAt: now,
      createdAt: now,
      messages: { create: { authorType: "EMPLOYEE", authorId: ownerId, content, createdAt: now } },
    },
    select: { id: true, status: true, messages: { select: { id: true } } },
  });
  const [message] = conversation.messages;
  if (!message) throw new Error("Conversa criada sem a mensagem do funcionário");
  return {
    conversationId: conversation.id,
    isNew: true,
    employeeMessageId: message.id,
    messageCount: 1,
    status: conversation.status,
    previousLastMessageAt: now,
    history: [],
  };
}

async function continueConversationTurn(
  client: TurnClient,
  ownerId: string,
  conversationId: string,
  content: string,
  now: Date,
): Promise<TurnReservation> {
  const where = { id: conversationId, ownerId };
  const select = { status: true, messageCount: true, lastMessageAt: true } as const;

  const current = await client.conversation.findFirst({ where, select });
  assertAcceptsTurn(current);
  if (!current) throw new ConversationNotFoundError();

  // Condicional: é o que garante o limite e o estado mesmo sob concorrência.
  const { count } = await client.conversation.updateMany({
    where: { ...where, status: "WITH_AGENT", messageCount: { lt: CONVERSATION_MESSAGE_LIMIT } },
    data: { messageCount: { increment: 1 }, lastMessageAt: now },
  });
  if (count === 0) {
    assertAcceptsTurn(await client.conversation.findFirst({ where, select }));
    throw new Error("Incremento condicional recusado sem impedimento conhecido");
  }

  const history = await readHistory(client, conversationId);
  const message = await client.message.create({
    data: { conversationId, authorType: "EMPLOYEE", authorId: ownerId, content, createdAt: now },
    select: { id: true },
  });
  const updated = await client.conversation.findFirstOrThrow({ where, select });
  return {
    conversationId,
    isNew: false,
    employeeMessageId: message.id,
    messageCount: updated.messageCount,
    status: updated.status,
    previousLastMessageAt: current.lastMessageAt,
    history,
  };
}

/** Transações curtas: nenhuma fica aberta durante a chamada da LLM, ou o SQLite bloquearia as escritas. */
export function createConversationService(client: PrismaClient): ConversationService {
  return {
    startTurn(ownerId, { conversationId, content, now }) {
      return client.$transaction((tx) =>
        conversationId === undefined
          ? createConversationTurn(tx, ownerId, content, now)
          : continueConversationTurn(tx, ownerId, conversationId, content, now),
      );
    },

    completeTurn({ conversationId }, { content, trace, now }) {
      return client.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: { conversationId, authorType: "AGENT", authorId: null, content, trace, createdAt: now },
          select: { id: true, createdAt: true },
        });
        await tx.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } });
        return { id: message.id, content, trace, createdAt: message.createdAt };
      });
    },

    async abortTurn(reservation) {
      const { conversationId, employeeMessageId, previousLastMessageAt } = reservation;
      if (reservation.isNew) {
        await client.conversation.delete({ where: { id: conversationId } });
        return;
      }
      await client.$transaction(async (tx) => {
        await tx.message.delete({ where: { id: employeeMessageId } });
        await tx.conversation.update({
          where: { id: conversationId },
          data: { messageCount: { decrement: 1 }, lastMessageAt: previousLastMessageAt },
        });
      });
    },
  };
}
