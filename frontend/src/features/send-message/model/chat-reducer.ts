import {
  DEFAULT_MESSAGE_LIMIT,
  type Conversation,
} from "@/entities/conversation";
import { trailSteps, type TrailStep } from "@/entities/message";
import {
  initialDraftValues,
  type DraftStatus,
  type DraftValues,
  type TicketDraft,
  type TicketLookup,
  type TicketSummary,
} from "@/entities/ticket";
import type {
  CancelDraftResponse,
  ChatResponse,
  ConfirmDraftResponse,
} from "./chat-schema";

export interface ChatLock {
  message: string;
  /** Só no limite de mensagens: confirmar e cancelar não contam nele. */
  allowsDrafts?: boolean;
}

export interface ChatFailure {
  line: string;
  retryable: boolean;
  lock: ChatLock | null;
  clearConversation: boolean;
  sessionExpired: boolean;
}

export interface DraftFailure {
  line: string;
  retryable: boolean;
  /** O rascunho deixou de existir no backend: sai de cena, sem botões. */
  unavailable: boolean;
  lock: ChatLock | null;
  sessionExpired: boolean;
}

export type DraftAction = "confirm" | "cancel";

export interface DraftOp {
  itemId: string;
  action: DraftAction;
}

export interface DraftView {
  data: TicketDraft;
  values: DraftValues;
  status: DraftStatus;
  failure: DraftFailure | null;
  failedAction: DraftAction | null;
}

export type ChatItem =
  | { kind: "user"; id: string; text: string; failure: ChatFailure | null }
  | {
      kind: "agent";
      id: string;
      content: string;
      steps: TrailStep[];
      lookup: TicketLookup | null;
      selectedCode: string | null;
      draft: DraftView | null;
      quickReplies: string[] | null;
      selectedReply: string | null;
      /** Chamado criado ou complementado, depois de Confirmar. */
      ticket: TicketSummary | null;
    };

type AgentItem = Extract<ChatItem, { kind: "agent" }>;

export interface ChatState {
  items: ChatItem[];
  conversationId?: string;
  count: number;
  limit: number;
  pendingItemId: string | null;
  /** Confirmar ou Cancelar em andamento; nunca junto com um turno. */
  draftOp: DraftOp | null;
  lock: ChatLock | null;
}

export type ChatEvent =
  | { type: "sent"; id: string; text: string }
  | { type: "retried"; id: string }
  | { type: "succeeded"; id: string; result: ChatResponse }
  | { type: "failed"; failure: ChatFailure }
  | { type: "ticketSelected"; id: string; code: string }
  | { type: "replySelected"; id: string; text: string }
  | { type: "draftEdited"; id: string; values: DraftValues }
  | { type: "draftActionStarted"; id: string; action: DraftAction }
  | { type: "draftConfirmed"; id: string; result: ConfirmDraftResponse }
  | { type: "draftCancelled"; id: string; result: CancelDraftResponse }
  | { type: "draftFailed"; failure: DraftFailure }
  | { type: "reset" };

export function createInitialChatState(): ChatState {
  return {
    items: [],
    count: 0,
    limit: DEFAULT_MESSAGE_LIMIT,
    pendingItemId: null,
    draftOp: null,
    lock: null,
  };
}

// Mesma ordem do backend, para o aviso ser igual ao do erro que ele devolveria.
function lockFor(conversation: Conversation): ChatLock | null {
  if (conversation.status === "CLOSED") {
    return { message: "Esta conversa foi encerrada." };
  }
  if (conversation.status !== "WITH_AGENT") {
    return { message: "Esta conversa está com um analista." };
  }
  if (conversation.remainingMessages === 0) {
    return {
      message: `Você chegou ao limite de ${conversation.messageLimit} mensagens nesta conversa.`,
      allowsDrafts: true,
    };
  }
  return null;
}

function mapItem(
  items: ChatItem[],
  id: string,
  update: (item: ChatItem) => ChatItem,
): ChatItem[] {
  return items.map((item) => (item.id === id ? update(item) : item));
}

function mapDraft(
  items: ChatItem[],
  id: string,
  update: (draft: DraftView) => DraftView,
): ChatItem[] {
  return mapItem(items, id, (item) =>
    item.kind === "agent" && item.draft
      ? { ...item, draft: update(item.draft) }
      : item,
  );
}

