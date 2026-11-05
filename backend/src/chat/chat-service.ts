import { CONVERSATION_MESSAGE_LIMIT, remainingMessages } from "../conversations/conversation-rules.js";
import type { ConversationService, StoredAgentMessage, TurnReservation } from "../conversations/conversation-service.js";
import type { ConversationQueries } from "../conversations/conversation-queries.js";
import { toDraftView } from "../conversations/draft-view.js";
import { toTimelineMessageView, type ConversationSnapshot, type TimelineMessage } from "../conversations/timeline.js";
import { DraftKindMismatchError, TicketNotOpenError, TicketNotReopenableError } from "../conversations/ticket-draft.js";
import {
  handoffProposalSchema,
  proposedAnyDraftSchema,
  quickRepliesSchema,
  type CancelDraftResponse,
  type ChatConversationView,
  type ChatConversationDetail,
  type ActiveChatConversation,
  type ChatMessageView,
  type EmployeeMessageView,
  type ChatRequest,
  type ChatResponse,
  type ConfirmDraftRequest,
  type ConfirmDraftResponse,
  type ProposedTicketDraft,
} from "../shared/chat.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import type { SessionUser } from "../shared/session.js";
import { agentTraceSchema, type AgentAction, type AgentTrace } from "../shared/transparency.js";
import { capPriority } from "../tickets/ticket-rules.js";
import {
  TicketServiceUnavailableError,
  type ResolvedTicketReader,
  type TicketAvailability,
  type TicketCodeReader,
} from "../tickets/ticket-service.js";
import { AgentUnavailableError, type AgentRunner } from "./agent-runner.js";

export class EmployeeOnlyError extends Error {
  constructor() {
    super("Chat disponível só para funcionários");
    this.name = "EmployeeOnlyError";
  }
}

export type ChatService = {
  sendMessage(actor: SessionUser, request: ChatRequest): Promise<ChatResponse>;
  confirmDraft(actor: SessionUser, draftId: string, request: ConfirmDraftRequest): Promise<ConfirmDraftResponse>;
  cancelDraft(actor: SessionUser, draftId: string): Promise<CancelDraftResponse>;
  /** Conversa do próprio funcionário com todas as mensagens; alheia ou inexistente é 404. */
  getConversation(actor: SessionUser, conversationId: string): Promise<ChatConversationDetail>;
  getActiveConversation(actor: SessionUser): Promise<ActiveChatConversation>;
};

type ChatServiceDeps = {
  conversations: ConversationService;
  agentRunner: AgentRunner;
  tickets: TicketCodeReader & ResolvedTicketReader & TicketAvailability;
  queries: Pick<ConversationQueries, "ownedByEmployee" | "activeForEmployee">;
  now?: () => Date;
};

/** A proposta aceita, ou o que a resposta passa a dizer quando ela foi descartada. */
type ResolvedProposal = { ticketDraft: ProposedTicketDraft } | { discarded: { content: string; action: AgentAction } };

const DRAFT_NOT_VERIFIED = {
  content: "Não encontrei esse chamado entre os seus chamados abertos, então nada foi preparado.",
  action: { tool: "validateTicketDraft", summary: "Chamado da proposta não está entre os abertos da pessoa; rascunho descartado.", status: "SKIPPED" },
} as const;

const DRAFT_NOT_REOPENABLE = {
  content: "Esse chamado não pode ser reaberto agora, então nada foi preparado.",
  action: { tool: "validateTicketDraft", summary: "Chamado da proposta não está resolvido dentro da janela de reabertura; rascunho descartado.", status: "SKIPPED" },
} as const;

const DRAFT_STILL_OPEN = {
  content: "Esse chamado ainda está aberto, então não precisa ser reaberto. Se quiser, posso acrescentar a informação nova a ele.",
  action: { tool: "validateTicketDraft", summary: "Chamado da proposta ainda está aberto; rascunho de reabertura descartado.", status: "SKIPPED" },
} as const;

const DRAFT_UNAVAILABLE = {
  content: "Não consegui verificar o chamado agora, então nada foi preparado. Tente novamente em instantes.",
  action: { tool: "validateTicketDraft", summary: "Serviço de chamados indisponível; rascunho descartado.", status: "ERROR" },
} as const;

const HANDOFF_FAILED = {
  content: "Não consegui transferir a conversa para um analista agora, mas posso continuar te ajudando por aqui.",
  action: { tool: "transferToAnalyst", summary: "Transferência proposta inválida; a conversa continua com o agent.", status: "ERROR" },
} as const;

