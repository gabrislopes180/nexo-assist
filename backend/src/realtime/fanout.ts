import type { ConsoleRow } from "../conversations/conversation-queries.js";
import type { ChangePublisher, ConversationChange } from "../shared/conversation-events.js";
import { describeErrorForLog } from "../shared/safe-error.js";
import type { EventBus } from "./event-bus.js";

export type Fanout = ChangePublisher & {
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

  async function process({ conversationId, ownerId, messages, ticketsChanged }: ConversationChange): Promise<void> {
    for (const message of messages) bus.push({ type: "message.created", ownerId, conversationId, data: message });
    try {
      bus.push({ type: "conversation.updated", ownerId, conversationId, data: await readConversation(conversationId) });
    } catch (error) {
      console.error("Falha ao reler a conversa para o tempo real:", describeErrorForLog(error));
    }
    if (ticketsChanged) bus.push({ type: "tickets.changed", ownerId, conversationId, data: null });
  }

  return {
    publish(change) {
      chain = chain.then(() => process(change)).catch((error: unknown) => {
        console.error("Falha no fan-out do tempo real:", describeErrorForLog(error));
      });
    },
    idle: () => chain,
  };
}
