import { z } from "zod";
import { consoleConversationSchema } from "@/entities/conversation";
import { timelineMessageSchema } from "@/entities/message";
import { apiRequest } from "@/shared/api/http-client";

const replyResponseSchema = z.object({
  message: timelineMessageSchema,
  conversation: consoleConversationSchema,
});

export interface ReplyInput {
  conversationId: string;
  /** Já validado pela regra de `shared/lib/message-text`. */
  content: string;
}

export function replyToConversation({ conversationId, content }: ReplyInput) {
  return apiRequest(
    `/console/conversations/${encodeURIComponent(conversationId)}/messages`,
    { method: "POST", body: { content }, schema: replyResponseSchema },
  );
}