const DRAFT_SUPERSEDED_BY_HANDOFF = {
  tool: "validateTicketDraft",
  summary: "Rascunho descartado porque o turno propôs uma transferência para analista.",
  status: "SKIPPED",
} as const;

function withDiscardedDraft(trace: AgentTrace, action: AgentAction): AgentTrace {
  return { ...trace, actions: [...trace.actions, action], reason: "O rascunho proposto foi descartado na validação do backend." };
}

function toMessageView(message: StoredAgentMessage): ChatMessageView {
  return {
    id: message.id,
    authorType: "AGENT",
    content: message.content,
    trace: message.trace,
    createdAt: message.createdAt.toISOString(),
  };
}

function toEmployeeMessageView(message: TimelineMessage): EmployeeMessageView {
  return { id: message.id, authorType: "EMPLOYEE", content: message.content, createdAt: message.createdAt.toISOString() };
}

export function toConversationView(snapshot: Pick<ConversationSnapshot, "id" | "status" | "messageCount" | "analyst">): ChatConversationView {
  return {
    id: snapshot.id,
    status: snapshot.status,
    messageCount: snapshot.messageCount,
    messageLimit: CONVERSATION_MESSAGE_LIMIT,
    remainingMessages: remainingMessages(snapshot.messageCount),
    analyst: snapshot.analyst,
  };
}

function assertEmployee(actor: SessionUser): void {
  if (actor.role !== "EMPLOYEE") throw new EmployeeOnlyError();
}

