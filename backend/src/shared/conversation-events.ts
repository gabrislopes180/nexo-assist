import type { TimelineMessage } from "../conversations/timeline.js";

/** O que uma transação de conversa mudou, publicado só depois do commit. */
export type ConversationChange = {
  conversationId: string;
  ownerId: string;
  /** Mensagens criadas pela transação, em ordem. */
  messages: TimelineMessage[];
  /** Chamados do dono mudaram (confirmação de rascunho): o painel do console fica desatualizado. */
  ticketsChanged: boolean;
  /** Chamado que mudou, quando se sabe qual (vai no tickets.changed). */
  ticketCode?: string;
};

/** Nunca lança para quem publica: falha de entrega não desfaz o que já foi gravado. */
export type ChangePublisher = { publish(change: ConversationChange): void };

export const noopPublisher: ChangePublisher = { publish: () => undefined };
