import { useMutation, useQueryClient } from "@tanstack/react-query";
import { consoleConversationKeys } from "@/entities/conversation";
import { SESSION_QUERY_KEY, useAuthenticatedUser } from "@/entities/session";
import { ApiError } from "@/shared/api/api-error";
import { CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";
import { returnToAgent } from "./return-to-agent";

export function useReturnToAgent() {
  const queryClient = useQueryClient();
  const { id, name } = useAuthenticatedUser();

  return useMutation({
    mutationFn: (conversationId: string) =>
      returnToAgent({ conversationId, viewer: { id, name } }),
    networkMode: "always",
    onSuccess: (conversation) => {
      queryClient.setQueryData(
        consoleConversationKeys.detail(conversation.id),
        conversation,
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: CONSOLE_QUERY_ROOT });
    },
  });
}
