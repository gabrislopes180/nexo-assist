import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  consoleActionFailure,
  consoleConversationKeys,
  upsertConsoleConversation,
} from "@/entities/conversation";
import { consoleMessagesKey } from "@/entities/message";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { ApiError } from "@/shared/api/api-error";
import { takeoverConversation } from "./takeover-conversation";

export function useTakeoverConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: takeoverConversation,
    // Offline, o padrão pausaria sem erro e mandaria a ação depois, sozinha.
    networkMode: "always",
    onSuccess: (conversation) => {
      upsertConsoleConversation(queryClient, conversation);
    },
    onError: (error, conversationId) => {
      if (error instanceof ApiError && error.status === 401) {
        void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      }
      if (consoleActionFailure(error, "takeover").stale) {
        void queryClient.invalidateQueries({
          queryKey: consoleConversationKeys.all,
        });
        void queryClient.invalidateQueries({
          queryKey: consoleMessagesKey(conversationId),
        });
      }
    },
  });
}
