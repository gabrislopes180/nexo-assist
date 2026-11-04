import type { ConsoleRow } from "../conversations/conversation-queries.js";
import type { ChangePublisher, ConversationChange } from "../shared/conversation-events.js";
import type { TicketChangePublisher } from "../shared/ticket-events.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import type { EventBus } from "./event-bus.js";

export type Fanout = ChangePublisher &
  TicketChangePublisher & {
  /** Resolve quando todas as mudanças recebidas até agora foram processadas (testes e desligamento). */
  idle(): Promise<void>;
};

type FanoutDeps = {
  bus: EventBus;
  /** A conversa relida depois do commit; a view por público sai na hora de escrever para cada assinante. */
  readConversation(conversationId: string): Promise<ConsoleRow>;
};

/**
 * Transforma cada mudança em eventos do barramento, uma de cada vez (cadeia de promises), para
 * manter a ordem entre mudanças. Se a releitura falhar, as mensagens saem mesmo assim: a lista
 * se corrige no próximo evento ou na ressincronização do cliente.
 */
export function createFanout({ bus, readConversation }: FanoutDeps): Fanout {
  let chain: Promise<void> = Promise.resolve();

  async function process({ conversationId, ownerId, messages, ticketsChanged, ticketCode }: ConversationChange): Promise<void> {
    for (const message of messages) bus.push({ type: "message.created", ownerId, conversationId, data: message });
    try {
      bus.push({ type: "conversation.updated", ownerId, conversationId, data: await readConversation(conversationId) });
    } catch (error) {
      console.error("Falha ao reler a conversa para o tempo real:", describeErrorForLog(error));
    }
    if (ticketsChanged) bus.push({ type: "tickets.changed", ownerId, conversationId, ticketCode: ticketCode ?? null, data: null });
  }

  function enqueue(task: () => void | Promise<void>): void {
    chain = chain.then(task).catch((error: unknown) => {
      console.error("Falha no fan-out do tempo real:", describeErrorForLog(error));
    });
  }

  return {
    publish(change) {
      enqueue(() => process(change));
    },
    /** Mesma cadeia das conversas: o tickets.changed não passa à frente de uma mudança anterior. */
    publishTicketChange({ ownerId, ticketCode, conversationId }) {
      enqueue(() => {
        bus.push({ type: "tickets.changed", ownerId, conversationId, ticketCode, data: null });
      });
    },
    idle: () => chain,
  };
}
