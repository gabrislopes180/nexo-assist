import { useQuery } from "@tanstack/react-query";
import { consoleRequest } from "@/shared/api/console-request";
import { CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";
import { conversationTicketsResponseSchema } from "../model/console-ticket";

export const conversationTicketsKey = (id: string) =>
  [...CONSOLE_QUERY_ROOT, "tickets", id] as const;

export function getConversationTickets(id: string) {
  return consoleRequest(
    `/console/conversations/${encodeURIComponent(id)}/tickets`,
    { schema: conversationTicketsResponseSchema },
  );
}

export function useConversationTickets(id: string) {
  return useQuery({
    queryKey: conversationTicketsKey(id),
    queryFn: () => getConversationTickets(id),
  });
}
