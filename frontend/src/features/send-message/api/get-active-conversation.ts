import { queryOptions } from "@tanstack/react-query";
import { apiRequest } from "@/shared/api/http-client";
import { CHAT_QUERY_ROOT } from "@/shared/api/query-keys";
import { activeChatConversationSchema } from "../model/chat-schema";

export const activeConversationKey = (userId: string) => [...CHAT_QUERY_ROOT, userId, "active"] as const;

export function activeConversationOptions(userId: string) {
  return queryOptions({
    queryKey: activeConversationKey(userId),
    queryFn: ({ signal }) => apiRequest("/chat/conversations/active", { schema: activeChatConversationSchema, signal }),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    networkMode: "always",
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
