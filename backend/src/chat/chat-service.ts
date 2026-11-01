import { CONVERSATION_MESSAGE_LIMIT, remainingMessages } from "../conversations/conversation-rules.js";
import type { ConversationService, TurnReservation } from "../conversations/conversation-service.js";
import type { ChatRequest, ChatResponse } from "../shared/chat.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import type { SessionUser } from "../shared/session.js";
import { agentTraceSchema } from "../shared/transparency.js";
import { AgentUnavailableError, type AgentRunner } from "./agent-runner.js";

export class EmployeeOnlyError extends Error {
  constructor() {
    super("Chat disponível só para funcionários");
    this.name = "EmployeeOnlyError";
  }
}

export type ChatService = {
  sendMessage(actor: SessionUser, request: ChatRequest): Promise<ChatResponse>;
};

type ChatServiceDeps = {
  conversations: ConversationService;
  agentRunner: AgentRunner;
  now?: () => Date;
};

export function createChatService({ conversations, agentRunner, now = () => new Date() }: ChatServiceDeps): ChatService {
  /** Falha aqui não pode esconder o erro do turno. */
  async function abort(reservation: TurnReservation): Promise<void> {
    try {
      await conversations.abortTurn(reservation);
    } catch (error) {
      console.error("Falha ao desfazer o turno:", describeErrorForLog(error));
    }
  }

  return {
    async sendMessage(actor, { message, conversationId }) {
      if (actor.role !== "EMPLOYEE") throw new EmployeeOnlyError();

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
        if (!trace.success) throw new AgentUnavailableError();
        const stored = await conversations.completeTurn(reservation, { content: result.content, trace: trace.data, now: now() });
        return {
          conversation: {
            id: reservation.conversationId,
            status: reservation.status,
            messageCount: reservation.messageCount,
            messageLimit: CONVERSATION_MESSAGE_LIMIT,
            remainingMessages: remainingMessages(reservation.messageCount),
          },
          message: {
            id: stored.id,
            authorType: "AGENT",
            content: stored.content,
            trace: stored.trace,
            createdAt: stored.createdAt.toISOString(),
          },
          ticketLookup: result.ticketLookup,
        };
      } catch (error) {
        await abort(reservation);
        throw error;
      }
    },
  };
}
