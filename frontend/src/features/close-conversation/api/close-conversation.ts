import { consoleConversationResponseSchema } from "@/entities/conversation";
import { apiRequest } from "@/shared/api/http-client";

// Sem corpo: o analista vem da sessão. Repetir pelo mesmo analista é idempotente.
export async function closeConversation(conversationId: string) {
  const { conversation } = await apiRequest(
    `/console/conversations/${encodeURIComponent(conversationId)}/close`,
    { method: "POST", schema: consoleConversationResponseSchema },
  );
  return conversation;
}
