import type { QueryClient } from "@tanstack/react-query";
import { consoleMessagesKey } from "../api/use-console-messages";
import type { TimelineMessage } from "../model/timeline-message";

/**
 * Anexa uma mensagem (SSE ou resposta do envio) às mensagens em cache da
 * conversa, sem duplicar pelo id. Conversa sem cache fica para o próximo GET.
 */
export function appendConsoleMessage(
  qc: QueryClient,
  conversationId: string,
  message: TimelineMessage,
) {
  const queryKey = consoleMessagesKey(conversationId);
  qc.setQueryData<TimelineMessage[]>(queryKey, (messages) => {
    if (!messages || messages.some((item) => item.id === message.id)) {
      return messages;
    }
    // sort é estável: mesmo instante mantém a ordem de chegada.
    return [...messages, message].sort(
      (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
    );
  });

  if (qc.isFetching({ queryKey, exact: true }) > 0) {
    void qc.invalidateQueries({ queryKey, exact: true });
  }
}
