import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { consoleConversationKeys } from "@/entities/conversation";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";
import { useEventStream } from "@/shared/lib/hooks/use-event-stream";
import {
  applyConsoleEvent,
  CONSOLE_EVENT_TYPES,
} from "../lib/apply-console-event";

/** Reserva com o stream caído: a lista e as mensagens abertas voltam a ser buscadas. */
const FALLBACK_POLL_MS = 10_000;

/**
 * Tempo real do console: aplica os eventos do SSE no cache. Só para quem passou
 * pelo `SessionGate requiredRole="ANALYST"`; o stream fecha ao sair da rota.
 */
export function useConsoleLiveUpdates() {
  const queryClient = useQueryClient();

  const expireSession = () => {
    // O stream fechado pode ser sessão vencida: o gate decide com a sessão nova.
    void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };

  const status = useEventStream({
    url: "/api/console/events",
    enabled: true,
    events: {
      ...Object.fromEntries(
        CONSOLE_EVENT_TYPES.map((type) => [
          type,
          (data: unknown) => applyConsoleEvent(queryClient, type, data),
        ]),
      ),
      "session.expired": expireSession,
    },
    onClosedByServer: expireSession,
  });

  useEffect(() => {
    if (status !== "down") return;
    const timer = setInterval(() => {
      void queryClient.invalidateQueries({
        queryKey: consoleConversationKeys.all,
      });
      void queryClient.invalidateQueries({
        queryKey: [...CONSOLE_QUERY_ROOT, "messages"],
      });
    }, FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [status, queryClient]);
}
