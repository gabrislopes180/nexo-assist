import { randomUUID } from "node:crypto";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus, MessageAuthorType } from "../generated/prisma/enums.js";
import type { ConfirmDraftRequest, HandoffProposal, ProposedTicketDraft, TicketLookupResult } from "../shared/chat.js";
import { confirmableDraftSchema, type ConfirmableDraft } from "../shared/conversation-draft.js";
import { noopPublisher, type ChangePublisher, type ConversationChange } from "../shared/conversation-events.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import type { AgentTrace } from "../shared/transparency.js";
import { CONVERSATION_MESSAGE_LIMIT, ConversationNotFoundError, ConversationNotWithAgentError } from "./conversation-rules.js";
import * as attendance from "./attendance.js";
import {
  readSnapshot,
  timelineMessageSelect,
  toTimelineMessage,
  type AttendanceResult,
  type ConversationSnapshot,
  type Person,
  type TimelineMessage,
} from "./timeline.js";
import { transferToAnalyst } from "./handoff.js";
import { toDraftView } from "./draft-view.js";
import { cancelPendingDraft, confirmPendingDraft, readPendingDraft, type ConfirmedDraft, type StoredAgentMessage } from "./ticket-draft.js";

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

export { ConversationNotFoundError, ConversationNotWithAgentError };

export type HistoryAuthorType = Extract<MessageAuthorType, "EMPLOYEE" | "AGENT" | "ANALYST">;
export type HistoryMessage = { authorType: HistoryAuthorType; content: string };

export type TurnReservation = {
  conversationId: string;
  isNew: boolean;
  employeeMessageId: string;
  employeeMessage: TimelineMessage;
  messageCount: number;
  status: ConversationStatus;
  previousLastMessageAt: Date;
  /** Preenchido se um analista já devolveu esta conversa ao agent. */
  returnedToAgentAt: Date | null;
  history: HistoryMessage[];
  /** Snapshot do rascunho atual do próprio dono, para o resumo de transferência. */
  pendingDraft?: ConfirmableDraft;
};

/** Com o agent, o turno vai à LLM; com analista, a mensagem só é gravada. */
export type TurnStart =
  | { kind: "AGENT_TURN"; reservation: TurnReservation }
  | { kind: "STORED_FOR_ANALYST"; employeeMessage: TimelineMessage; conversation: ConversationSnapshot };

export type { StoredAgentMessage };

export type AgentReply = {
  content: string;
  trace: AgentTrace;
  /** Sem rascunho, o anterior continua valendo; um novo o substitui. */
  ticketDraft?: ProposedTicketDraft | null;
  ticketLookup?: TicketLookupResult | null;
  quickReplies?: string[] | null;
  /** Transfere na mesma transação; o rascunho do turno e o pendente são descartados. */
  handoff?: HandoffProposal | null;
  now: Date;
};

