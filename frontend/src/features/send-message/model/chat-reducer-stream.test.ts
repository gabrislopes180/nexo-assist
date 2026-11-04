import { describe, expect, it } from "vitest";
import type { Conversation } from "@/entities/conversation";
import type { TimelineMessage } from "@/entities/message";
import type { TicketDraft } from "@/entities/ticket";
import {
  chatReducer,
  createInitialChatState,
  noticeFor,
  type ChatEvent,
  type ChatState,
} from "./chat-reducer";
import type { ChatResponse } from "./chat-schema";

const rafael = { id: "a1", name: "Rafael Lima" };

const conversation = (overrides: Partial<Conversation> = {}): Conversation => ({
  id: "c1",
  status: "WITH_AGENT",
  messageCount: 1,
  messageLimit: 30,
  remainingMessages: 29,
  analyst: null,
  ...overrides,
});

const at = (minute: number) =>
  `2026-11-03T10:${String(minute).padStart(2, "0")}:00.000Z`;

const timeline = (
  id: string,
  authorType: TimelineMessage["authorType"],
  minute: number,
  content = id,
  extra: Partial<TimelineMessage> = {},
): TimelineMessage => ({
  id,
  authorType,
  author:
    authorType === "ANALYST"
      ? rafael
      : authorType === "EMPLOYEE"
        ? { id: "u1", name: "Ana Souza" }
        : null,
  content,
  createdAt: at(minute),
  trace: null,
  systemKind: null,
  ...extra,
});

const draft: TicketDraft = {
  id: "d1",
  kind: "CREATE",
  type: "INC",
  category: "NETWORK_VPN",
  priority: "HIGH",
  title: "VPN não conecta",
  description: "Erro 809.",
  affectedScope: "INDIVIDUAL",
  dueAtPreview: "2026-11-03T16:00:00.000Z",
};

const turn = (
  overrides: Partial<ChatResponse> = {},
  conv: Partial<Conversation> = {},
): ChatResponse => ({
  conversation: conversation(conv),
  employeeMessage: {
    id: "e1",
    authorType: "EMPLOYEE",
    content: "Oi",
    createdAt: at(1),
  },
  message: {
    id: "m1",
    content: "Resposta",
    createdAt: at(2),
    trace: { actions: [] },
  },
  ticketLookup: null,
  ticketDraft: null,
  quickReplies: null,
  ...overrides,
});

const run = (state: ChatState, ...events: ChatEvent[]) =>
  events.reduce(chatReducer, state);

const stream = (message: TimelineMessage, conversationId = "c1"): ChatEvent => ({
  type: "streamMessage",
  conversationId,
  message,
});

const updated = (conv: Partial<Conversation>): ChatEvent => ({
  type: "conversationUpdated",
  conversation: conversation(conv),
});

/** Conversa c1 com um turno já respondido: e1 (funcionário) e m1 (agent). */
const active = (overrides: Partial<ChatResponse> = {}) =>
  run(
    createInitialChatState(),
    { type: "sent", id: "local-1", text: "Oi" },
    { type: "succeeded", result: turn(overrides) },
  );

const ids = (state: ChatState) => state.items.map((item) => item.id);

