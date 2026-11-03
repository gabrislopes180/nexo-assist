import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationQueries } from "../conversations/conversation-queries.js";
import type { ConversationService, TurnReservation } from "../conversations/conversation-service.js";
import type { ProposedTicketDraft } from "../shared/chat.js";
import {
  TicketServiceUnavailableError,
  type ResolvedTicketReader,
  type TicketAvailability,
  type TicketCodeReader,
} from "../tickets/ticket-service.js";
import type { SessionUser } from "../shared/session.js";
import { agentTraceSchema, type AgentTrace } from "../shared/transparency.js";
import { AgentUnavailableError, createProvisionalAgentRunner, type AgentRunner } from "./agent-runner.js";
import { createChatService as createService, EmployeeOnlyError } from "./chat-service.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const employee: SessionUser = { id: "u1", name: "Pessoa", email: "p@teste.example", role: "EMPLOYEE", department: null };
const trace: AgentTrace = { understood: "x", intent: "OTHER", actions: [], confidence: "LOW", reason: "y" };

const employeeMessage = {
  id: "m1",
  conversationId: "c1",
  authorType: "EMPLOYEE",
  author: { id: "u1", name: "Pessoa" },
  content: "oi",
  createdAt: NOW,
  trace: null,
} as const;

const reservation: TurnReservation = {
  conversationId: "c1",
  isNew: false,
  employeeMessageId: "m1",
  employeeMessage,
  messageCount: 4,
  status: "WITH_AGENT",
  previousLastMessageAt: NOW,
  returnedToAgentAt: null,
  history: [],
};
const agentTurn = { kind: "AGENT_TURN", reservation } as const;

function fakeConversations(overrides: Partial<ConversationService> = {}) {
  const log: string[] = [];
  const conversations: ConversationService = {
    startTurn: () => {
      log.push("startTurn");
      return Promise.resolve(agentTurn);
    },
    completeTurn: () => {
      log.push("completeTurn");
      return Promise.resolve({ id: "m2", content: "olá", trace, createdAt: NOW, draftId: null, conversationStatus: "WITH_AGENT", systemMessages: [] });
    },
    readDraft: () => Promise.reject(new Error("não usado aqui")),
    confirmDraft: () => Promise.reject(new Error("não usado aqui")),
    cancelDraft: () => Promise.reject(new Error("não usado aqui")),
    takeOver: () => Promise.reject(new Error("não usado aqui")),
    replyAsAnalyst: () => Promise.reject(new Error("não usado aqui")),
    returnToAgent: () => Promise.reject(new Error("não usado aqui")),
    closeAttendance: () => Promise.reject(new Error("não usado aqui")),
    abortTurn: () => {
      log.push("abortTurn");
      return Promise.resolve();
    },
    ...overrides,
  };
  return { conversations, log };
}

const okRunner: AgentRunner = { runTurn: () => Promise.resolve({ content: "olá", trace, ticketLookup: null }) };
const failingRunner: AgentRunner = { runTurn: () => Promise.reject(new AgentUnavailableError()) };
type Tickets = TicketCodeReader & ResolvedTicketReader & TicketAvailability;
const ensureAvailable = () => Promise.resolve();
const unusedTickets: Tickets = {
  findOpenTicketByCode: () => Promise.reject(new Error("não usado aqui")),
  findResolvedTicketByCode: () => Promise.reject(new Error("não usado aqui")),
  ensureAvailable,
};

type ConversationReads = Pick<ConversationQueries, "ownedByEmployee">;
const unusedQueries: ConversationReads = { ownedByEmployee: () => Promise.reject(new Error("não usado aqui")) };

type ServiceDeps = Parameters<typeof createService>[0];
const createChatService = (deps: Omit<ServiceDeps, "tickets" | "queries"> & Partial<Pick<ServiceDeps, "tickets" | "queries">>) =>
  createService({ tickets: unusedTickets, queries: unusedQueries, ...deps });

