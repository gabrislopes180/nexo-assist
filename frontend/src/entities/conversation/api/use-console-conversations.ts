import { useQuery } from "@tanstack/react-query";
import { consoleConversationKeys } from "./console-conversation-keys";
import { getConsoleConversations } from "./console-conversations";

// Sem tempo real nesta fase: polling de 15 s, mais o refetch no foco.
export function useConsoleConversations() {
  return useQuery({
    queryKey: consoleConversationKeys.list(),
    queryFn: getConsoleConversations,
    refetchInterval: 15_000,
  });
}
