import { consoleRequest } from "@/shared/api/console-request";
import {
  consoleConversationListResponseSchema,
  consoleConversationResponseSchema,
} from "../model/console-conversation";

export async function getConsoleConversations() {
  const { conversations } = await consoleRequest("/console/conversations", {
    schema: consoleConversationListResponseSchema,
  });
  return conversations;
}

export async function getConsoleConversation(id: string) {
  const { conversation } = await consoleRequest(
    `/console/conversations/${encodeURIComponent(id)}`,
    { schema: consoleConversationResponseSchema },
  );
  return conversation;
}