describe("ChatService", () => {
  it("recusa quem não é funcionário antes de abrir o turno", async () => {
    const { conversations, log } = fakeConversations();
    const service = createChatService({ conversations, agentRunner: okRunner });
    await assert.rejects(service.sendMessage({ ...employee, role: "ANALYST" }, { message: "oi" }), EmployeeOnlyError);
    assert.deepEqual(log, []);
  });

  it("passa o dono da sessão e o conversationId ao abrir o turno", async () => {
    const calls: unknown[][] = [];
    const { conversations } = fakeConversations({
      startTurn: (...args) => {
        calls.push(args);
        return Promise.resolve(agentTurn);
      },
    });
    const service = createChatService({ conversations, agentRunner: okRunner, now: () => NOW });
    await service.sendMessage(employee, { message: "oi", conversationId: "c1" });
    assert.deepEqual(calls, [["u1", { conversationId: "c1", content: "oi", now: NOW }]]);
  });

  it("omite conversationId quando o cliente não informa", async () => {
    const calls: unknown[][] = [];
    const { conversations } = fakeConversations({
      startTurn: (...args) => {
        calls.push(args);
        return Promise.resolve(agentTurn);
      },
    });
    await createChatService({ conversations, agentRunner: okRunner, now: () => NOW }).sendMessage(employee, { message: "oi" });
    assert.deepEqual(calls, [["u1", { content: "oi", now: NOW }]]);
  });

  it("chama a LLM só depois de reservar o turno e monta o envelope", async () => {
    const { conversations, log } = fakeConversations();
    const agentRunner: AgentRunner = {
      runTurn: (input) => {
        log.push(`runTurn:${input.conversationId}`);
        return okRunner.runTurn(input);
      },
    };
    const response = await createChatService({ conversations, agentRunner }).sendMessage(employee, { message: "oi" });
    assert.deepEqual(log, ["startTurn", "runTurn:c1", "completeTurn"]);
    assert.deepEqual(response, {
      conversation: { id: "c1", status: "WITH_AGENT", messageCount: 4, messageLimit: 30, remainingMessages: 26, analyst: null },
      employeeMessage: { id: "m1", authorType: "EMPLOYEE", content: "oi", createdAt: NOW.toISOString() },
      message: { id: "m2", authorType: "AGENT", content: "olá", trace, createdAt: NOW.toISOString() },
      ticketLookup: null,
      ticketDraft: null,
      quickReplies: null,
    });
  });

  it("desfaz o turno e propaga a falha do agent", async () => {
    const { conversations, log } = fakeConversations();
    const service = createChatService({ conversations, agentRunner: failingRunner });
    await assert.rejects(service.sendMessage(employee, { message: "oi" }), AgentUnavailableError);
    assert.deepEqual(log, ["startTurn", "abortTurn"]);
  });

  it("recusa trace inválido do runner: desfaz o turno e não grava a resposta", async () => {
    const { conversations, log } = fakeConversations();
    const invalid = { ...trace, intent: "DELETE_ALL" } as unknown as AgentTrace;
    const agentRunner: AgentRunner = { runTurn: () => Promise.resolve({ content: "olá", trace: invalid, ticketLookup: null }) };
    const service = createChatService({ conversations, agentRunner });
    await assert.rejects(service.sendMessage(employee, { message: "oi" }), AgentUnavailableError);
    assert.deepEqual(log, ["startTurn", "abortTurn"]);
  });

  it("repassa o rascunho proposto ao gravar e devolve no envelope com o id do backend", async () => {
    const ticket = {
      code: "INC-1",
      type: "INC",
      category: "EMAIL",
      priority: "LOW",
      status: "IN_PROGRESS",
      statusLabel: "Em andamento",
      title: "t",
      createdAt: NOW.toISOString(),
      dueAt: null,
      overdue: false,
    } as const;
    const ticketDraft: ProposedTicketDraft = { kind: "COMPLEMENT", ticket, content: "mais" };
    const received: unknown[] = [];
    const { conversations } = fakeConversations({
      completeTurn: (_reservation, reply) => {
        received.push(reply.ticketDraft);
        return Promise.resolve({ id: "m2", content: "olá", trace, createdAt: NOW, draftId: "d1", conversationStatus: "WITH_AGENT", systemMessages: [] });
      },
    });
    const agentRunner: AgentRunner = { runTurn: () => Promise.resolve({ content: "olá", trace, ticketLookup: null, ticketDraft }) };
    const tickets: Tickets = { findOpenTicketByCode: () => Promise.resolve(ticket), findResolvedTicketByCode: unusedTickets.findResolvedTicketByCode, ensureAvailable };
    const response = await createChatService({ conversations, agentRunner, tickets }).sendMessage(employee, { message: "oi" });
    assert.deepEqual(received, [ticketDraft]);
    assert.deepEqual(response.ticketDraft, { id: "d1", ...ticketDraft });
  });

  it("usa no envelope o estado da conversa relido ao fim do turno, não o da reserva", async () => {
    const { conversations } = fakeConversations({
      completeTurn: () => Promise.resolve({ id: "m2", content: "olá", trace, createdAt: NOW, draftId: null, conversationStatus: "WAITING_ANALYST", systemMessages: [] }),
    });
    const agentRunner: AgentRunner = {
      runTurn: () => Promise.resolve({ content: "olá", trace, ticketLookup: null, handoff: { reason: "EMPLOYEE_REQUEST", summary: "Pediu analista." } }),
    };
    const response = await createChatService({ conversations, agentRunner }).sendMessage(employee, { message: "oi" });
    assert.equal(response.conversation.status, "WAITING_ANALYST");
  });

  it("repassa a transferência válida ao completeTurn", async () => {
    const received: unknown[] = [];
    const { conversations } = fakeConversations({
      completeTurn: (_reservation, reply) => {
        received.push(reply.handoff);
        return Promise.resolve({ id: "m2", content: "olá", trace, createdAt: NOW, draftId: null, conversationStatus: "WAITING_ANALYST", systemMessages: [] });
      },
    });
    const handoff = { reason: "LOW_CONFIDENCE", summary: "  Não entendi o pedido.  " } as const;
    const agentRunner: AgentRunner = { runTurn: () => Promise.resolve({ content: "olá", trace, ticketLookup: null, handoff }) };
    await createChatService({ conversations, agentRunner }).sendMessage(employee, { message: "oi" });
    assert.deepEqual(received, [{ reason: "LOW_CONFIDENCE", summary: "Não entendi o pedido." }]);
  });

  it("devolve as respostas rápidas do turno", async () => {
    const { conversations } = fakeConversations();
    const agentRunner: AgentRunner = { runTurn: () => Promise.resolve({ content: "olá", trace, ticketLookup: null, quickReplies: ["Sim", "Não"] }) };
    const response = await createChatService({ conversations, agentRunner }).sendMessage(employee, { message: "oi" });
    assert.deepEqual(response.quickReplies, ["Sim", "Não"]);
  });

  it("ao descartar a proposta troca o texto, ajusta o trace e não deixa respostas rápidas", async () => {
    const ticket = {
      code: "INC-1",
      type: "INC",
      category: "EMAIL",
      priority: "LOW",
      status: "IN_PROGRESS",
      statusLabel: "Em andamento",
      title: "t",
      createdAt: NOW.toISOString(),
      dueAt: null,
      overdue: false,
    } as const;
    const replies: Array<{ content: string; trace: AgentTrace; ticketDraft?: unknown }> = [];
    const { conversations } = fakeConversations({
      completeTurn: (_reservation, reply) => {
        replies.push(reply);
        return Promise.resolve({ id: "m2", content: reply.content, trace: reply.trace, createdAt: NOW, draftId: null, conversationStatus: "WITH_AGENT", systemMessages: [] });
      },
    });
    const agentRunner: AgentRunner = {
      runTurn: () =>
        Promise.resolve({
          content: "Confira e confirme",
          trace,
          ticketLookup: null,
          quickReplies: ["Confirmar"],
          ticketDraft: { kind: "COMPLEMENT", ticket, content: "mais" },
        }),
    };
    const tickets: Tickets = { findOpenTicketByCode: () => Promise.resolve(null), findResolvedTicketByCode: unusedTickets.findResolvedTicketByCode, ensureAvailable };
    const response = await createChatService({ conversations, agentRunner, tickets }).sendMessage(employee, { message: "oi" });
    assert.notEqual(response.message?.content, "Confira e confirme");
    assert.equal(response.ticketDraft, null);
    assert.equal(response.quickReplies, null);
    assert.equal(replies[0]?.ticketDraft, null);
    assert.equal(agentTraceSchema.safeParse(replies[0]?.trace).success, true);
    assert.equal(replies[0]?.trace.actions.at(-1)?.status, "SKIPPED");
  });

  it("devolve ticketDraft null quando o turno não propõe rascunho", async () => {
    const { conversations } = fakeConversations();
    const response = await createChatService({ conversations, agentRunner: okRunner }).sendMessage(employee, { message: "oi" });
    assert.equal(response.ticketDraft, null);
  });

  it("recusa rascunho proposto inválido: desfaz o turno e não grava", async () => {
    const { conversations, log } = fakeConversations();
    const invalid = { kind: "COMPLEMENT", content: "x" } as unknown as ProposedTicketDraft;
    const agentRunner: AgentRunner = { runTurn: () => Promise.resolve({ content: "olá", trace, ticketLookup: null, ticketDraft: invalid }) };
    await assert.rejects(createChatService({ conversations, agentRunner }).sendMessage(employee, { message: "oi" }), AgentUnavailableError);
    assert.deepEqual(log, ["startTurn", "abortTurn"]);
  });

  describe("confirmDraft e cancelDraft", () => {
    const stored = { id: "m3", content: "ok", trace, createdAt: NOW };
    const draft = { draftId: "d1", createdAt: NOW.toISOString(), kind: "COMPLEMENT", ticketCode: "INC-1", content: "c" } as const;

    it("recusam quem não é funcionário", async () => {
      const { conversations } = fakeConversations();
      const service = createChatService({ conversations, agentRunner: okRunner });
      const analyst = { ...employee, role: "ANALYST" } as const;
      await assert.rejects(service.confirmDraft(analyst, "d1", { kind: "COMPLEMENT", content: "x" }), EmployeeOnlyError);
      await assert.rejects(service.cancelDraft(analyst, "d1"), EmployeeOnlyError);
    });

    it("com o serviço indisponível não abre a transação de confirmação", async () => {
      const calls: string[] = [];
      const { conversations } = fakeConversations({
        readDraft: () => Promise.resolve(draft),
        confirmDraft: () => {
          calls.push("confirmDraft");
          return Promise.reject(new Error("não deveria chamar"));
        },
      });
      const tickets: Tickets = { findOpenTicketByCode: () => Promise.reject(new TicketServiceUnavailableError()), findResolvedTicketByCode: unusedTickets.findResolvedTicketByCode, ensureAvailable };
      const service = createChatService({ conversations, agentRunner: okRunner, tickets });
      await assert.rejects(service.confirmDraft(employee, "d1", { kind: "COMPLEMENT", content: "x" }), TicketServiceUnavailableError);
      assert.deepEqual(calls, []);
    });

    it("não chamam a LLM e devolvem a mensagem serializada", async () => {
      const runner: AgentRunner = { runTurn: () => Promise.reject(new Error("não deveria chamar a LLM")) };
      const ticket = { code: "INC-1" } as never;
      const { conversations } = fakeConversations({
        readDraft: () => Promise.resolve(draft),
        confirmDraft: () => Promise.resolve({ message: stored, ticket, conversation: { id: "c1", status: "WITH_AGENT" as const }, systemMessages: [] }),
        cancelDraft: () => Promise.resolve({ message: stored }),
      });
      const tickets: Tickets = { findOpenTicketByCode: () => Promise.resolve(ticket), findResolvedTicketByCode: unusedTickets.findResolvedTicketByCode, ensureAvailable };
      const service = createChatService({ conversations, agentRunner: runner, tickets });
      const view = { id: "m3", authorType: "AGENT", content: "ok", trace, createdAt: NOW.toISOString() };
      assert.deepEqual(await service.confirmDraft(employee, "d1", { kind: "COMPLEMENT", content: "x" }), {
        message: view,
        ticket,
        conversation: { id: "c1", status: "WITH_AGENT" },
      });
      assert.deepEqual(await service.cancelDraft(employee, "d1"), { message: view });
    });
  });

  it("mantém o erro original quando a compensação também falha, e registra sem detalhes do turno", async (t) => {
    const logged = t.mock.method(console, "error", () => undefined);
    const { conversations } = fakeConversations({ abortTurn: () => Promise.reject(new Error("banco fora: mensagem-sensivel")) });
    const service = createChatService({ conversations, agentRunner: failingRunner });
    await assert.rejects(service.sendMessage(employee, { message: "mensagem-sensivel" }), AgentUnavailableError);
    assert.equal(logged.mock.callCount(), 1);
    assert.equal(JSON.stringify(logged.mock.calls[0]?.arguments).includes("mensagem-sensivel"), false);
  });

  it("desfaz o turno quando gravar a resposta falha, sem tentar de novo", async () => {
    const attempts: string[] = [];
    const { conversations, log } = fakeConversations({
      completeTurn: () => {
        attempts.push("completeTurn");
        return Promise.reject(new Error("falha ao gravar"));
      },
    });
    const service = createChatService({ conversations, agentRunner: okRunner });
    await assert.rejects(service.sendMessage(employee, { message: "oi" }), /falha ao gravar/);
    assert.equal(attempts.length, 1);
    assert.deepEqual(log, ["startTurn", "abortTurn"]);
  });
});