export type ConversationService = {
  startTurn(ownerId: string, input: { conversationId?: string; content: string; now: Date }): Promise<TurnStart>;
  /** Grava resposta e rascunho na mesma transação: turno que falha não deixa rascunho. */
  /** Devolve o estado da conversa relido no fim da transação. */
  completeTurn(
    reservation: TurnReservation,
    reply: AgentReply,
  ): Promise<StoredAgentMessage & { draftId: string | null; conversationStatus: ConversationStatus; systemMessages: TimelineMessage[] }>;
  abortTurn(reservation: TurnReservation): Promise<void>;
  readDraft(ownerId: string, draftId: string): Promise<ConfirmableDraft>;
  confirmDraft(ownerId: string, draftId: string, request: ConfirmDraftRequest, now: Date): Promise<ConfirmedDraft>;
  cancelDraft(ownerId: string, draftId: string, now: Date): Promise<{ message: StoredAgentMessage }>;
  takeOver(conversationId: string, analyst: Person, now: Date): Promise<AttendanceResult>;
  replyAsAnalyst(conversationId: string, analyst: Person, content: string, now: Date): Promise<AttendanceResult & { message: TimelineMessage }>;
  returnToAgent(conversationId: string, analyst: Person, now: Date): Promise<AttendanceResult>;
  closeAttendance(conversationId: string, analyst: Person, now: Date): Promise<AttendanceResult>;
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

const employeeMessageData = (conversationId: string, ownerId: string, content: string, now: Date) =>
  ({ conversationId, authorType: "EMPLOYEE", authorId: ownerId, content, createdAt: now }) as const;

async function createConversationTurn(client: TurnClient, ownerId: string, content: string, now: Date): Promise<TurnStart> {
  const conversation = await client.conversation.create({
    data: { ownerId, status: "WITH_AGENT", messageCount: 1, lastMessageAt: now, createdAt: now },
    select: { id: true, status: true },
  });
  const message = toTimelineMessage(
    await client.message.create({ data: employeeMessageData(conversation.id, ownerId, content, now), select: timelineMessageSelect }),
  );
  return {
    kind: "AGENT_TURN",
    reservation: {
      conversationId: conversation.id,
      isNew: true,
      employeeMessageId: message.id,
      employeeMessage: message,
      messageCount: 1,
      status: conversation.status,
      previousLastMessageAt: now,
      returnedToAgentAt: null,
      history: [],
    },
  };
}

const ANALYST_STATUSES = ["WAITING_ANALYST", "WITH_ANALYST"] as const;

/**
 * Com o agent, o incremento condicional respeita o limite de 30. Com analista, não há limite nem
 * contagem: a trava é de custo da LLM. Se o condicional falhar (estado mudou), relê e reavalia uma vez.
 */
async function continueConversationTurn(
  client: TurnClient,
  ownerId: string,
  conversationId: string,
  content: string,
  now: Date,
): Promise<TurnStart> {
  const where = { id: conversationId, ownerId };
  const select = { status: true, messageCount: true, lastMessageAt: true, returnedToAgentAt: true, pendingDraft: true } as const;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const current = await client.conversation.findFirst({ where, select });
    if (!current) throw new ConversationNotFoundError();
    if (current.status === "CLOSED") throw new ConversationClosedError();

    if (current.status === "WITH_AGENT") {
      assertAcceptsTurn(current);
      const { count } = await client.conversation.updateMany({
        where: { ...where, status: "WITH_AGENT", messageCount: { lt: CONVERSATION_MESSAGE_LIMIT } },
        data: { messageCount: { increment: 1 }, lastMessageAt: now },
      });
      if (count === 0) continue;
      const history = await readHistory(client, conversationId);
      const message = toTimelineMessage(
        await client.message.create({ data: employeeMessageData(conversationId, ownerId, content, now), select: timelineMessageSelect }),
      );
      const updated = await client.conversation.findFirstOrThrow({ where, select });
      const pending = confirmableDraftSchema.safeParse(current.pendingDraft);
      return {
        kind: "AGENT_TURN",
        reservation: {
          conversationId,
          isNew: false,
          employeeMessageId: message.id,
          employeeMessage: message,
          messageCount: updated.messageCount,
          status: updated.status,
          previousLastMessageAt: current.lastMessageAt,
          returnedToAgentAt: current.returnedToAgentAt,
          history,
          ...(pending.success ? { pendingDraft: pending.data } : {}),
        },
      };
    }

    // Com analista, a mensagem não conta na cota: a cota é do agent, e devolvida a conversa a pessoa precisa poder seguir.
    const { count } = await client.conversation.updateMany({
      where: { ...where, status: { in: [...ANALYST_STATUSES] } },
      data: { lastMessageAt: now },
    });
    if (count === 0) continue;
    const message = toTimelineMessage(
      await client.message.create({ data: employeeMessageData(conversationId, ownerId, content, now), select: timelineMessageSelect }),
    );
    return { kind: "STORED_FOR_ANALYST", employeeMessage: message, conversation: await readSnapshot(client, conversationId) };
  }
  throw new Error("Mensagem do funcionário recusada duas vezes sem impedimento conhecido");
}

/** A mensagem do agent como entra na linha do tempo (e no SSE). */
function agentTimelineMessage(conversationId: string, message: StoredAgentMessage): TimelineMessage {
  return { ...message, conversationId, authorType: "AGENT", systemKind: null, author: null };
}

function toPendingDraft(proposal: ProposedTicketDraft, now: Date): ConfirmableDraft {
  const base = { draftId: randomUUID(), createdAt: now.toISOString() };
  if (proposal.kind === "CREATE") return { ...base, ...proposal };
  if (proposal.kind === "REOPEN") return { ...base, kind: proposal.kind, ticketCode: proposal.ticket.code, reason: proposal.reason };
  return { ...base, kind: proposal.kind, ticketCode: proposal.ticket.code, content: proposal.content };
}

/**
 * Transações curtas: nenhuma fica aberta durante a chamada da LLM, ou o SQLite bloquearia as escritas.
 * Cada operação publica o que criou só depois de `$transaction` resolver: transação desfeita não publica.
 */
