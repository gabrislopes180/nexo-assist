import {
  DEFAULT_MESSAGE_LIMIT,
  type Conversation,
} from "@/entities/conversation";
import { trailSteps, type TrailStep } from "@/entities/message";
import type { TicketLookup } from "@/entities/ticket";
import type { ChatResponse } from "./chat-schema";

export interface ChatLock {
  message: string;
}

export interface ChatFailure {
  line: string;
  retryable: boolean;
  lock: ChatLock | null;
  clearConversation: boolean;
  sessionExpired: boolean;
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
    };

export interface ChatState {
  items: ChatItem[];
  conversationId?: string;
  count: number;
  limit: number;
  pendingItemId: string | null;
  lock: ChatLock | null;
}

export type ChatEvent =
  | { type: "sent"; id: string; text: string }
  | { type: "retried"; id: string }
  | { type: "succeeded"; id: string; result: ChatResponse }
  | { type: "failed"; failure: ChatFailure }
  | { type: "ticketSelected"; id: string; code: string }
  | { type: "reset" };

export function createInitialChatState(): ChatState {
  return {
    items: [],
    count: 0,
    limit: DEFAULT_MESSAGE_LIMIT,
    pendingItemId: null,
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
      const { conversation, message, ticketLookup } = event.result;
      return {
        ...state,
        items: [
          ...state.items,
          {
            kind: "agent",
            id: event.id,
            content: message.content,
            steps: trailSteps(message.trace.actions),
            lookup: ticketLookup,
            selectedCode: null,
          },
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

    case "reset":
      return createInitialChatState();
  }
}
