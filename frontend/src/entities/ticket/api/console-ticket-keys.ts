import { CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";

/** O código vai em maiúsculas: o backend aceita qualquer caixa. */
export const consoleTicketKeys = {
  all: [...CONSOLE_QUERY_ROOT, "tickets"] as const,
  conversations: () => [...consoleTicketKeys.all, "conversation"] as const,
  byConversation: (id: string) =>
    [...consoleTicketKeys.conversations(), id] as const,
  detail: (code: string) =>
    [...consoleTicketKeys.all, "detail", code.toUpperCase()] as const,
};
