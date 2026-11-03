import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  consoleActionFailure,
  consoleConversationKeys,
  upsertConsoleConversation,
} from "@/entities/conversation";
import { appendConsoleMessage, consoleMessagesKey } from "@/entities/message";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { ApiError } from "@/shared/api/api-error";
import { replyToConversation } from "./reply-to-conversation";

/** Sem otimismo: a mensagem entra pela resposta, e o SSE deduplica pelo id. */
export function useReplyToConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: replyToConversation,
    networkMode: "always",
    onSuccess: ({ message, conversation }) => {
      appendConsoleMessage(queryClient, conversation.id, message);
      upsertConsoleConversation(queryClient, conversation);
    },
    onError: (error, { conversationId }) => {
      if (error instanceof ApiError && error.status === 401) {
        void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      }
      if (consoleActionFailure(error, "reply").stale) {
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
