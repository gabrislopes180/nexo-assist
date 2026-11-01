import { apiRequest } from "@/shared/api/http-client";
import { chatResponseSchema } from "../model/chat-schema";

// Acima dos 120 s do agent (AGENT_TIMEOUT_MS), abaixo dos 130 s do proxy do Next.
const CHAT_TIMEOUT_MS = 125_000;

export interface SendChatMessageInput {
  message: string;
  conversationId?: string;
}

export function sendChatMessage({
  message,
  conversationId,
}: SendChatMessageInput) {
  return apiRequest("/chat", {
    method: "POST",
    body: conversationId ? { message, conversationId } : { message },
    schema: chatResponseSchema,
    timeoutMs: CHAT_TIMEOUT_MS,
  });
}
