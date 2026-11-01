/** Regras de conversa (módulo puro). O limite é por conversa e conta só mensagens do funcionário. */
export const CONVERSATION_MESSAGE_LIMIT = 30;

export function remainingMessages(messageCount: number): number {
  return Math.max(0, CONVERSATION_MESSAGE_LIMIT - messageCount);
}