export function createConversationService(
  client: PrismaClient,
  { publisher = noopPublisher }: { publisher?: ChangePublisher } = {},
): ConversationService {
  /** Sem mensagem criada (casos idempotentes), não há o que publicar. */
  function publish(change: ConversationChange): void {
    if (change.messages.length === 0) return;
    try {
      publisher.publish(change);
    } catch (error) {
      console.error("Falha ao publicar mudança de conversa:", describeErrorForLog(error));
    }
  }

  function publishAttendance<T extends AttendanceResult>(result: T): T {
    publish({ conversationId: result.snapshot.id, ownerId: result.snapshot.owner.id, messages: result.createdMessages, ticketsChanged: false });
    return result;
  }

  return {
    async startTurn(ownerId, { conversationId, content, now }) {
      const start = await client.$transaction((tx) =>
        conversationId === undefined
          ? createConversationTurn(tx, ownerId, content, now)
          : continueConversationTurn(tx, ownerId, conversationId, content, now),
      );
      // No caminho do agent, a mensagem do funcionário sai junto com a resposta: o abortTurn poderia apagá-la.
      if (start.kind === "STORED_FOR_ANALYST") {
        publish({ conversationId: start.conversation.id, ownerId, messages: [start.employeeMessage], ticketsChanged: false });
      }
      return start;
    },

    async completeTurn(reservation, { content, trace, ticketDraft, ticketLookup, quickReplies, handoff, now }) {
      const { conversationId } = reservation;
      const draft = ticketDraft && !handoff ? toPendingDraft(ticketDraft, now) : null;
      const storedTrace: AgentTrace = ticketLookup || quickReplies || draft
        ? { ...trace, attachments: {
            ticketLookup: ticketLookup ?? null,
            quickReplies: handoff ? null : quickReplies ?? null,
            ticketDraft: draft && ticketDraft ? toDraftView(ticketDraft, draft.draftId, now) : null,
          } }
        : trace;
      const { ownerId, ...stored } = await client.$transaction(async (tx) => {
        const message = await tx.message.create({
          data: { conversationId, authorType: "AGENT", authorId: null, content, trace: storedTrace, createdAt: now },
          select: { id: true, createdAt: true },
        });
        // Condicional: outra operação (confirmação CRITICAL, outra aba) pode ter transferido durante a LLM.
        const { count } = await tx.conversation.updateMany({
          where: { id: conversationId, status: "WITH_AGENT" },
          data: { lastMessageAt: now, ...(draft ? { pendingDraft: draft, pendingDraftId: draft.draftId } : {}) },
        });
        if (count === 0) throw new ConversationNotWithAgentError();
        const systemMessages = handoff
          ? [await transferToAnalyst(tx, { conversationId, reason: handoff.reason, summary: handoff.summary, at: now })]
          : [];
        const { status, ownerId } = await tx.conversation.findUniqueOrThrow({
          where: { id: conversationId },
          select: { status: true, ownerId: true },
        });
        return {
          ownerId,
          id: message.id,
          content,
          trace: storedTrace,
          createdAt: message.createdAt,
          draftId: draft?.draftId ?? null,
          conversationStatus: status,
          systemMessages,
        };
      });
      const messages = [reservation.employeeMessage, agentTimelineMessage(conversationId, stored), ...stored.systemMessages];
      publish({ conversationId, ownerId, messages, ticketsChanged: false });
      return stored;
    },

    readDraft(ownerId, draftId) {
      return readPendingDraft(client, ownerId, draftId);
    },

    async confirmDraft(ownerId, draftId, request, now) {
      const confirmed = await client.$transaction((tx) => confirmPendingDraft(tx, { ownerId, draftId, request, now }));
      const conversationId = confirmed.conversation.id;
      const messages = [agentTimelineMessage(conversationId, confirmed.message), ...confirmed.systemMessages];
      publish({ conversationId, ownerId, messages, ticketsChanged: true, ticketCode: confirmed.ticket.code });
      return confirmed;
    },

    async cancelDraft(ownerId, draftId, now) {
      const { message, conversationId } = await client.$transaction((tx) => cancelPendingDraft(tx, { ownerId, draftId, now }));
      publish({ conversationId, ownerId, messages: [agentTimelineMessage(conversationId, message)], ticketsChanged: false });
      return { message };
    },

    async takeOver(conversationId, analyst, now) {
      return publishAttendance(await client.$transaction((tx) => attendance.takeOver(tx, { conversationId, analyst, now })));
    },

    async replyAsAnalyst(conversationId, analyst, content, now) {
      return publishAttendance(await client.$transaction((tx) => attendance.replyAsAnalyst(tx, { conversationId, analyst, content, now })));
    },

    async returnToAgent(conversationId, analyst, now) {
      return publishAttendance(await client.$transaction((tx) => attendance.returnToAgent(tx, { conversationId, analyst, now })));
    },

    async closeAttendance(conversationId, analyst, now) {
      return publishAttendance(await client.$transaction((tx) => attendance.closeAttendance(tx, { conversationId, analyst, now })));
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
