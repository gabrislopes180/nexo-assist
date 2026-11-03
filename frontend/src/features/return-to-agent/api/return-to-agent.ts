import { consoleConversationResponseSchema } from "@/entities/conversation";
import { apiRequest } from "@/shared/api/http-client";

// Sem corpo: o analista vem da sessão. Não é idempotente no backend.
export async function returnToAgent(conversationId: string) {
  const { conversation } = await apiRequest(
    `/console/conversations/${encodeURIComponent(conversationId)}/return`,
    { method: "POST", schema: consoleConversationResponseSchema },
  );
  return conversation;
}
