import {
  DEFAULT_MESSAGE_LIMIT,
  type Conversation,
  type ConversationStatus,
  type Person,
} from "@/entities/conversation";
import {
  stripSourceNote,
  systemEventIcon,
  trailSteps,
  type AgentAction,
  type ArticleSource,
  type SystemEventIcon,
  type TimelineMessage,
  type TrailStep,
} from "@/entities/message";
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
  /** O estado da conversa mudou no backend: buscar de novo. */
  resync?: boolean;
}

export interface DraftFailure {
  line: string;
  retryable: boolean;
  /** O rascunho deixou de existir no backend: sai de cena, sem botões. */
  unavailable: boolean;
  lock: ChatLock | null;
  sessionExpired: boolean;
  /** O estado da conversa mudou no backend: buscar de novo. */
  resync?: boolean;
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
  | {
      kind: "user";
      id: string;
      text: string;
      failure: ChatFailure | null;
      /** Null enquanto o id é local (otimista ou que falhou). */
      createdAt: string | null;
    }
  /** Mensagem SYSTEM do backend: transferência, analista assumindo etc. */
  | {
      kind: "event";
      id: string;
      text: string;
      at: string;
      icon: SystemEventIcon | null;
    }
  | {
      kind: "analyst";
      id: string;
      authorName: string;
      content: string;
      createdAt: string;
    }
  | {
      kind: "agent";
      id: string;
      content: string;
      createdAt: string;
      steps: TrailStep[];
      /** Artigos citados (`trace.sources`): viram cards abaixo da bolha. */
      sources: ArticleSource[];
      lookup: TicketLookup | null;
      selectedCode: string | null;
      draft: DraftView | null;
      quickReplies: string[] | null;
      selectedReply: string | null;
      /** Chamado criado ou complementado, depois de Confirmar. */
      ticket: TicketSummary | null;
    };

type AgentItem = Extract<ChatItem, { kind: "agent" }>;

/** O que chega pelo SSE ou pela ressincronização. */
export type StreamInput =
  | { type: "streamMessage"; conversationId: string; message: TimelineMessage }
  | { type: "conversationUpdated"; conversation: Conversation }
  | {
      type: "resynced";
      conversation: Conversation;
      messages: TimelineMessage[];
    };

export interface ChatState {
  items: ChatItem[];
  conversationId?: string;
  /** Null até a primeira resposta. */
  status: ConversationStatus | null;
  analyst: Person | null;
  count: number;
  limit: number;
  pendingItemId: string | null;
  /** Confirmar ou Cancelar em andamento; nunca junto com um turno. */
  draftOp: DraftOp | null;
  lock: ChatLock | null;
  /**
   * Eventos que chegaram durante um turno ou ação de rascunho: o SSE pode vir
   * antes da resposta do POST, com o item otimista ainda de id local.
   */
  inbox: StreamInput[];
}

export type ChatEvent =
  | { type: "sent"; id: string; text: string }
  | { type: "retried"; id: string }
  | { type: "succeeded"; result: ChatResponse }
  | { type: "failed"; failure: ChatFailure }
  | { type: "ticketSelected"; id: string; code: string }
  | { type: "replySelected"; id: string; text: string }
  | { type: "draftEdited"; id: string; values: DraftValues }
  | { type: "draftActionStarted"; id: string; action: DraftAction }
  | { type: "draftConfirmed"; result: ConfirmDraftResponse }
  | { type: "draftCancelled"; result: CancelDraftResponse }
  | { type: "draftFailed"; failure: DraftFailure }
  /** A conversa sumiu do backend (404 na ressincronização). */
  | { type: "conversationLost"; lock: ChatLock }
  | StreamInput
  | { type: "reset" };

export function createInitialChatState(): ChatState {
  return {
    items: [],
    count: 0,
    limit: DEFAULT_MESSAGE_LIMIT,
    status: null,
    analyst: null,
    pendingItemId: null,
    draftOp: null,
    lock: null,
    inbox: [],
  };
}

/**
 * Mesma ordem do backend. Com analista (esperando ou atendendo) a mensagem é
 * aceita sem cota: nunca trava.
 */
function lockFor(
  conversation: Pick<Conversation, "status"> &
    Partial<Pick<Conversation, "remainingMessages" | "messageLimit">>,
): ChatLock | null {
  if (conversation.status === "CLOSED") {
    return { message: "Esta conversa foi encerrada." };
  }
  if (
    conversation.status === "WITH_AGENT" &&
    conversation.remainingMessages === 0 &&
    conversation.messageLimit
  ) {
    return {
      message: `Você chegou ao limite de ${conversation.messageLimit} mensagens nesta conversa.`,
      allowsDrafts: true,
    };
  }
  return null;
}

/** Aviso não bloqueante acima do composer enquanto um analista cuida da conversa. */
export function noticeFor(
  state: Pick<ChatState, "status" | "analyst">,
): string | null {
  if (state.status === "WAITING_ANALYST") {
    return "Um analista vai continuar o atendimento por aqui.";
  }
  if (state.status === "WITH_ANALYST") {
    return `${state.analyst?.name ?? "Um analista"} está atendendo você por aqui.`;
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

function markPendingDrafts(items: ChatItem[], status: DraftStatus): ChatItem[] {
  return items.map((item) =>
    item.kind === "agent" && item.draft?.status === "pending"
      ? { ...item, draft: { ...item.draft, status } }
      : item,
  );
}

interface AgentReply {
  id: string;
  content: string;
  createdAt: string;
  trace?: {
    actions: readonly AgentAction[];
    sources?: ArticleSource[];
  } | null;
}

/** Com artigo citado, a frase "Fonte: …" sai do texto: o card mostra a fonte. */
function agentItem(
  message: AgentReply,
  extra: Partial<AgentItem> = {},
): AgentItem {
  const sources = message.trace?.sources ?? [];
  return {
    kind: "agent",
    id: message.id,
    content: stripSourceNote(message.content, sources),
    createdAt: message.createdAt,
    steps: trailSteps(message.trace?.actions ?? []),
    sources,
    lookup: null,
    selectedCode: null,
    draft: null,
    quickReplies: null,
    selectedReply: null,
    ticket: null,
    ...extra,
  };
}

const itemTime = (item: ChatItem): string | null => {
  if (item.kind === "event") return item.at;
  return item.createdAt;
};

/** Antes do primeiro item mais novo ou ainda sem hora (otimista, falha local). */
function insertByTime(items: ChatItem[], item: ChatItem): ChatItem[] {
  const time = Date.parse(itemTime(item) ?? "");
  const index = items.findIndex((existing) => {
    const existingTime = itemTime(existing);
    return existingTime === null || Date.parse(existingTime) > time;
  });
  if (index === -1) return [...items, item];
  return [...items.slice(0, index), item, ...items.slice(index)];
}

function itemFromMessage(message: TimelineMessage): ChatItem {
  switch (message.authorType) {
    case "EMPLOYEE":
      return {
        kind: "user",
        id: message.id,
        text: message.content,
        failure: null,
        createdAt: message.createdAt,
      };
    case "AGENT":
      // Sem consulta, rascunho nem respostas rápidas: só a resposta do POST traz.
      return agentItem(message);
    case "ANALYST":
      return {
        kind: "analyst",
        id: message.id,
        authorName: message.author?.name ?? "Analista",
        content: message.content,
        createdAt: message.createdAt,
      };
    case "SYSTEM":
      return {
        kind: "event",
        id: message.id,
        text: message.content,
        at: message.createdAt,
        icon: systemEventIcon(message.systemKind),
      };
  }
}

/** Acrescenta a mensagem se ainda não está na tela; uma falha local com o mesmo texto adota o id real. */
function mergeMessage(items: ChatItem[], message: TimelineMessage): ChatItem[] {
  if (items.some((item) => item.id === message.id)) return items;

  if (message.authorType === "EMPLOYEE") {
    const orphan = items.find(
      (item) =>
        item.kind === "user" &&
        item.createdAt === null &&
        item.failure !== null &&
        item.text === message.content,
    );
    if (orphan) {
      return insertByTime(
        items.filter((item) => item !== orphan),
        itemFromMessage(message),
      );
    }
  }
  return insertByTime(items, itemFromMessage(message));
}

function applyConversation(
  state: ChatState,
  conversation: Conversation,
): ChatState {
  const leftAgent = conversation.status !== "WITH_AGENT";
  return {
    ...state,
    items: leftAgent
      ? markPendingDrafts(state.items, "unavailable")
      : state.items,
    status: conversation.status,
    analyst: conversation.analyst,
    count: conversation.messageCount,
    limit: conversation.messageLimit,
    lock: lockFor(conversation),
  };
}

const isBusy = (state: ChatState) =>
  state.pendingItemId !== null || state.draftOp !== null;

function applyInput(state: ChatState, input: StreamInput): ChatState {
  const conversationId =
    input.type === "streamMessage" ? input.conversationId : input.conversation.id;
  if (state.conversationId === undefined || conversationId !== state.conversationId) {
    return state;
  }
  switch (input.type) {
    case "streamMessage":
      return { ...state, items: mergeMessage(state.items, input.message) };
    case "conversationUpdated":
      return applyConversation(state, input.conversation);
    case "resynced": {
      // Mescla, nunca substitui: rascunho, seleção e falhas locais ficam.
      const sorted = [...input.messages].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
      );
      const items = sorted.reduce(mergeMessage, state.items);
      return applyConversation({ ...state, items }, input.conversation);
    }
  }
}

/** Com turno ou ação de rascunho em andamento, o evento espera na fila. */
function receive(state: ChatState, input: StreamInput): ChatState {
  if (isBusy(state)) return { ...state, inbox: [...state.inbox, input] };
  return applyInput(state, input);
}

function drain(state: ChatState): ChatState {
  if (state.inbox.length === 0) return state;
  return state.inbox.reduce(applyInput, { ...state, inbox: [] });
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
          {
            kind: "user",
            id: event.id,
            text: event.text,
            failure: null,
            createdAt: null,
          },
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
      if (state.pendingItemId === null) return state;
      const {
        conversation,
        employeeMessage,
        message,
        ticketLookup,
        ticketDraft,
        quickReplies,
      } = event.result;
      const withRealId = mapItem(state.items, state.pendingItemId, (item) =>
        item.kind === "user"
          ? { ...item, id: employeeMessage.id, createdAt: employeeMessage.createdAt }
          : item,
      );
      const items = ticketDraft
        ? markPendingDrafts(withRealId, "superseded")
        : withRealId;
      const answer = message
        ? agentItem(message, {
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
          })
        : null;
      return drain({
        ...state,
        items: answer ? [...items, answer] : items,
        conversationId: conversation.id,
        status: conversation.status,
        analyst: conversation.analyst,
        count: conversation.messageCount,
        limit: conversation.messageLimit,
        pendingItemId: null,
        lock: lockFor(conversation),
      });
    }

    case "failed": {
      if (state.pendingItemId === null) return state;

      const { failure } = event;
      return drain({
        ...state,
        items: mapItem(state.items, state.pendingItemId, (item) =>
          item.kind === "user" ? { ...item, failure } : item,
        ),
        conversationId: failure.clearConversation
          ? undefined
          : state.conversationId,
        pendingItemId: null,
        lock: failure.lock ?? state.lock,
      });
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
      const { message, ticket, conversation } = event.result;
      const finished = finishDraft(
        state,
        "confirmed",
        agentItem(message, { ticket }),
      );
      if (finished === state) return state;
      if (!conversation) return drain(finished);
      // Só o status vem aqui: com o agent, vale o bloqueio que já havia (limite).
      return drain({
        ...finished,
        status: conversation.status,
        lock:
          conversation.status === "WITH_AGENT"
            ? finished.lock
            : lockFor(conversation),
      });
    }

    case "draftCancelled": {
      const { message } = event.result;
      const finished = finishDraft(
        state,
        "cancelled",
        agentItem(message),
      );
      return finished === state ? state : drain(finished);
    }

    case "draftFailed": {
      if (state.draftOp === null) return state;

      const { failure } = event;
      const { itemId, action } = state.draftOp;
      return drain({
        ...state,
        items: mapDraft(state.items, itemId, (draft) => ({
          ...draft,
          status: failure.unavailable ? "unavailable" : draft.status,
          failure,
          failedAction: action,
        })),
        draftOp: null,
        lock: failure.lock ?? state.lock,
      });
    }

    case "streamMessage":
    case "conversationUpdated":
    case "resynced":
      return receive(state, event);

    case "conversationLost":
      if (isBusy(state)) return state;
      return { ...state, conversationId: undefined, lock: event.lock };

    case "reset":
      return createInitialChatState();
  }
}
