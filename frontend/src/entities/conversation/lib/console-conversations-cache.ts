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
 * A conversa em cache é mais nova que a que chegou? O contrato não tem versão;
 * `lastMessageAt` é o melhor marcador: toda mudança publicada (transferência,
 * assumir, devolver, encerrar, resposta, rascunho, turno do agent) grava
 * `lastMessageAt = agora` na mesma transação. Só o desfazer de um turno com
 * falha o faz voltar, e esse não publica nada. No mesmo instante, a que chega
 * vence: é a mesma mudança ou uma sem efeito na ordem.
 */
function isStale(
  cached: ConsoleConversation | undefined,
  incoming: ConsoleConversation,
) {
  return (
    cached !== undefined &&
    Date.parse(cached.lastMessageAt) > Date.parse(incoming.lastMessageAt)
  );
}

/**
 * Aplica uma conversa (SSE ou resposta de ação) na lista e no detalhe em cache.
 * Conversa nova entra na lista; sem lista ou detalhe em cache, nada é criado.
 * Uma resposta lenta não desfaz um `conversation.updated` mais novo: lista e
 * detalhe ignoram a conversa mais velha que a que já têm.
 */
export function upsertConsoleConversation(
  qc: QueryClient,
  conversation: ConsoleConversation,
) {
  const listKey = consoleConversationKeys.list();
  const list = qc.getQueryData<ConsoleConversation[]>(listKey);
  const cached = list?.find((item) => item.id === conversation.id);
  if (!isStale(cached, conversation)) {
    qc.setQueryData<ConsoleConversation[]>(listKey, (current) => {
      if (!current) return current;
      return cached
        ? current.map((item) => (item.id === conversation.id ? conversation : item))
        : [...current, conversation];
    });
    // Sem lista ainda, a primeira busca em voo pode ser anterior ao evento.
    invalidateIfFetching(qc, listKey);
  }

  const detailKey = consoleConversationKeys.detail(conversation.id);
  const detail = qc.getQueryData<ConsoleConversation>(detailKey);
  if (!isStale(detail, conversation)) {
    if (detail !== undefined) qc.setQueryData(detailKey, conversation);
    invalidateIfFetching(qc, detailKey);
  }
}
