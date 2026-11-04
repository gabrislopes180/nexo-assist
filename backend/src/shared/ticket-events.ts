/** Um chamado mudou fora de um turno de conversa (ex.: status pelo console), publicado só depois do commit. */
export type TicketChange = {
  ownerId: string;
  ticketCode: string;
  /** Conversa de onde o analista agiu, se houver. */
  conversationId: string | null;
};

/** Nunca lança para quem publica: falha de entrega não desfaz o que já foi gravado. */
export type TicketChangePublisher = { publishTicketChange(change: TicketChange): void };

export const noopTicketChangePublisher: TicketChangePublisher = { publishTicketChange: () => undefined };
