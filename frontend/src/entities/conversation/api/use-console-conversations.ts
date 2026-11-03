import { useQuery } from "@tanstack/react-query";
import { consoleConversationKeys } from "./console-conversation-keys";
import { getConsoleConversations } from "./console-conversations";

// Atualizada pelo SSE do console; refetch no foco e polling de reserva com o stream caído.
export function useConsoleConversations() {
  return useQuery({
    queryKey: consoleConversationKeys.list(),
    queryFn: getConsoleConversations,
  });
}
