import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useLayoutEffect, useReducer, useRef } from "react";
import { SESSION_QUERY_KEY } from "@/entities/session";
import {
  draftConfirmBody,
  type DraftValues,
  type TicketSummary,
} from "@/entities/ticket";
import { getChatFailure } from "../lib/chat-error";
import { getDraftFailure } from "../lib/draft-error";
import {
  chatReducer,
  createInitialChatState,
  type ChatItem,
  type DraftAction,
} from "../model/chat-reducer";
import { CHAT_MESSAGE_MAX_LENGTH } from "../model/chat-schema";
import { cancelDraft, confirmDraft } from "./draft-actions";
import { sendChatMessage } from "./send-message";

type AgentItem = Extract<ChatItem, { kind: "agent" }>;

type DraftRequest =
  | { action: "confirm"; draftId: string; body: Parameters<typeof confirmDraft>[1] }
  | { action: "cancel"; draftId: string };

async function runDraftRequest(request: DraftRequest) {
  if (request.action === "confirm") {
    const result = await confirmDraft(request.draftId, request.body);
    return { action: "confirm" as const, result };
  }
  const result = await cancelDraft(request.draftId);
  return { action: "cancel" as const, result };
}

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
  const { mutateAsync: mutateDraft } = useMutation({
    mutationFn: runDraftRequest,
    networkMode: "always",
  });

  // O estado só muda no próximo commit; a ref barra o duplo envio antes disso.
  // Vale para turnos e para Confirmar/Cancelar: um de cada vez.
  const isSendingRef = useRef(false);
  const generationRef = useRef(0);
  const nextIdRef = useRef(0);

  const nextId = () => {
    nextIdRef.current += 1;
    return `chat-item-${nextIdRef.current}`;
  };

  const isIdle = state.pendingItemId === null && state.draftOp === null;

  useLayoutEffect(() => {
    if (isIdle) isSendingRef.current = false;
  }, [isIdle]);

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

  const canStart = () => !isSendingRef.current && isIdle;

  const expireSessionIf = (expired: boolean) => {
    if (expired) {
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    }
  };

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
      expireSessionIf(failure.sessionExpired);
    }
  };

  const startTurn = (text: string) => {
    isSendingRef.current = true;
    dispatch({ type: "sent", id: nextId(), text });
    void runTurn(text);
  };

  const send = (text: string): boolean => {
    if (!canStart() || state.lock) return false;
    startTurn(text);
    return true;
  };

  const retry = () => {
    const lastItem = state.items.at(-1);
    if (!canStart()) return;
    if (lastItem?.kind !== "user" || !lastItem.failure?.retryable) return;

    isSendingRef.current = true;
    dispatch({ type: "retried", id: lastItem.id });
    void runTurn(lastItem.text);
  };

  /** A última resposta, se ainda aceita escolha (seletor ou resposta rápida). */
  const answerableItem = (agentItemId: string): AgentItem | null => {
    const lastItem = state.items.at(-1);
    if (!canStart() || state.lock) return null;
    if (lastItem?.kind !== "agent" || lastItem.id !== agentItemId) return null;
    return lastItem;
  };

  const selectTicket = (agentItemId: string, ticket: TicketSummary) => {
    const item = answerableItem(agentItemId);
    if (!item || item.selectedCode !== null) return;

    dispatch({ type: "ticketSelected", id: agentItemId, code: ticket.code });
    startTurn(
      `${ticket.code} · ${ticket.title}`.slice(0, CHAT_MESSAGE_MAX_LENGTH),
    );
  };

  const selectReply = (agentItemId: string, text: string) => {
    const item = answerableItem(agentItemId);
    if (!item || item.selectedReply !== null) return;
    if (!item.quickReplies?.includes(text)) return;

    dispatch({ type: "replySelected", id: agentItemId, text });
    startTurn(text.slice(0, CHAT_MESSAGE_MAX_LENGTH));
  };

  const pendingDraftItem = (agentItemId: string): AgentItem | null => {
    const item = state.items.find((candidate) => candidate.id === agentItemId);
    if (item?.kind !== "agent" || item.draft?.status !== "pending") return null;
    return item;
  };

  const runDraftAction = async (agentItemId: string, action: DraftAction) => {
    const item = pendingDraftItem(agentItemId);
    if (!item?.draft || !canStart()) return;
    if (state.lock && !state.lock.allowsDrafts) return;

    const { data, values } = item.draft;
    const request: DraftRequest =
      action === "confirm"
        ? { action, draftId: data.id, body: draftConfirmBody(data, values) }
        : { action, draftId: data.id };
    const generation = generationRef.current;
    isSendingRef.current = true;
    dispatch({ type: "draftActionStarted", id: agentItemId, action });

    try {
      const outcome = await mutateDraft(request);
      if (generation !== generationRef.current) return;
      if (outcome.action === "confirm") {
        dispatch({ type: "draftConfirmed", id: nextId(), result: outcome.result });
      } else {
        dispatch({ type: "draftCancelled", id: nextId(), result: outcome.result });
      }
    } catch (error) {
      if (generation !== generationRef.current) return;

      const failure = getDraftFailure(error);
      dispatch({ type: "draftFailed", failure });
      expireSessionIf(failure.sessionExpired);
    }
  };

  const confirmDraftItem = (agentItemId: string) => {
    void runDraftAction(agentItemId, "confirm");
  };

  const cancelDraftItem = (agentItemId: string) => {
    void runDraftAction(agentItemId, "cancel");
  };

  const retryDraft = (agentItemId: string) => {
    const draft = pendingDraftItem(agentItemId)?.draft;
    if (!draft?.failure?.retryable || !draft.failedAction) return;
    void runDraftAction(agentItemId, draft.failedAction);
  };

  const editDraft = (agentItemId: string, values: DraftValues) => {
    if (!pendingDraftItem(agentItemId)) return;
    dispatch({ type: "draftEdited", id: agentItemId, values });
  };

  const startNewConversation = () => {
    generationRef.current += 1;
    isSendingRef.current = false;
    dispatch({ type: "reset" });
  };

  return {
    items: state.items,
    isPending: state.pendingItemId !== null,
    draftOp: state.draftOp,
    count: state.count,
    limit: state.limit,
    lock: state.lock,
    send,
    retry,
    selectTicket,
    selectReply,
    confirmDraft: confirmDraftItem,
    cancelDraft: cancelDraftItem,
    retryDraft,
    editDraft,
    startNewConversation,
  };
}
