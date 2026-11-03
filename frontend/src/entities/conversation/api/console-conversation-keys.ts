import { CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";

export const consoleConversationKeys = {
  all: [...CONSOLE_QUERY_ROOT, "conversations"] as const,
  list: () => [...consoleConversationKeys.all, "list"] as const,
  detail: (id: string) =>
    [...consoleConversationKeys.all, "detail", id] as const,
};