describe("chatReducer: tempo real", () => {
  it("mensagem do analista vira bolha do analista com o nome", () => {
    const state = run(active(), stream(timeline("x1", "ANALYST", 5, "Oi, Ana")));

    expect(state.items.at(-1)).toEqual({
      kind: "analyst",
      id: "x1",
      authorName: "Rafael Lima",
      content: "Oi, Ana",
      createdAt: at(5),
    });
  });

  it("analista sem autor usa o rótulo genérico", () => {
    const state = run(
      active(),
      stream(timeline("x1", "ANALYST", 5, "Oi", { author: null })),
    );

    expect(state.items.at(-1)).toMatchObject({ authorName: "Analista" });
  });

  it.each([
    ["Transferida para um analista", "HANDOFF", "transfer"],
    ["Rafael assumiu a conversa", "TAKEOVER", "takeover"],
    ["Conversa devolvida ao agent", "RETURNED", "return"],
    ["Rafael encerrou o atendimento", "CLOSED", null],
    // O texto não decide nada: sem systemKind, fica sem ícone.
    ["Transferida para um analista", null, null],
  ] as const)("SYSTEM %s (%s) vira marco com ícone %s", (content, systemKind, icon) => {
    const state = run(
      active(),
      stream(timeline("s1", "SYSTEM", 5, content, { systemKind })),
    );

    expect(state.items.at(-1)).toEqual({
      kind: "event",
      id: "s1",
      text: content,
      at: at(5),
      icon,
    });
  });

  it("mensagem do agent pelo stream traz só a trilha, sem anexos", () => {
    const state = run(
      active(),
      stream(
        timeline("m9", "AGENT", 5, "Voltei", {
          trace: {
            actions: [
              { tool: "searchMyOpenTickets", summary: "s", status: "SUCCESS" },
            ],
          },
        }),
      ),
    );

    expect(state.items.at(-1)).toMatchObject({
      kind: "agent",
      id: "m9",
      content: "Voltei",
      steps: [{ label: "consultou seus chamados", failed: false }],
      lookup: null,
      draft: null,
      quickReplies: null,
    });
  });

  it("não duplica mensagem que já está na tela", () => {
    const state = run(
      active(),
      stream(timeline("e1", "EMPLOYEE", 1, "Oi")),
      stream(timeline("m1", "AGENT", 2, "Resposta")),
    );

    expect(ids(state)).toEqual(["e1", "m1"]);
  });

  it("ignora outra conversa sem turno pendente", () => {
    const before = active();
    const state = run(before, stream(timeline("x1", "ANALYST", 5), "c2"));

    expect(state).toBe(before);
  });

  it("enfileira durante o turno e aplica depois, sem duplicar", () => {
    const pending = run(createInitialChatState(), {
      type: "sent",
      id: "local-1",
      text: "Quero falar com um analista",
    });
    const queued = run(
      pending,
      stream(timeline("e1", "EMPLOYEE", 1, "Quero falar com um analista")),
      stream(timeline("m1", "AGENT", 2, "Resposta")),
      stream(timeline("s1", "SYSTEM", 2, "Transferida para um analista", { systemKind: "HANDOFF" })),
      updated({ status: "WAITING_ANALYST" }),
    );
    expect(queued.items).toHaveLength(1);
    expect(queued.inbox).toHaveLength(4);

    const done = run(queued, {
      type: "succeeded",
      result: turn({}, { status: "WAITING_ANALYST" }),
    });

    expect(ids(done)).toEqual(["e1", "m1", "s1"]);
    expect(done.inbox).toEqual([]);
    expect(done.status).toBe("WAITING_ANALYST");
  });

  it("descarta da fila o que é de outra conversa", () => {
    const state = run(
      createInitialChatState(),
      { type: "sent", id: "local-1", text: "Oi" },
      stream(timeline("z1", "ANALYST", 1), "c9"),
      { type: "succeeded", result: turn() },
    );

    expect(ids(state)).toEqual(["e1", "m1"]);
  });

  it("enfileira durante Confirmar e deduplica a resposta da confirmação", () => {
    const withDraft = active({ ticketDraft: draft });
    const started = run(withDraft, {
      type: "draftActionStarted",
      id: "m1",
      action: "confirm",
    });
    const confirmedMessage = {
      id: "m2",
      content: "Abri o chamado.",
      createdAt: at(3),
      trace: { actions: [] },
    };
    const state = run(
      started,
      stream(timeline("m2", "AGENT", 3, "Abri o chamado.")),
      stream(timeline("s1", "SYSTEM", 3, "Transferida para um analista", { systemKind: "HANDOFF" })),
      {
        type: "draftConfirmed",
        result: {
          message: confirmedMessage,
          ticket: {
            code: "INC-1",
            type: "INC",
            category: "NETWORK_VPN",
            priority: "CRITICAL",
            status: "WAITING_ANALYST",
            statusLabel: "Aguardando analista",
            title: "VPN",
            createdAt: at(3),
            dueAt: null,
            overdue: false,
          },
          conversation: { id: "c1", status: "WAITING_ANALYST" },
        },
      },
    );

    expect(ids(state)).toEqual(["e1", "m1", "m2", "s1"]);
    expect(state.status).toBe("WAITING_ANALYST");
  });

  it("falha + mensagem com o mesmo texto pelo stream adota o id real", () => {
    const state = run(
      active(),
      { type: "sent", id: "local-2", text: "Ainda está aí?" },
      stream(timeline("e2", "EMPLOYEE", 4, "Ainda está aí?")),
      {
        type: "failed",
        failure: {
          line: "Não enviada",
          retryable: true,
          lock: null,
          clearConversation: false,
          sessionExpired: false,
        },
      },
    );

    expect(state.items.at(-1)).toEqual({
      kind: "user",
      id: "e2",
      text: "Ainda está aí?",
      failure: null,
      createdAt: at(4),
    });
    expect(state.items).toHaveLength(3);
  });

  it("mensagem nova entra antes de uma falha local, que segue por último", () => {
    const state = run(
      active(),
      { type: "sent", id: "local-2", text: "Outra" },
      {
        type: "failed",
        failure: {
          line: "Não enviada",
          retryable: true,
          lock: null,
          clearConversation: false,
          sessionExpired: false,
        },
      },
      stream(timeline("x1", "ANALYST", 5)),
    );

    expect(ids(state)).toEqual(["e1", "m1", "x1", "local-2"]);
  });
});

