import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/shared/api/http-client";
import { conversationTicketsResponseSchema } from "../model/console-ticket";
import { consoleTicketKeys } from "./console-ticket-keys";

export function getConversationTickets(id: string) {
  return apiRequest(
    `/console/conversations/${encodeURIComponent(id)}/tickets`,
    { schema: conversationTicketsResponseSchema },
  );
}

export function useConversationTickets(id: string) {
  return useQuery({
    queryKey: consoleTicketKeys.byConversation(id),
    queryFn: () => getConversationTickets(id),
  });
}
