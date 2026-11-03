import { consoleConversationResponseSchema } from "@/entities/conversation";
import { consoleRequest } from "@/shared/api/console-request";

export interface ConsoleActionInput {
  conversationId: string;
  viewer: { id: string; name: string };
}

// Sem corpo: no backend real, o analista vem da sessão.
export async function takeoverConversation({ conversationId, viewer }: ConsoleActionInput) {
  const { conversation } = await consoleRequest(
    `/console/conversations/${encodeURIComponent(conversationId)}/takeover`,
    {
      method: "POST",
      schema: consoleConversationResponseSchema,
      mockContext: { viewer },
    },
  );
  return conversation;
}
