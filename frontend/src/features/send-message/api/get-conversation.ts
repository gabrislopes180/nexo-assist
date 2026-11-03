import { apiRequest } from "@/shared/api/http-client";
import { chatConversationDetailSchema } from "../model/chat-schema";

/** Conversa do funcionário com todas as mensagens: ressincronização e reserva do SSE. */
export function getChatConversation(conversationId: string) {
  return apiRequest(
    `/chat/conversations/${encodeURIComponent(conversationId)}`,
    { schema: chatConversationDetailSchema },
  );
}
