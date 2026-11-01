import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useReducer, useRef } from "react";
import { SESSION_QUERY_KEY } from "@/entities/session";
import type { TicketSummary } from "@/entities/ticket";
import { getChatFailure } from "../lib/chat-error";
import { chatReducer, createInitialChatState } from "../model/chat-reducer";
import { CHAT_MESSAGE_MAX_LENGTH } from "../model/chat-schema";
import { sendChatMessage } from "./send-message";

export function useChat() {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(
    chatReducer,
    undefined,
    createInitialChatState,
  );
  // mutateAsync, não callbacks de mutate: esses só rodam com observer inscrito,
  // e a árvore escondida pela Activity perde a inscrição.
  // networkMode "always": offline, o padrão pausaria sem erro nem prazo, e o
  // POST sairia sozinho ao voltar a rede, talvez para uma conversa descartada.
  const { mutateAsync } = useMutation({
    mutationFn: sendChatMessage,
    networkMode: "always",
  });

  // O estado só muda no próximo commit; a ref barra o duplo envio antes disso.
  const isSendingRef = useRef(false);
  const generationRef = useRef(0);
  const nextIdRef = useRef(0);

  const nextId = () => {
    nextIdRef.current += 1;
    return `chat-item-${nextIdRef.current}`;
  };

  useLayoutEffect(() => {
    if (state.pendingItemId === null) isSendingRef.current = false;
  }, [state.pendingItemId]);

  // O Next esconde a rota em vez de desmontar: sem isto, a conversa de um
  // usuário reapareceria para o próximo que entrasse.
  useLayoutEffect(
    () => () => {
      generationRef.current += 1;
      isSendingRef.current = false;
      dispatch({ type: "reset" });
    },
    [],
  );

  const runTurn = async (message: string) => {
    const generation = generationRef.current;
    const { conversationId } = state;

    try {
      const result = await mutateAsync({ message, conversationId });
      if (generation !== generationRef.current) return;
      dispatch({ type: "succeeded", id: nextId(), result });
    } catch (error) {
      if (generation !== generationRef.current) return;

      const failure = getChatFailure(error);
      dispatch({ type: "failed", failure });
      if (failure.sessionExpired) {
        void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      }
    }
  };

  const startTurn = (text: string) => {
    isSendingRef.current = true;
    dispatch({ type: "sent", id: nextId(), text });
    void runTurn(text);
  };

  const send = (text: string): boolean => {
    if (isSendingRef.current || state.pendingItemId !== null || state.lock) {
      return false;
    }
    startTurn(text);
    return true;
  };

  const retry = () => {
    const lastItem = state.items.at(-1);
    if (isSendingRef.current || state.pendingItemId !== null) return;
    if (lastItem?.kind !== "user" || !lastItem.failure?.retryable) return;

    isSendingRef.current = true;
    dispatch({ type: "retried", id: lastItem.id });
    void runTurn(lastItem.text);
  };

  const selectTicket = (agentItemId: string, ticket: TicketSummary) => {
    const lastItem = state.items.at(-1);
    if (isSendingRef.current || state.pendingItemId !== null || state.lock) {
      return;
    }
    if (lastItem?.kind !== "agent" || lastItem.id !== agentItemId) return;
    if (lastItem.selectedCode !== null) return;

    dispatch({ type: "ticketSelected", id: agentItemId, code: ticket.code });
    startTurn(
      `${ticket.code} · ${ticket.title}`.slice(0, CHAT_MESSAGE_MAX_LENGTH),
    );
  };

  const startNewConversation = () => {
    generationRef.current += 1;
    isSendingRef.current = false;
    dispatch({ type: "reset" });
  };

  return {
    items: state.items,
    isPending: state.pendingItemId !== null,
    count: state.count,
    limit: state.limit,
    lock: state.lock,
    send,
    retry,
    selectTicket,
    startNewConversation,
  };
}
