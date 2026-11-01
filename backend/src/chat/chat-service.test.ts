import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ConversationService, TurnReservation } from "../conversations/conversation-service.js";
import type { SessionUser } from "../shared/session.js";
import type { AgentTrace } from "../shared/transparency.js";
import { AgentUnavailableError, createProvisionalAgentRunner, type AgentRunner } from "./agent-runner.js";
import { createChatService, EmployeeOnlyError } from "./chat-service.js";

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
      return Promise.resolve({ id: "m2", content: "olá", trace, createdAt: NOW });
    },
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