describe("ChatService.getConversation", () => {
  const { conversations } = fakeConversations();
  const snapshot = {
    id: "c1",
    status: "WITH_ANALYST",
    owner: { id: "u1", name: "Pessoa", department: null },
    analyst: { id: "a1", name: "Bruno Martins" },
    messageCount: 31,
    handoffReason: "EMPLOYEE_REQUEST",
    handoffSummary: "pediu analista",
    handoffAt: NOW,
    assignedAt: NOW,
    returnedToAgentAt: null,
    lastMessageAt: NOW,
    closedAt: null,
  } as const;

  it("recusa quem não é funcionário sem ler a conversa", async () => {
    const reads: string[] = [];
    const queries: ConversationReads = { ownedByEmployee: (ownerId) => (reads.push(ownerId), Promise.reject(new Error("não deveria ler"))) };
    const service = createChatService({ conversations, agentRunner: okRunner, queries });
    await assert.rejects(service.getConversation({ ...employee, role: "ANALYST" }, "c1"), EmployeeOnlyError);
    assert.deepEqual(reads, []);
  });

  it("lê com o dono da sessão e serializa conversa e mensagens", async () => {
    const reads: unknown[][] = [];
    const queries: ConversationReads = {
      ownedByEmployee: (...args) => (reads.push(args), Promise.resolve({ snapshot, messages: [employeeMessage] })),
    };
    const service = createChatService({ conversations, agentRunner: okRunner, queries });
    const view = await service.getConversation(employee, "c1");
    assert.deepEqual(reads, [["u1", "c1"]]);
    assert.deepEqual(view.conversation, {
      id: "c1",
      status: "WITH_ANALYST",
      messageCount: 31,
      messageLimit: 30,
      remainingMessages: 0,
      analyst: { id: "a1", name: "Bruno Martins" },
    });
    assert.deepEqual(view.messages, [
      { id: "m1", authorType: "EMPLOYEE", author: { id: "u1", name: "Pessoa" }, content: "oi", createdAt: NOW.toISOString(), trace: null },
    ]);
  });
});

describe("createProvisionalAgentRunner", () => {
  it("lança AgentUnavailableError até o agent existir", async () => {
    await assert.rejects(
      createProvisionalAgentRunner().runTurn({ conversationId: "c", actor: { id: "u", name: "n" }, history: [], message: "m", returnedFromAnalyst: false }),
      AgentUnavailableError,
    );
  });
});
