import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { consoleConversationKeys } from "../api/console-conversation-keys";
import type { ConsoleConversation } from "../model/console-conversation";

/** Uma busca em voo sobrescreveria o que acabou de chegar: refaz depois dela. */
export function invalidateIfFetching(qc: QueryClient, queryKey: QueryKey) {
  if (qc.isFetching({ queryKey, exact: true }) > 0) {
    void qc.invalidateQueries({ queryKey, exact: true });
  }
}

/**
 * Aplica uma conversa (SSE ou resposta de ação) na lista e no detalhe em cache.
 * Conversa nova entra na lista; sem lista ou detalhe em cache, nada é criado.
 */
export function upsertConsoleConversation(
  qc: QueryClient,
  conversation: ConsoleConversation,
) {
  const listKey = consoleConversationKeys.list();
  qc.setQueryData<ConsoleConversation[]>(listKey, (list) => {
    if (!list) return list;
    const found = list.some((item) => item.id === conversation.id);
    return found
      ? list.map((item) => (item.id === conversation.id ? conversation : item))
      : [...list, conversation];
  });

  const detailKey = consoleConversationKeys.detail(conversation.id);
  if (qc.getQueryData(detailKey) !== undefined) {
    qc.setQueryData(detailKey, conversation);
  }

  invalidateIfFetching(qc, listKey);
  invalidateIfFetching(qc, detailKey);
}
