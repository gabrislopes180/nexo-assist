import { CONVERSATION_MESSAGE_LIMIT, remainingMessages } from "../conversations/conversation-rules.js";
import type { ConversationService, StoredAgentMessage, TurnReservation } from "../conversations/conversation-service.js";
import { TicketNotOpenError } from "../conversations/ticket-draft.js";
import {
  proposedTicketDraftSchema,
  type CancelDraftResponse,
  type ChatMessageView,
  type ChatRequest,
  type ChatResponse,
  type ConfirmDraftRequest,
  type ConfirmDraftResponse,
  type ProposedTicketDraft,
} from "../shared/chat.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import type { SessionUser } from "../shared/session.js";
import { agentTraceSchema } from "../shared/transparency.js";
import { TicketServiceUnavailableError, type TicketCodeReader } from "../tickets/ticket-service.js";
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
  tickets: TicketCodeReader;
  now?: () => Date;
};

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
   * A proposta só define o que complementar: o chamado mostrado e gravado vem do serviço, com
   * escopo de dono. Sem como validar, descarta a proposta em vez de derrubar o turno.
   */
  async function verifiedDraft(ownerId: string, proposal: ProposedTicketDraft): Promise<ProposedTicketDraft | null> {
    try {
      const ticket = await tickets.findOpenTicketByCode(ownerId, proposal.ticket.code, now());
      return ticket && { ...proposal, ticket };
    } catch (error) {
      if (error instanceof TicketServiceUnavailableError) return null;
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
        const proposal = proposedTicketDraftSchema.nullish().safeParse(result.ticketDraft);
        if (!trace.success || !proposal.success) throw new AgentUnavailableError();
        const ticketDraft = proposal.data ? await verifiedDraft(actor.id, proposal.data) : null;
        const stored = await conversations.completeTurn(reservation, { content: result.content, trace: trace.data, ticketDraft, now: now() });
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
          ticketDraft: ticketDraft && stored.draftId ? { id: stored.draftId, ...ticketDraft } : null,
        };
      } catch (error) {
        await abort(reservation);
        throw error;
      }
    },

    /** Sem LLM e sem consumir cota. A checagem pelo serviço trata a indisponibilidade; a da transação decide. */
    async confirmDraft(actor, draftId, { content }) {
      assertEmployee(actor);
      const draft = await conversations.readDraft(actor.id, draftId);
      if (!(await tickets.findOpenTicketByCode(actor.id, draft.ticketCode, now()))) throw new TicketNotOpenError();
      const { message, ticket } = await conversations.confirmDraft(actor.id, draftId, content, now());
      return { message: toMessageView(message), ticket };
    },

    async cancelDraft(actor, draftId) {
      assertEmployee(actor);
      const { message } = await conversations.cancelDraft(actor.id, draftId, now());
      return { message: toMessageView(message) };
    },
  };
}
