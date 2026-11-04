import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/shared/api/http-client";
import { consoleTicketDetailResponseSchema } from "../model/console-ticket-detail";
import { consoleTicketKeys } from "./console-ticket-keys";

export async function getConsoleTicket(code: string) {
  const { ticket } = await apiRequest(
    `/console/tickets/${encodeURIComponent(code)}`,
    { schema: consoleTicketDetailResponseSchema },
  );
  return ticket;
}

/** 401/403/404 não repetem: o padrão do QueryClient já corta os 4xx. */
export function useConsoleTicket(code: string | null) {
  return useQuery({
    queryKey: consoleTicketKeys.detail(code ?? ""),
    queryFn: () => getConsoleTicket(code ?? ""),
    enabled: code !== null,
  });
}
