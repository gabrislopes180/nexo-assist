import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus, MessageAuthorType } from "../generated/prisma/enums.js";
import type { ConfirmDraftRequest, HandoffProposal, ProposedTicketDraft } from "../shared/chat.js";
import type { ConfirmableDraft } from "../shared/conversation-draft.js";
import type { AgentTrace } from "../shared/transparency.js";
import { CONVERSATION_MESSAGE_LIMIT, ConversationNotWithAgentError } from "./conversation-rules.js";
import { transferToAnalyst } from "./handoff.js";
import { cancelPendingDraft, confirmPendingDraft, readPendingDraft, type ConfirmedDraft, type StoredAgentMessage } from "./ticket-draft.js";

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

export { ConversationNotWithAgentError };

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

export type { StoredAgentMessage };

export type AgentReply = {
  content: string;
  trace: AgentTrace;
  /** Sem rascunho, o anterior continua valendo; um novo o substitui. */
  ticketDraft?: ProposedTicketDraft | null;
  /** Transfere na mesma transação; o rascunho do turno e o pendente são descartados. */
  handoff?: HandoffProposal | null;
  now: Date;
};

export type ConversationService = {
  startTurn(ownerId: string, input: { conversationId?: string; content: string; now: Date }): Promise<TurnReservation>;
  /** Grava resposta e rascunho na mesma transação: turno que falha não deixa rascunho. */
  /** Devolve o estado da conversa relido no fim da transação. */
  completeTurn(
    reservation: TurnReservation,
    reply: AgentReply,
  ): Promise<StoredAgentMessage & { draftId: string | null; conversationStatus: ConversationStatus }>;
  abortTurn(reservation: TurnReservation): Promise<void>;
  readDraft(ownerId: string, draftId: string): Promise<ConfirmableDraft>;
  confirmDraft(ownerId: string, draftId: string, request: ConfirmDraftRequest, now: Date): Promise<ConfirmedDraft>;
  cancelDraft(ownerId: string, draftId: string, now: Date): Promise<{ message: StoredAgentMessage }>;
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

function toPendingDraft(proposal: ProposedTicketDraft, now: Date): ConfirmableDraft {
  const base = { draftId: randomUUID(), createdAt: now.toISOString() };
  if (proposal.kind === "CREATE") return { ...base, ...proposal };
  if (proposal.kind === "REOPEN") return { ...base, kind: proposal.kind, ticketCode: proposal.ticket.code, reason: proposal.reason };
  return { ...base, kind: proposal.kind, ticketCode: proposal.ticket.code, content: proposal.content };
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

    completeTurn({ conversationId }, { content, trace, ticketDraft, handoff, now }) {
      const draft = ticketDraft && !handoff ? toPendingDraft(ticketDraft, now) : null;
      return client.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: { conversationId, authorType: "AGENT", authorId: null, content, trace, createdAt: now },
          select: { id: true, createdAt: true },
        });
        // Condicional: outra operação (confirmação CRITICAL, outra aba) pode ter transferido durante a LLM.
        const { count } = await tx.conversation.updateMany({
          where: { id: conversationId, status: "WITH_AGENT" },
          data: { lastMessageAt: now, ...(draft ? { pendingDraft: draft, pendingDraftId: draft.draftId } : {}) },
        });
        if (count === 0) throw new ConversationNotWithAgentError();
        if (handoff) await transferToAnalyst(tx, { conversationId, reason: handoff.reason, summary: handoff.summary, at: now });
        const { status } = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { status: true } });
        return { id: message.id, content, trace, createdAt: message.createdAt, draftId: draft?.draftId ?? null, conversationStatus: status };
      });
    },

    readDraft(ownerId, draftId) {
      return readPendingDraft(client, ownerId, draftId);
    },

    confirmDraft(ownerId, draftId, request, now) {
      return client.$transaction((tx) => confirmPendingDraft(tx, { ownerId, draftId, request, now }));
    },

    cancelDraft(ownerId, draftId, now) {
      return client.$transaction((tx) => cancelPendingDraft(tx, { ownerId, draftId, now }));
    },

    async abortTurn(reservation) {
      const { conversationId, employeeMessageId, previousLastMessageAt } = reservation;
      if (reservation.isNew) {
        await client.conversation.delete({ where: { id: conversationId } });
        return;
      }
      await client.$transaction(async (tx) => {
        await tx.message.delete({ where: { id: employeeMessageId } });
        // Outra operação pode ter gravado depois da reserva (ex.: a mensagem SYSTEM de uma transferência).
        const latest = await tx.message.findFirst({ where: { conversationId }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
        await tx.conversation.update({
          where: { id: conversationId },
          data: { messageCount: { decrement: 1 }, lastMessageAt: latest?.createdAt ?? previousLastMessageAt },
        });
      });
    },
  };
}