export function createChatService({ conversations, agentRunner, tickets, queries, now = () => new Date() }: ChatServiceDeps): ChatService {
  /** Falha aqui não pode esconder o erro do turno. */
  async function abort(reservation: TurnReservation): Promise<void> {
    try {
      await conversations.abortTurn(reservation);
    } catch (error) {
      console.error("Falha ao desfazer o turno:", describeErrorForLog(error));
    }
  }

  /**
   * Complemento: a proposta só define o que complementar; o chamado mostrado e gravado vem do
   * serviço, com escopo de dono. Criação: o teto de prioridade vale de novo aqui. Sem como
   * validar, descarta a proposta em vez de derrubar o turno.
   */
  async function resolveProposal(ownerId: string, proposal: ProposedTicketDraft): Promise<ResolvedProposal> {
    if (proposal.kind === "CREATE") {
      return { ticketDraft: { ...proposal, priority: capPriority(proposal.priority, proposal.affectedScope) } };
    }
    try {
      if (proposal.kind === "REOPEN") {
        const found = await tickets.findResolvedTicketByCode(ownerId, proposal.ticket.code, now());
        if (found?.canReopen) return { ticketDraft: { ...proposal, ticket: found.ticket } };
        return { discarded: found && found.ticket.status !== "RESOLVED" ? DRAFT_STILL_OPEN : DRAFT_NOT_REOPENABLE };
      }
      const ticket = await tickets.findOpenTicketByCode(ownerId, proposal.ticket.code, now());
      return ticket ? { ticketDraft: { ...proposal, ticket } } : { discarded: DRAFT_NOT_VERIFIED };
    } catch (error) {
      if (error instanceof TicketServiceUnavailableError) return { discarded: DRAFT_UNAVAILABLE };
      throw error;
    }
  }

  return {
    async sendMessage(actor, { message, conversationId }) {
      assertEmployee(actor);

      const start = await conversations.startTurn(actor.id, {
        ...(conversationId === undefined ? {} : { conversationId }),
        content: message,
        now: now(),
      });
      if (start.kind === "STORED_FOR_ANALYST") {
        return {
          conversation: toConversationView(start.conversation),
          employeeMessage: toEmployeeMessageView(start.employeeMessage),
          message: null,
          ticketLookup: null,
          ticketDraft: null,
          quickReplies: null,
        };
      }
      const { reservation } = start;

      try {
        // Fora de transação: a LLM é lenta e o SQLite bloquearia as escritas.
        const result = await agentRunner.runTurn({
          conversationId: reservation.conversationId,
          actor: { id: actor.id, name: actor.name },
          history: reservation.history,
          ...(reservation.pendingDraft ? { pendingDraft: reservation.pendingDraft } : {}),
          message,
          returnedFromAnalyst: reservation.returnedToAgentAt !== null,
        });
        const trace = agentTraceSchema.safeParse(result.trace);
        if (!trace.success) throw new AgentUnavailableError();
        const parsedHandoff = handoffProposalSchema.safeParse(result.handoff);
        const handoff = parsedHandoff.success ? parsedHandoff.data : null;
        const handoffFailed = result.handoff != null && !parsedHandoff.success;
        const hadDraft = result.ticketDraft != null;
        const proposal = proposedAnyDraftSchema.nullish().safeParse(result.ticketDraft);
        // Rascunho malformado é falha do agent, salvo quando há transferência: ela prevalece e o rascunho sai de qualquer jeito.
        if (!proposal.success && !handoff && !handoffFailed) throw new AgentUnavailableError();
        // A transferência prevalece sobre o rascunho; se ela falhar, o rascunho também sai, para a resposta ficar coerente.
        const resolved = proposal.success && proposal.data && !handoff && !handoffFailed ? await resolveProposal(actor.id, proposal.data) : null;
        const discarded = resolved && "discarded" in resolved ? resolved.discarded : null;
        const ticketDraft = resolved && "ticketDraft" in resolved ? resolved.ticketDraft : null;
        const quickReplies = quickRepliesSchema.safeParse(result.quickReplies);
        const supersededDraft = (handoff || handoffFailed) && hadDraft ? [DRAFT_SUPERSEDED_BY_HANDOFF] : [];
        const replyTrace: AgentTrace = handoffFailed
          ? {
              ...trace.data,
              actions: [...trace.data.actions, ...supersededDraft, HANDOFF_FAILED.action],
              reason: "A transferência proposta foi descartada na validação do backend.",
            }
          : discarded
            ? withDiscardedDraft(trace.data, discarded.action)
            : { ...trace.data, actions: [...trace.data.actions, ...supersededDraft] };
        const at = now();
        const replies = !discarded && !handoff && !handoffFailed && quickReplies.success ? quickReplies.data : null;
        const stored = await conversations.completeTurn(reservation, {
          content: handoffFailed ? HANDOFF_FAILED.content : discarded ? discarded.content : result.content,
          trace: replyTrace,
          ticketDraft,
          handoff,
          ticketLookup: result.ticketLookup,
          quickReplies: replies,
          now: at,
        });
        return {
          conversation: {
            id: reservation.conversationId,
            status: stored.conversationStatus,
            messageCount: reservation.messageCount,
            messageLimit: CONVERSATION_MESSAGE_LIMIT,
            remainingMessages: remainingMessages(reservation.messageCount),
            analyst: null,
          },
          employeeMessage: toEmployeeMessageView(reservation.employeeMessage),
          message: toMessageView(stored),
          ticketLookup: result.ticketLookup,
          ticketDraft: ticketDraft && stored.draftId ? toDraftView(ticketDraft, stored.draftId, at) : null,
          quickReplies: replies,
        };
      } catch (error) {
        await abort(reservation);
        throw error;
      }
    },

    /** Sem LLM e sem consumir cota. A checagem pelo serviço trata a indisponibilidade; a da transação decide. */
    async confirmDraft(actor, draftId, request) {
      assertEmployee(actor);
      const draft = await conversations.readDraft(actor.id, draftId);
      if (draft.kind !== request.kind) throw new DraftKindMismatchError();
      if (draft.kind === "CREATE") await tickets.ensureAvailable();
      else if (draft.kind === "REOPEN") {
        if (!(await tickets.findResolvedTicketByCode(actor.id, draft.ticketCode, now()))?.canReopen) throw new TicketNotReopenableError();
      } else if (!(await tickets.findOpenTicketByCode(actor.id, draft.ticketCode, now()))) throw new TicketNotOpenError();
      const { message, ticket, conversation } = await conversations.confirmDraft(actor.id, draftId, request, now());
      return { message: toMessageView(message), ticket, conversation };
    },

    async getConversation(actor, conversationId) {
      assertEmployee(actor);
      const { snapshot, messages, pendingDraft } = await queries.ownedByEmployee(actor.id, conversationId);
      return { conversation: toConversationView(snapshot), messages: messages.map(toTimelineMessageView), pendingDraft: pendingDraft ?? null };
    },

    async getActiveConversation(actor) {
      assertEmployee(actor);
      const result = await queries.activeForEmployee(actor.id);
      if (!result) return { conversation: null, messages: [], pendingDraft: null };
      return { conversation: toConversationView(result.snapshot), messages: result.messages.map(toTimelineMessageView), pendingDraft: result.pendingDraft ?? null };
    },

    async cancelDraft(actor, draftId) {
      assertEmployee(actor);
      const { message } = await conversations.cancelDraft(actor.id, draftId, now());
      return { message: toMessageView(message) };
    },
  };
}