describe("chatReducer: conversationUpdated", () => {
  it("na espera, não trava e mostra o aviso", () => {
    const state = run(active(), updated({ status: "WAITING_ANALYST" }));

    expect(state.lock).toBeNull();
    expect(noticeFor(state)).toBe(
      "Um analista vai continuar o atendimento por aqui.",
    );
  });

  it("com analista, o aviso nomeia quem atende", () => {
    const state = run(
      active(),
      updated({ status: "WITH_ANALYST", analyst: rafael, remainingMessages: 0 }),
    );

    expect(state.lock).toBeNull();
    expect(state.analyst).toEqual(rafael);
    expect(noticeFor(state)).toBe("Rafael Lima está atendendo você por aqui.");
  });

  it("encerrada trava o chat", () => {
    const state = run(active(), updated({ status: "CLOSED", analyst: rafael }));

    expect(state.lock?.message).toBe("Esta conversa foi encerrada.");
    expect(noticeFor(state)).toBeNull();
  });

  it("de volta ao agent sem cota trava no limite", () => {
    const state = run(
      active(),
      updated({ status: "WAITING_ANALYST" }),
      updated({ status: "WITH_AGENT", messageCount: 30, remainingMessages: 0 }),
    );

    expect(state.lock).toEqual({
      message: "Você chegou ao limite de 30 mensagens nesta conversa.",
      allowsDrafts: true,
    });
    expect(state.count).toBe(30);
    expect(noticeFor(state)).toBeNull();
  });

  it("de volta ao agent com cota, destrava e some o aviso", () => {
    const state = run(
      active(),
      updated({ status: "WITH_ANALYST", analyst: rafael }),
      updated({ status: "WITH_AGENT", messageCount: 4, remainingMessages: 26 }),
    );

    expect(state.lock).toBeNull();
    expect(state.analyst).toBeNull();
    expect(noticeFor(state)).toBeNull();
  });

  it("saindo do agent, o rascunho pendente fica indisponível", () => {
    const state = run(
      active({ ticketDraft: draft }),
      updated({ status: "WAITING_ANALYST" }),
    );
    const item = state.items.find((candidate) => candidate.id === "m1");

    expect(item?.kind === "agent" && item.draft?.status).toBe("unavailable");
  });

  it("ignora outra conversa", () => {
    const before = active();
    const state = run(before, {
      type: "conversationUpdated",
      conversation: conversation({ id: "c2", status: "CLOSED" }),
    });

    expect(state).toBe(before);
  });

  it("enfileira durante o turno", () => {
    const state = run(
      active(),
      { type: "sent", id: "local-2", text: "Oi" },
      updated({ status: "CLOSED" }),
    );

    expect(state.lock).toBeNull();
    expect(state.inbox).toHaveLength(1);
  });
});

describe("chatReducer: resynced", () => {
  it("insere só o que falta, em ordem, e preserva rascunho e seleção", () => {
    const base = run(active({ ticketDraft: draft }), {
      type: "draftEdited",
      id: "m1",
      values: {
        kind: "CREATE",
        title: "Editado",
        description: "Erro 809.",
        affectedScope: "INDIVIDUAL",
      },
    });
    const state = run(base, {
      type: "resynced",
      conversation: conversation({ status: "WITH_ANALYST", analyst: rafael }),
      messages: [
        timeline("e1", "EMPLOYEE", 1, "Oi"),
        timeline("m1", "AGENT", 2, "Resposta"),
        timeline("s1", "SYSTEM", 2, "Transferida para um analista", { systemKind: "HANDOFF" }),
        timeline("s2", "SYSTEM", 3, "Rafael assumiu a conversa", { systemKind: "TAKEOVER" }),
        timeline("x1", "ANALYST", 4, "Oi, Ana"),
      ],
    });

    expect(ids(state)).toEqual(["e1", "m1", "s1", "s2", "x1"]);
    const agent = state.items[1];
    expect(agent?.kind === "agent" && agent.draft?.values.kind).toBe("CREATE");
    expect(
      agent?.kind === "agent" &&
        agent.draft?.values.kind === "CREATE" &&
        agent.draft.values.title,
    ).toBe("Editado");
    expect(state.status).toBe("WITH_ANALYST");
  });

  it("encaixa mensagem antiga que faltava no meio", () => {
    const withAnalyst = run(active(), stream(timeline("x2", "ANALYST", 9)));
    const state = run(withAnalyst, {
      type: "resynced",
      conversation: conversation({ status: "WITH_ANALYST", analyst: rafael }),
      messages: [timeline("s1", "SYSTEM", 5, "Rafael assumiu a conversa", { systemKind: "TAKEOVER" })],
    });

    expect(ids(state)).toEqual(["e1", "m1", "s1", "x2"]);
  });

  it("fica na fila durante o turno", () => {
    const state = run(
      active(),
      { type: "sent", id: "local-2", text: "Oi" },
      { type: "resynced", conversation: conversation(), messages: [] },
    );

    expect(state.inbox).toHaveLength(1);
  });
});

describe("chatReducer: conversationLost", () => {
  it("trava e esquece a conversa", () => {
    const lock = { message: "Esta conversa não está mais disponível." };
    const state = run(active(), { type: "conversationLost", lock });

    expect(state.lock).toEqual(lock);
    expect(state.conversationId).toBeUndefined();
  });
});

describe("noticeFor", () => {
  it("sem conversa ou com o agent, não há aviso", () => {
    expect(noticeFor(createInitialChatState())).toBeNull();
    expect(noticeFor(active())).toBeNull();
  });
});
