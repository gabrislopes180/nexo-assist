import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/shared/api/http-client";
import { CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";
import { consoleMessagesResponseSchema } from "../model/console-message";

export const consoleMessagesKey = (id: string) =>
  [...CONSOLE_QUERY_ROOT, "messages", id] as const;

export async function getConsoleMessages(id: string) {
  const { messages } = await apiRequest(
    `/console/conversations/${encodeURIComponent(id)}/messages`,
    { schema: consoleMessagesResponseSchema },
  );
  return messages;
}

export function useConsoleMessages(id: string) {
  return useQuery({
    queryKey: consoleMessagesKey(id),
    queryFn: () => getConsoleMessages(id),
  });
}
