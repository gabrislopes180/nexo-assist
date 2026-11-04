import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  consoleConversationSchema,
  upsertConsoleConversation,
} from "@/entities/conversation";
import {
  appendConsoleMessage,
  messageCreatedEventSchema,
} from "@/entities/message";
import { consoleTicketKeys } from "@/entities/ticket";
import { CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";
import { isResync } from "@/shared/api/stream-sync";

const conversationUpdatedSchema = z.object({
  conversation: consoleConversationSchema,
});

/** Os eventos do stream do analista; `session.expired` fica com o hook. */
export const CONSOLE_EVENT_TYPES = [
  "sync",
  "message.created",
  "conversation.updated",
  "tickets.changed",
] as const;

/** Aplica um evento do SSE no cache do TanStack Query. Fora do schema, ignora. */
export function applyConsoleEvent(
  qc: QueryClient,
  type: string,
  data: unknown,
): void {
  switch (type) {
    case "sync": {
      // RESYNC: o servidor não tem como repor o que se perdeu. Vale também no
      // primeiro sync: o GET inicial sai antes da inscrição no servidor (que só
      // acontece depois de validar a sessão), e um evento entre a leitura dele e
      // a inscrição se perderia. Reabrir o stream no mesmo componente pede
      // REPLAY (use-event-stream) e não cai aqui.
      if (isResync(data)) {
        void qc.invalidateQueries({ queryKey: CONSOLE_QUERY_ROOT });
      }
      return;
    }
    case "message.created": {
      const parsed = messageCreatedEventSchema.safeParse(data);
      if (parsed.success) {
        appendConsoleMessage(
          qc,
          parsed.data.conversationId,
          parsed.data.message,
        );
      }
      return;
    }
    case "conversation.updated": {
      const parsed = conversationUpdatedSchema.safeParse(data);
      if (parsed.success)
        upsertConsoleConversation(qc, parsed.data.conversation);
      return;
    }
    case "tickets.changed":
      // Sem ler o payload: `conversationId` pode vir null e o prefixo cobre a
      // lista de cada conversa e o detalhe aberto. Os dados ficam na tela no refetch.
      void qc.invalidateQueries({ queryKey: consoleTicketKeys.all });
      return;
  }
}
