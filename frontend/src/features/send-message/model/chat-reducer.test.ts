import { describe, expect, it } from "vitest";
import {
  chatReducer,
  createInitialChatState,
  type ChatFailure,
  type ChatState,
} from "./chat-reducer";
import type { ChatResponse } from "./chat-schema";

const failure = (overrides: Partial<ChatFailure> = {}): ChatFailure => ({
  line: "Não foi possível enviar sua mensagem.",
  retryable: true,
  lock: null,
  clearConversation: false,
  sessionExpired: false,
  ...overrides,
});

const result = (
  conversation: Partial<ChatResponse["conversation"]> = {},
  overrides: Partial<ChatResponse> = {},
): ChatResponse => ({
  conversation: {
    id: "c1",
    status: "WITH_AGENT",
    messageCount: 1,
    messageLimit: 30,
    remainingMessages: 29,
    analyst: null,
    ...conversation,
  },
  employeeMessage: {
    id: "e1",
    authorType: "EMPLOYEE",
    content: "Oi",
    createdAt: "2026-10-16T17:19:59.000Z",
  },
  message: {
    id: "m1",
    content: "Resposta",
    createdAt: "2026-10-16T17:20:00.000Z",
    trace: {
      actions: [
        { tool: "searchMyOpenTickets", summary: "s", status: "SUCCESS" },
      ],
    },
  },
  ticketLookup: null,
  ticketDraft: null,
  quickReplies: null,
  ...overrides,
});

const sent = (state: ChatState, id = "u1", text = "Oi"): ChatState =>
  chatReducer(state, { type: "sent", id, text });

const succeeded = (
  state: ChatState,
  turn: ChatResponse = result(),
): ChatState => chatReducer(state, { type: "succeeded", result: turn });

const failed = (state: ChatState, value: ChatFailure): ChatState =>
  chatReducer(state, { type: "failed", failure: value });

describe("chatReducer", () => {
  const initial = createInitialChatState();

  it("começa vazio, com o limite padrão", () => {
    expect(initial).toEqual({
      initialized: false,
      items: [],
      count: 0,
      limit: 30,
      status: null,
      analyst: null,
      pendingItemId: null,
      draftOp: null,
      lock: null,
      inbox: [],
    });
  });

  it("sent adiciona a mensagem otimista e marca a pendência", () => {
    const state = sent(initial);

    expect(state.items).toEqual([
      { kind: "user", id: "u1", text: "Oi", failure: null, createdAt: null },
    ]);
    expect(state.pendingItemId).toBe("u1");
    expect(state.count).toBe(0);
  });

  it("succeeded troca o id otimista pelo real e acrescenta a resposta", () => {
    const state = succeeded(sent(initial));

    expect(state.items[0]).toEqual({
      kind: "user",
      id: "e1",
      text: "Oi",
      failure: null,
      createdAt: "2026-10-16T17:19:59.000Z",
    });
    expect(state.items[1]).toEqual({
      kind: "agent",
      id: "m1",
      content: "Resposta",
      createdAt: "2026-10-16T17:20:00.000Z",
      steps: [{ label: "consultou seus chamados", failed: false }],
      trace: result().message?.trace,
      sources: [],
      lookup: null,
      selectedCode: null,
      draft: null,
      quickReplies: null,
      selectedReply: null,
      ticket: null,
    });
    expect(state).toMatchObject({
      conversationId: "c1",
      status: "WITH_AGENT",
      count: 1,
      limit: 30,
      pendingItemId: null,
      lock: null,
    });
  });

  it("succeeded sem mensagem do agent só grava a do funcionário", () => {
    const analyst = { id: "a1", name: "Rafael Lima" };
    const state = succeeded(
      sent(initial),
      result({ status: "WITH_ANALYST", analyst }, { message: null }),
    );

    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ kind: "user", id: "e1" });
    expect(state).toMatchObject({
      status: "WITH_ANALYST",
      analyst,
      lock: null,
      pendingItemId: null,
    });
  });

  it("succeeded bloqueia ao esgotar o limite", () => {
    const state = succeeded(
      sent(initial),
      result({ messageCount: 30, remainingMessages: 0 }),
    );

    expect(state.lock).toEqual({
      message: "Você chegou ao limite de 30 mensagens nesta conversa.",
      allowsDrafts: true,
    });
  });

  it("succeeded bloqueia conversa encerrada", () => {
    const state = succeeded(sent(initial), result({ status: "CLOSED" }));

    expect(state.lock?.message).toBe("Esta conversa foi encerrada.");
  });

  it.each(["WAITING_ANALYST", "WITH_ANALYST"] as const)(
    "succeeded não bloqueia conversa em %s, nem no limite",
    (status) => {
      const state = succeeded(
        sent(initial),
        result({ status, remainingMessages: 0 }),
      );

      expect(state.lock).toBeNull();
    },
  );

  it("prioriza o status sobre o limite, como o backend", () => {
    const state = succeeded(
      sent(initial),
      result({ status: "CLOSED", remainingMessages: 0 }),
    );

    expect(state.lock?.message).toBe("Esta conversa foi encerrada.");
  });

  it("succeeded não cria mais o marco de transferência local", () => {
    const state = succeeded(
      sent(initial),
      result({ status: "WAITING_ANALYST" }),
    );

    expect(state.items.some((item) => item.kind === "event")).toBe(false);
  });

  it("failed grava a falha no item pendente, sem mudar o contador", () => {
    const state = failed(sent(initial), failure());

    expect(state.items[0]).toMatchObject({ failure: failure() });
    expect(state).toMatchObject({ pendingItemId: null, count: 0 });
  });

  it("failed sem pendência não altera o estado", () => {
    expect(failed(initial, failure())).toBe(initial);
  });

  it("failed aplica o bloqueio", () => {
    const lock = { message: "Esta conversa foi encerrada." };
    const state = failed(sent(succeeded(sent(initial)), "u2"), failure({ lock }));

    expect(state.lock).toEqual(lock);
    expect(state.conversationId).toBe("c1");
  });

  it("failed apaga o id quando a conversa sumiu", () => {
    const lock = { message: "Esta conversa não está mais disponível." };
    const state = failed(
      sent(succeeded(sent(initial)), "u2"),
      failure({ lock, clearConversation: true }),
    );

    expect(state.conversationId).toBeUndefined();
    expect(state.lock).toEqual(lock);
  });

  it("retried limpa a falha sem criar balão", () => {
    const state = chatReducer(failed(sent(initial), failure()), {
      type: "retried",
      id: "u1",
    });

    expect(state.items).toHaveLength(1);
    expect(state.items[0]).toMatchObject({ failure: null });
    expect(state.pendingItemId).toBe("u1");
  });

  it("nova mensagem preserva a linha de falha anterior", () => {
    const state = sent(failed(sent(initial), failure()), "u2", "Outra");

    expect(state.items).toHaveLength(2);
    expect(state.items[0]).toMatchObject({ failure: failure() });
  });

  it("ticketSelected marca o código no item do agent", () => {
    const state = chatReducer(succeeded(sent(initial)), {
      type: "ticketSelected",
      id: "m1",
      code: "INC-20311",
    });

    expect(state.items[1]).toMatchObject({ selectedCode: "INC-20311" });
  });

  it("reset volta ao estado inicial", () => {
    const state = chatReducer(succeeded(sent(initial)), { type: "reset" });

    expect(state).toEqual({ ...initial, initialized: true });
  });
});
