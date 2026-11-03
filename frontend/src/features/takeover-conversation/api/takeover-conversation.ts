import { consoleConversationResponseSchema } from "@/entities/conversation";
import { apiRequest } from "@/shared/api/http-client";

// Sem corpo: o analista vem da sessão.
export async function takeoverConversation(conversationId: string) {
  const { conversation } = await apiRequest(
    `/console/conversations/${encodeURIComponent(conversationId)}/takeover`,
    { method: "POST", schema: consoleConversationResponseSchema },
  );
  return conversation;
}
