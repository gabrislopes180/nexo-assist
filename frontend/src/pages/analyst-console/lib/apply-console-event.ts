import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import {
  consoleConversationSchema,
  upsertConsoleConversation,
} from "@/entities/conversation";
import { appendConsoleMessage, timelineMessageSchema } from "@/entities/message";
import { CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";

const syncSchema = z.object({ mode: z.enum(["REPLAY", "RESYNC"]) });
const messageCreatedSchema = z.object({
  conversationId: z.string().min(1),
  message: timelineMessageSchema,
});
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
      const parsed = syncSchema.safeParse(data);
      // RESYNC: o servidor não tem como repor o que se perdeu. Também no primeiro sync.
      if (parsed.success && parsed.data.mode === "RESYNC") {
        void qc.invalidateQueries({ queryKey: CONSOLE_QUERY_ROOT });
      }
      return;
    }
    case "message.created": {
      const parsed = messageCreatedSchema.safeParse(data);
      if (parsed.success) {
        appendConsoleMessage(qc, parsed.data.conversationId, parsed.data.message);
      }
      return;
    }
    case "conversation.updated": {
      const parsed = conversationUpdatedSchema.safeParse(data);
      if (parsed.success) upsertConsoleConversation(qc, parsed.data.conversation);
      return;
    }
    case "tickets.changed":
      void qc.invalidateQueries({ queryKey: [...CONSOLE_QUERY_ROOT, "tickets"] });
      return;
  }
}
