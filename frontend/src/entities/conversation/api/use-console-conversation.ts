import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConsoleConversation } from "../model/console-conversation";
import { consoleConversationKeys } from "./console-conversation-keys";
import { getConsoleConversation } from "./console-conversations";

export function useConsoleConversation(id: string | null) {
  const queryClient = useQueryClient();

  return useQuery({
    queryKey: consoleConversationKeys.detail(id ?? ""),
    queryFn: () => getConsoleConversation(id ?? ""),
    enabled: id !== null,
    refetchInterval: 15_000,
    // O cabeçalho aparece na hora, com o item da lista, enquanto o detalhe chega.
    placeholderData: () =>
      queryClient
        .getQueryData<ConsoleConversation[]>(consoleConversationKeys.list())
        ?.find((conversation) => conversation.id === id),
  });
}