// O backend guarda um rascunho por conversa: o novo tira o anterior de cena.
function supersedePending(items: ChatItem[]): ChatItem[] {
  return items.map((item) =>
    item.kind === "agent" && item.draft?.status === "pending"
      ? { ...item, draft: { ...item.draft, status: "superseded" } }
      : item,
  );
}

function agentItem(
  id: string,
  content: string,
  steps: TrailStep[],
  extra: Partial<AgentItem> = {},
): AgentItem {
  return {
    kind: "agent",
    id,
    content,
    steps,
    lookup: null,
    selectedCode: null,
    draft: null,
    quickReplies: null,
    selectedReply: null,
    ticket: null,
    ...extra,
  };
}

function finishDraft(
  state: ChatState,
  status: DraftStatus,
  next: AgentItem,
): ChatState {
  if (state.draftOp === null) return state;
  return {
    ...state,
    items: [
      ...mapDraft(state.items, state.draftOp.itemId, (draft) => ({
        ...draft,
        status,
        failure: null,
        failedAction: null,
      })),
      next,
    ],
    draftOp: null,
  };
}

export function chatReducer(state: ChatState, event: ChatEvent): ChatState {
  switch (event.type) {
    case "sent":
      return {
        ...state,
        items: [
          ...state.items,
          { kind: "user", id: event.id, text: event.text, failure: null },
        ],
        pendingItemId: event.id,
      };

    case "retried":
      return {
        ...state,
        items: mapItem(state.items, event.id, (item) =>
          item.kind === "user" ? { ...item, failure: null } : item,
        ),
        pendingItemId: event.id,
      };

    case "succeeded": {
      const { conversation, message, ticketLookup, ticketDraft, quickReplies } =
        event.result;
      const items = ticketDraft ? supersedePending(state.items) : state.items;
      return {
        ...state,
        items: [
          ...items,
          agentItem(event.id, message.content, trailSteps(message.trace.actions), {
            // Com rascunho, o seletor some: a proposta é o próximo passo.
            lookup: ticketDraft ? null : ticketLookup,
            draft: ticketDraft
              ? {
                  data: ticketDraft,
                  values: initialDraftValues(ticketDraft),
                  status: "pending",
                  failure: null,
                  failedAction: null,
                }
              : null,
            quickReplies,
          }),
        ],
        conversationId: conversation.id,
        count: conversation.messageCount,
        limit: conversation.messageLimit,
        pendingItemId: null,
        lock: lockFor(conversation),
      };
    }

    case "failed": {
      if (state.pendingItemId === null) return state;

      const { failure } = event;
      return {
        ...state,
        items: mapItem(state.items, state.pendingItemId, (item) =>
          item.kind === "user" ? { ...item, failure } : item,
        ),
        conversationId: failure.clearConversation
          ? undefined
          : state.conversationId,
        pendingItemId: null,
        lock: failure.lock ?? state.lock,
      };
    }

    case "ticketSelected":
      return {
        ...state,
        items: mapItem(state.items, event.id, (item) =>
          item.kind === "agent" ? { ...item, selectedCode: event.code } : item,
        ),
      };

    case "replySelected":
      return {
        ...state,
        items: mapItem(state.items, event.id, (item) =>
          item.kind === "agent" ? { ...item, selectedReply: event.text } : item,
        ),
      };

    case "draftEdited":
      return {
        ...state,
        items: mapDraft(state.items, event.id, (draft) => ({
          ...draft,
          values: event.values,
        })),
      };

    case "draftActionStarted":
      return {
        ...state,
        items: mapDraft(state.items, event.id, (draft) => ({
          ...draft,
          failure: null,
        })),
        draftOp: { itemId: event.id, action: event.action },
      };

    case "draftConfirmed": {
      const { message, ticket } = event.result;
      return finishDraft(
        state,
        "confirmed",
        agentItem(event.id, message.content, trailSteps(message.trace.actions), {
          ticket,
        }),
      );
    }

    case "draftCancelled": {
      const { message } = event.result;
      return finishDraft(
        state,
        "cancelled",
        agentItem(event.id, message.content, trailSteps(message.trace.actions)),
      );
    }

    case "draftFailed": {
      if (state.draftOp === null) return state;

      const { failure } = event;
      const { itemId, action } = state.draftOp;
      return {
        ...state,
        items: mapDraft(state.items, itemId, (draft) => ({
          ...draft,
          status: failure.unavailable ? "unavailable" : draft.status,
          failure,
          failedAction: action,
        })),
        draftOp: null,
        lock: failure.lock ?? state.lock,
      };
    }

    case "reset":
      return createInitialChatState();
  }
}
