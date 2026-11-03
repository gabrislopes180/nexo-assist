import { apiRequest } from "@/shared/api/http-client";
import {
  consoleConversationListResponseSchema,
  consoleConversationResponseSchema,
} from "../model/console-conversation";

export async function getConsoleConversations() {
  const { conversations } = await apiRequest("/console/conversations", {
    schema: consoleConversationListResponseSchema,
  });
  return conversations;
}

export async function getConsoleConversation(id: string) {
  const { conversation } = await apiRequest(
    `/console/conversations/${encodeURIComponent(id)}`,
    { schema: consoleConversationResponseSchema },
  );
  return conversation;
}
