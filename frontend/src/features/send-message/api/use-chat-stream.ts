import { useQueryClient } from "@tanstack/react-query";
import {
  useEffect,
  useEffectEvent,
  useRef,
  type ActionDispatch,
  type RefObject,
} from "react";
import { z } from "zod";
import {
  conversationSchema,
  type ConversationStatus,
} from "@/entities/conversation";
import { timelineMessageSchema } from "@/entities/message";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { ApiError } from "@/shared/api/api-error";
import { useEventStream } from "@/shared/lib/hooks/use-event-stream";
import type { ChatEvent } from "../model/chat-reducer";
import { getChatConversation } from "./get-conversation";

/** Reserva com o stream caído, enquanto um analista cuida da conversa. */
const FALLBACK_POLL_MS = 7_500;
const LOST_LOCK = { message: "Esta conversa não está mais disponível." };

const syncSchema = z.object({ mode: z.enum(["REPLAY", "RESYNC"]) });
const messageCreatedSchema = z.object({
  conversationId: z.string().min(1),
  message: timelineMessageSchema,
});
const conversationUpdatedSchema = z.object({
  conversation: conversationSchema,
});

interface UseChatStreamOptions {
  conversationId: string | undefined;
  status: ConversationStatus | null;
  dispatch: ActionDispatch<[event: ChatEvent]>;
  /** Muda ao trocar de conversa: respostas atrasadas da anterior são descartadas. */
  generationRef: RefObject<number>;
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
}: UseChatStreamOptions) {
  const queryClient = useQueryClient();
  const conversationIdRef = useRef(conversationId);
  const inFlightRef = useRef(false);
  const queuedRef = useRef<string | null>(null);
  const liveRef = useRef(false);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const expireSession = () => {
    void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  };

  // Uma busca por vez; o pedido que chega no meio roda logo depois dela.
  const resync = (target = conversationIdRef.current) => {
    if (target === undefined) return;
    if (inFlightRef.current) {
      queuedRef.current = target;
      return;
    }
    inFlightRef.current = true;
    const generation = generationRef.current;

    getChatConversation(target)
      .then(
        ({ conversation, messages }) => {
          if (generation !== generationRef.current) return;
          dispatch({ type: "resynced", conversation, messages });
        },
        (error: unknown) => {
          if (generation !== generationRef.current) return;
          if (!(error instanceof ApiError)) return;
          if (error.status === 404) {
            dispatch({ type: "conversationLost", lock: LOST_LOCK });
          } else if (error.status === 401) {
            expireSession();
          }
          // Outros erros: silêncio; o próximo evento ou o polling corrige.
        },
      )
      .finally(() => {
        inFlightRef.current = false;
        const queued = queuedRef.current;
        queuedRef.current = null;
        if (queued !== null) resync(queued);
      });
  };

  const streamStatus = useEventStream({
    url: "/api/chat/events",
    enabled: conversationId !== undefined && status !== "CLOSED",
    events: {
      sync: (data) => {
        const parsed = syncSchema.safeParse(data);
        if (parsed.success && parsed.data.mode === "RESYNC") resync();
      },
      "message.created": (data) => {
        const parsed = messageCreatedSchema.safeParse(data);
        if (parsed.success) dispatch({ type: "streamMessage", ...parsed.data });
      },
      "conversation.updated": (data) => {
        const parsed = conversationUpdatedSchema.safeParse(data);
        if (parsed.success) dispatch({ type: "conversationUpdated", ...parsed.data });
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
  useEffect(() => {
    if (streamStatus !== "down" || !withAnalyst) return;
    const timer = setInterval(() => poll(), FALLBACK_POLL_MS);
    return () => clearInterval(timer);
  }, [streamStatus, withAnalyst]);

  return {
    resync,
    /** Lido na hora: o stream pode ter mudado desde o render. */
    isLive: () => liveRef.current,
  };
}
