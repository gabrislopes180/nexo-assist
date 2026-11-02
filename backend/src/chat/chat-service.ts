import { CONVERSATION_MESSAGE_LIMIT, remainingMessages } from "../conversations/conversation-rules.js";
import type { ConversationService, StoredAgentMessage, TurnReservation } from "../conversations/conversation-service.js";
import { DraftKindMismatchError, TicketNotOpenError } from "../conversations/ticket-draft.js";
import {
  proposedAnyDraftSchema,
  quickRepliesSchema,
  type CancelDraftResponse,
  type ChatMessageView,
  type ChatRequest,
  type ChatResponse,
  type ConfirmDraftRequest,
  type ConfirmDraftResponse,
  type ProposedTicketDraft,
  type TicketDraft,
} from "../shared/chat.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import type { SessionUser } from "../shared/session.js";
import { agentTraceSchema, type AgentAction, type AgentTrace } from "../shared/transparency.js";
import { computeDueAt } from "../tickets/sla.js";
import { capPriority } from "../tickets/ticket-rules.js";
import { TicketServiceUnavailableError, type TicketAvailability, type TicketCodeReader } from "../tickets/ticket-service.js";
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
};

type ChatServiceDeps = {
  conversations: ConversationService;
  agentRunner: AgentRunner;
  tickets: TicketCodeReader & TicketAvailability;
  now?: () => Date;
};

/** A proposta aceita, ou o que a resposta passa a dizer quando ela foi descartada. */
type ResolvedProposal = { ticketDraft: ProposedTicketDraft } | { discarded: { content: string; action: AgentAction } };

const DRAFT_NOT_VERIFIED = {
  content: "Não encontrei esse chamado entre os seus chamados abertos, então nada foi preparado.",
  action: { tool: "validateTicketDraft", summary: "Chamado da proposta não está entre os abertos da pessoa; rascunho descartado.", status: "SKIPPED" },
} as const;

const DRAFT_UNAVAILABLE = {
  content: "Não consegui verificar o chamado agora, então nada foi preparado. Tente novamente em instantes.",
  action: { tool: "validateTicketDraft", summary: "Serviço de chamados indisponível; rascunho descartado.", status: "ERROR" },
} as const;

function withDiscardedDraft(trace: AgentTrace, action: AgentAction): AgentTrace {
  return { ...trace, actions: [...trace.actions, action], reason: "O rascunho proposto foi descartado na validação do backend." };
}

function toDraftView(proposal: ProposedTicketDraft, id: string, at: Date): TicketDraft {
  if (proposal.kind === "COMPLEMENT") return { id, ...proposal };
  const { priorityReason: _priorityReason, ...visible } = proposal;
  return { id, ...visible, dueAtPreview: computeDueAt(proposal.priority, at).toISOString() };
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

function assertEmployee(actor: SessionUser): void {
  if (actor.role !== "EMPLOYEE") throw new EmployeeOnlyError();
}

export function createChatService({ conversations, agentRunner, tickets, now = () => new Date() }: ChatServiceDeps): ChatService {
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

      const reservation = await conversations.startTurn(actor.id, {
        ...(conversationId === undefined ? {} : { conversationId }),
        content: message,
        now: now(),
      });

      try {
        // Fora de transação: a LLM é lenta e o SQLite bloquearia as escritas.
        const result = await agentRunner.runTurn({
          conversationId: reservation.conversationId,
          actor: { id: actor.id, name: actor.name },
          history: reservation.history,
          message,
        });
        const trace = agentTraceSchema.safeParse(result.trace);
        const proposal = proposedAnyDraftSchema.nullish().safeParse(result.ticketDraft);
        if (!trace.success || !proposal.success) throw new AgentUnavailableError();
        const resolved = proposal.data ? await resolveProposal(actor.id, proposal.data) : null;
        const discarded = resolved && "discarded" in resolved ? resolved.discarded : null;
        const ticketDraft = resolved && "ticketDraft" in resolved ? resolved.ticketDraft : null;
        const quickReplies = quickRepliesSchema.safeParse(result.quickReplies);
        const at = now();
        const stored = await conversations.completeTurn(reservation, {
          content: discarded ? discarded.content : result.content,
          trace: discarded ? withDiscardedDraft(trace.data, discarded.action) : trace.data,
          ticketDraft,
          now: at,
        });
        return {
          conversation: {
            id: reservation.conversationId,
            status: reservation.status,
            messageCount: reservation.messageCount,
            messageLimit: CONVERSATION_MESSAGE_LIMIT,
            remainingMessages: remainingMessages(reservation.messageCount),
          },
          message: toMessageView(stored),
          ticketLookup: result.ticketLookup,
          ticketDraft: ticketDraft && stored.draftId ? toDraftView(ticketDraft, stored.draftId, at) : null,
          quickReplies: !discarded && quickReplies.success ? quickReplies.data : null,
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
      else if (!(await tickets.findOpenTicketByCode(actor.id, draft.ticketCode, now()))) throw new TicketNotOpenError();
      const { message, ticket } = await conversations.confirmDraft(actor.id, draftId, request, now());
      return { message: toMessageView(message), ticket };
    },

    async cancelDraft(actor, draftId) {
      assertEmployee(actor);
      const { message } = await conversations.cancelDraft(actor.id, draftId, now());
      return { message: toMessageView(message) };
    },
  };
}
