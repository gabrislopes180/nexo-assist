import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationService, TurnReservation } from "../conversations/conversation-service.js";
import type { ProposedTicketDraft } from "../shared/chat.js";
import { TicketServiceUnavailableError, type TicketCodeReader } from "../tickets/ticket-service.js";
import type { SessionUser } from "../shared/session.js";
import type { AgentTrace } from "../shared/transparency.js";
import { AgentUnavailableError, createProvisionalAgentRunner, type AgentRunner } from "./agent-runner.js";
import { createChatService as createService, EmployeeOnlyError } from "./chat-service.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const employee: SessionUser = { id: "u1", name: "Pessoa", email: "p@teste.example", role: "EMPLOYEE", department: null };
const trace: AgentTrace = { understood: "x", intent: "OTHER", actions: [], confidence: "LOW", reason: "y" };

const reservation: TurnReservation = {
  conversationId: "c1",
  isNew: false,
  employeeMessageId: "m1",
  messageCount: 4,
  status: "WITH_AGENT",
  previousLastMessageAt: NOW,
  history: [],
};

function fakeConversations(overrides: Partial<ConversationService> = {}) {
  const log: string[] = [];
  const conversations: ConversationService = {
    startTurn: () => {
      log.push("startTurn");
      return Promise.resolve(reservation);
    },
    completeTurn: () => {
      log.push("completeTurn");
      return Promise.resolve({ id: "m2", content: "olá", trace, createdAt: NOW, draftId: null });
    },
    readDraft: () => Promise.reject(new Error("não usado aqui")),
    confirmDraft: () => Promise.reject(new Error("não usado aqui")),
    cancelDraft: () => Promise.reject(new Error("não usado aqui")),
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
const unusedTickets: TicketCodeReader = { findOpenTicketByCode: () => Promise.reject(new Error("não usado aqui")) };

type ServiceDeps = Parameters<typeof createService>[0];
const createChatService = (deps: Omit<ServiceDeps, "tickets"> & Partial<Pick<ServiceDeps, "tickets">>) =>
  createService({ tickets: unusedTickets, ...deps });

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
        return Promise.resolve(reservation);
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
        return Promise.resolve(reservation);
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
      conversation: { id: "c1", status: "WITH_AGENT", messageCount: 4, messageLimit: 30, remainingMessages: 26 },
      message: { id: "m2", authorType: "AGENT", content: "olá", trace, createdAt: NOW.toISOString() },
      ticketLookup: null,
      ticketDraft: null,
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
        return Promise.resolve({ id: "m2", content: "olá", trace, createdAt: NOW, draftId: "d1" });
      },
    });
    const agentRunner: AgentRunner = { runTurn: () => Promise.resolve({ content: "olá", trace, ticketLookup: null, ticketDraft }) };
    const tickets: TicketCodeReader = { findOpenTicketByCode: () => Promise.resolve(ticket) };
    const response = await createChatService({ conversations, agentRunner, tickets }).sendMessage(employee, { message: "oi" });
    assert.deepEqual(received, [ticketDraft]);
    assert.deepEqual(response.ticketDraft, { id: "d1", ...ticketDraft });
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
      await assert.rejects(service.confirmDraft(analyst, "d1", { content: "x" }), EmployeeOnlyError);
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
      const tickets: TicketCodeReader = { findOpenTicketByCode: () => Promise.reject(new TicketServiceUnavailableError()) };
      const service = createChatService({ conversations, agentRunner: okRunner, tickets });
      await assert.rejects(service.confirmDraft(employee, "d1", { content: "x" }), TicketServiceUnavailableError);
      assert.deepEqual(calls, []);
    });

    it("não chamam a LLM e devolvem a mensagem serializada", async () => {
      const runner: AgentRunner = { runTurn: () => Promise.reject(new Error("não deveria chamar a LLM")) };
      const ticket = { code: "INC-1" } as never;
      const { conversations } = fakeConversations({
        readDraft: () => Promise.resolve(draft),
        confirmDraft: () => Promise.resolve({ message: stored, ticket }),
        cancelDraft: () => Promise.resolve({ message: stored }),
      });
      const tickets: TicketCodeReader = { findOpenTicketByCode: () => Promise.resolve(ticket) };
      const service = createChatService({ conversations, agentRunner: runner, tickets });
      const view = { id: "m3", authorType: "AGENT", content: "ok", trace, createdAt: NOW.toISOString() };
      assert.deepEqual(await service.confirmDraft(employee, "d1", { content: "x" }), { message: view, ticket });
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

describe("createProvisionalAgentRunner", () => {
  it("lança AgentUnavailableError até o agent existir", async () => {
    await assert.rejects(
      createProvisionalAgentRunner().runTurn({ conversationId: "c", actor: { id: "u", name: "n" }, history: [], message: "m" }),
      AgentUnavailableError,
    );
  });
});
