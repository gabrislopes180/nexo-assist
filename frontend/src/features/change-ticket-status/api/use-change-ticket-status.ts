import { useMutation, useQueryClient } from "@tanstack/react-query";
import { applyTicketDetail, consoleTicketKeys } from "@/entities/ticket";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { statusChangeFailure } from "../lib/status-change-failure";
import { changeTicketStatus } from "./change-ticket-status";

export function useChangeTicketStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: changeTicketStatus,
    // Offline, o padrão pausaria sem erro e mandaria a mudança depois, sozinha.
    networkMode: "always",
    // Vale também para changed:false: o detalhe da resposta é o estado atual.
    onSuccess: ({ ticket }) => {
      applyTicketDetail(queryClient, ticket);
    },
    onError: (error, { code }) => {
      const failure = statusChangeFailure(error);
      if (failure.sessionExpired) {
        void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      }
      if (failure.stale) {
        void queryClient.invalidateQueries({
          queryKey: consoleTicketKeys.detail(code),
        });
        void queryClient.invalidateQueries({
          queryKey: consoleTicketKeys.conversations(),
        });
      }
    },
  });
}
