import type { ConversationService, TurnReservation } from "./conversation-service.js";

/** Só para testes: abre um turno que precisa ir ao agent e devolve a reserva. */
export async function startAgentTurn(
  service: ConversationService,
  ownerId: string,
  input: Parameters<ConversationService["startTurn"]>[1],
): Promise<TurnReservation> {
  const start = await service.startTurn(ownerId, input);
  if (start.kind !== "AGENT_TURN") throw new Error(`Esperava turno do agent, veio ${start.kind}`);
  return start.reservation;
}
