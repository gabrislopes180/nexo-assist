import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  type ActionDispatch,
  type RefObject,
} from "react";
import { z } from "zod";
import {
  conversationSchema,
  type ConversationStatus,
} from "@/entities/conversation";
import { messageCreatedEventSchema } from "@/entities/message";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { ApiError } from "@/shared/api/api-error";
import { isResync } from "@/shared/api/stream-sync";
import { useEventStream } from "@/shared/lib/hooks/use-event-stream";
import type { ChatEvent } from "../model/chat-reducer";
import { getChatConversation } from "./get-conversation";
import { createChatResync } from "../lib/chat-resync";

/** Reserva com o stream caído, enquanto um analista cuida da conversa. */
const FALLBACK_POLL_MS = 7_500;
const LOST_LOCK = { message: "Esta conversa não está mais disponível." };

const conversationUpdatedSchema = z.object({
  conversation: conversationSchema,
});

interface UseChatStreamOptions {
  conversationId: string | undefined;
  status: ConversationStatus | null;
  dispatch: ActionDispatch<[event: ChatEvent]>;
  /** Muda ao trocar de conversa: respostas atrasadas da anterior são descartadas. */
  generationRef: RefObject<number>;
  busy: boolean;
}

/**
 * Tempo real do chat do funcionário: despacha os eventos do SSE no reducer e
 * ressincroniza com `GET /chat/conversations/:id` quando o servidor pede (RESYNC)
 * ou quando o stream está caído. Só com conversa ativa e não encerrada.
 */
export function useChatStream({
  conversationId,
  status,
  dispatch,
  generationRef,
  busy,
}: UseChatStreamOptions) {
  const queryClient = useQueryClient();
  const conversationIdRef = useRef(conversationId);
  const liveRef = useRef(false);
  const busyRef = useRef(busy);
  const syncRef = useRef<ReturnType<typeof createChatResync> | null>(null);

  useLayoutEffect(() => {
    conversationIdRef.current = conversationId;
    busyRef.current = busy;
  }, [conversationId, busy]);

  const expireSession = () => {
    void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };

  useLayoutEffect(() => {
    syncRef.current = createChatResync({
      read: getChatConversation,
      current: () => ({ conversationId: conversationIdRef.current, generation: generationRef.current, busy: busyRef.current }),
      onSnapshot: (snapshot) => dispatch({ type: "resynced", ...snapshot }),
      onError: (error) => {
        if (!(error instanceof ApiError)) return;
        if (error.status === 404) dispatch({ type: "conversationLost", lock: LOST_LOCK });
        else if (error.status === 401 || error.status === 403) {
          void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
        }
      },
    });
    return () => { syncRef.current = null; };
  }, [dispatch, generationRef, queryClient]);
  const resync = (target?: string) => syncRef.current?.run(target);
  const invalidate = () => syncRef.current?.invalidate();

  const streamStatus = useEventStream({
    url: "/api/chat/events",
    enabled: conversationId !== undefined && status !== "CLOSED",
    scopeKey: conversationId,
    events: {
      sync: (data) => {
        // Também no primeiro sync: o stream só abre depois do POST que criou a
        // conversa, então a resposta dele é sempre anterior à inscrição.
        if (isResync(data)) resync();
      },
      "message.created": (data) => {
        const parsed = messageCreatedEventSchema.safeParse(data);
        if (parsed.success && parsed.data.conversationId === conversationIdRef.current) {
          invalidate();
          dispatch({ type: "streamMessage", ...parsed.data });
          // Outra aba pode ter criado/consumido uma proposta; só o snapshot a autoriza.
          if (parsed.data.message.authorType === "AGENT") resync();
        }
      },
      "conversation.updated": (data) => {
        const parsed = conversationUpdatedSchema.safeParse(data);
        if (parsed.success && parsed.data.conversation.id === conversationIdRef.current) {
          invalidate();
          dispatch({ type: "conversationUpdated", ...parsed.data });
        }
      },
      "session.expired": expireSession,
    },
    onClosedByServer: expireSession,
  });

  useEffect(() => {
    liveRef.current = streamStatus === "live";
  }, [streamStatus]);

  const withAnalyst = status === "WAITING_ANALYST" || status === "WITH_ANALYST";
  const poll = useEffectEvent(() => resync());
  const resume = useEffectEvent(() => syncRef.current?.resume());
  useEffect(() => {
    if (!busy) resume();
  }, [busy, conversationId]);
  useEffect(() => {
    if (streamStatus !== "down" || !withAnalyst) return;
    const timer = setInterval(() => poll(), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [streamStatus, withAnalyst]);

  return {
    resync,
    invalidate,
    /** Lido na hora: o stream pode ter mudado desde o render. */
    isLive: () => liveRef.current,
  };
}
