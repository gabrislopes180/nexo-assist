import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import { AgentUnavailableError, type AgentRunner, type AgentTurnInput, type AgentTurnResult } from "../chat/agent-runner.js";
import { createChatService } from "../chat/chat-service.js";
import { createConversationService, type ConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus } from "../generated/prisma/enums.js";
import type { ChatResponse, TicketLookupResult } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { createTicketService } from "../tickets/ticket-service.js";
import type { ApiConfig } from "./config.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const LAST_MESSAGE_AT = new Date("2026-10-01T12:00:00.000Z");

const TRACE: AgentTrace = {
  understood: "Quer saber do chamado",
  intent: "CHECK_TICKET",
  actions: [{ tool: "searchMyOpenTickets", summary: "Consultou os chamados", status: "SUCCESS" }],
  confidence: "HIGH",
  reason: "Pedido explícito",
};

const LOOKUP: TicketLookupResult = {
  outcome: "SINGLE_MATCH",
  openTicketCount: 3,
  totalMatches: 1,
  tickets: [
    {
      code: "INC-20311",
      type: "INC",
      category: "HARDWARE",
      priority: "MEDIUM",
      status: "WAITING_ANALYST",
      statusLabel: "Aguardando analista",
      title: "Notebook lento",
      createdAt: "2026-10-30T12:00:00.000Z",
      dueAt: "2026-10-31T12:00:00.000Z",
      overdue: true,
    },
  ],
};

const reply = (overrides: Partial<AgentTurnResult> = {}): AgentTurnResult => ({
  content: "Seu chamado está aguardando analista.",
  trace: TRACE,
  ticketLookup: null,
  ...overrides,
});

/** Runner roteirizado: registra as entradas e responde o que o teste definir. */
function fakeRunner() {
  const state = {
    inputs: [] as AgentTurnInput[],
    respond: (): Promise<AgentTurnResult> => Promise.resolve(reply()),
    runner: undefined as unknown as AgentRunner,
  };
  state.runner = {
    runTurn(input) {
      state.inputs.push(input);
      return state.respond();
    },
  };
  return state;
}

describe("POST /chat", () => {
  let client: PrismaClient;
  let url: string;
  let server: Server;
  let conversations: ConversationService;
  let completeTurnFailure: Error | null = null;
  const agent = fakeRunner();
  let employeeCookie: string;
  let employeeId: string;
  let otherEmployeeId: string;
  let analystCookie: string;

  async function cookieOf(userId: string) {
    return `nexo_session=${await issueSessionToken({ userId, secret: SECRET, now: new Date() })}`;
  }

  function post(body: unknown, cookie: string | undefined = employeeCookie): Promise<Response> {
    return fetch(`${url}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(body),
    });
  }

  function createConversation(overrides: { status?: ConversationStatus; messageCount?: number; ownerId?: string } = {}) {
    return client.conversation.create({
      data: {
        ownerId: overrides.ownerId ?? employeeId,
        status: overrides.status ?? "WITH_AGENT",
        messageCount: overrides.messageCount ?? 0,
        lastMessageAt: LAST_MESSAGE_AT,
      },
    });
  }

  async function assertError(res: Response, status: number, code: string) {
    assert.equal(res.status, status);
    const body = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(body.error.code, code);
    assert.ok(body.error.message.length > 0);
  }

  async function assertRefusedWithoutEffects(res: Response, status: number, code: string, conversationId: string, messageCount: number) {
    await assertError(res, status, code);
    assert.equal(agent.inputs.length, 0, "a LLM não deveria ser chamada");
    const stored = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(stored.messageCount, messageCount);
    assert.equal(await client.message.count({ where: { conversationId } }), 0);
  }

  before(async () => {
    client = await createTestDatabase();
    const employee = await client.user.create({ data: { name: "Pessoa Funcionária", email: "pessoa@teste.example", role: "EMPLOYEE" } });
    const other = await client.user.create({ data: { name: "Outra Pessoa", email: "outra@teste.example", role: "EMPLOYEE" } });
    const analyst = await client.user.create({ data: { name: "Analista", email: "analista@teste.example", role: "ANALYST" } });
    employeeId = employee.id;
    otherEmployeeId = other.id;
    employeeCookie = await cookieOf(employee.id);
    analystCookie = await cookieOf(analyst.id);

    const real = createConversationService(client);
    conversations = {
      ...real,
      completeTurn: (reservation, message) =>
        completeTurnFailure ? Promise.reject(completeTurnFailure) : real.completeTurn(reservation, message),
    };
    const chatService = createChatService({ conversations, agentRunner: agent.runner, tickets: createTicketService(client) });
    server = createApp({ config, authService: createAuthService(client), chatService }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await client.conversation.deleteMany();
    agent.inputs.length = 0;
    agent.respond = () => Promise.resolve(reply());
    completeTurnFailure = null;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  describe("sucesso", () => {
    it("sem conversationId cria a conversa e devolve o envelope", async () => {
      const res = await post({ message: "  Cadê meu chamado?  " });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const body = (await res.json()) as ChatResponse;

      assert.deepEqual(Object.keys(body).sort(), ["conversation", "message", "ticketDraft", "ticketLookup"]);
      assert.deepEqual(body.conversation, {
        id: body.conversation.id,
        status: "WITH_AGENT",
        messageCount: 1,
        messageLimit: 30,
        remainingMessages: 29,
      });
      assert.equal(body.message.authorType, "AGENT");
      assert.equal(body.message.content, "Seu chamado está aguardando analista.");
      assert.deepEqual(body.message.trace, TRACE);
      assert.equal(new Date(body.message.createdAt).toISOString(), body.message.createdAt);
      assert.equal(body.ticketLookup, null);
      assert.equal(body.ticketDraft, null);

      const messages = await client.message.findMany({ where: { conversationId: body.conversation.id }, orderBy: { createdAt: "asc" } });
      assert.deepEqual(messages.map((m) => [m.authorType, m.content]), [
        ["EMPLOYEE", "Cadê meu chamado?"],
        ["AGENT", "Seu chamado está aguardando analista."],
      ]);
      assert.equal(messages[1]?.id, body.message.id);
    });

    it("com conversationId continua e entrega o histórico ao runner", async () => {
      const first = (await (await post({ message: "primeira" })).json()) as ChatResponse;
      agent.inputs.length = 0;
      const res = await post({ message: "segunda", conversationId: first.conversation.id });
      assert.equal(res.status, 200);
      const body = (await res.json()) as ChatResponse;
      assert.equal(body.conversation.id, first.conversation.id);
      assert.equal(body.conversation.messageCount, 2);
      assert.equal(body.conversation.remainingMessages, 28);
      assert.deepEqual(agent.inputs, [
        {
          conversationId: first.conversation.id,
          actor: { id: employeeId, name: "Pessoa Funcionária" },
          history: [
            { authorType: "EMPLOYEE", content: "primeira" },
            { authorType: "AGENT", content: "Seu chamado está aguardando analista." },
          ],
          message: "segunda",
        },
      ]);
    });

    it("devolve ticketLookup exatamente como veio do runner", async () => {
      agent.respond = () => Promise.resolve(reply({ ticketLookup: LOOKUP }));
      const body = (await (await post({ message: "oi" })).json()) as ChatResponse;
      assert.deepEqual(body.ticketLookup, LOOKUP);
    });

    it("aceita a 30ª mensagem com remainingMessages 0 sem encerrar", async () => {
      const { id } = await createConversation({ messageCount: 29 });
      const body = (await (await post({ message: "última", conversationId: id })).json()) as ChatResponse;
      assert.equal(body.conversation.messageCount, 30);
      assert.equal(body.conversation.remainingMessages, 0);
      assert.equal(body.conversation.status, "WITH_AGENT");
    });
  });

  describe("validação", () => {
    const invalidBodies: [string, unknown][] = [
      ["sem message", {}],
      ["message vazia", { message: "   " }],
      ["message longa", { message: "a".repeat(2001) }],
      ["message de outro tipo", { message: 1 }],
      ["campo extra", { message: "oi", ownerId: "outro" }],
      ["conversationId vazio", { message: "oi", conversationId: "" }],
      ["conversationId longo", { message: "oi", conversationId: "a".repeat(65) }],
    ];
    for (const [name, body] of invalidBodies) {
      it(`responde 400 para ${name}`, async () => {
        const res = await post(body);
        assert.equal(res.headers.get("cache-control"), "no-store");
        await assertError(res, 400, "INVALID_REQUEST");
        assert.equal(agent.inputs.length, 0);
      });
    }

    it("responde 400 para JSON malformado", async () => {
      const res = await fetch(`${url}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: employeeCookie },
        body: '{"message":',
      });
      await assertError(res, 400, "INVALID_REQUEST");
    });
  });

  describe("sessão e papel", () => {
    it("responde 401 SESSION_MISSING sem cookie", async () => {
      const res = await fetch(`${url}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      await assertError(res, 401, "SESSION_MISSING");
    });

    it("responde 401 SESSION_INVALID com cookie inválido", async () => {
      await assertError(await post({ message: "oi" }, "nexo_session=lixo"), 401, "SESSION_INVALID");
    });

    it("responde 403 para analista, sem criar conversa nem chamar a LLM", async () => {
      await assertError(await post({ message: "oi" }, analystCookie), 403, "FORBIDDEN");
      assert.equal(agent.inputs.length, 0);
      assert.equal(await client.conversation.count(), 0);
    });
  });

  describe("estado da conversa", () => {
    it("responde 404 para conversa inexistente", async () => {
      await assertError(await post({ message: "oi", conversationId: "nao-existe" }), 404, "CONVERSATION_NOT_FOUND");
      assert.equal(agent.inputs.length, 0);
    });

    it("responde igual para conversa de outro dono, sem efeitos", async () => {
      const { id } = await createConversation({ ownerId: otherEmployeeId, messageCount: 2 });
      const missing = await post({ message: "oi", conversationId: "nao-existe" });
      const foreign = await post({ message: "oi", conversationId: id });
      assert.deepEqual(await foreign.json(), await missing.json());
      assert.equal(foreign.status, 404);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id } })).messageCount, 2);
      assert.equal(await client.message.count({ where: { conversationId: id } }), 0);
    });

    it("responde 409 na 31ª mensagem, sem gravar nem chamar a LLM", async () => {
      const { id } = await createConversation({ messageCount: 30 });
      const res = await post({ message: "oi", conversationId: id });
      await assertRefusedWithoutEffects(res, 409, "CONVERSATION_MESSAGE_LIMIT_REACHED", id, 30);
    });

    it("responde 409 para conversa encerrada", async () => {
      const { id } = await createConversation({ status: "CLOSED", messageCount: 2 });
      const res = await post({ message: "oi", conversationId: id });
      await assertRefusedWithoutEffects(res, 409, "CONVERSATION_CLOSED", id, 2);
    });

    for (const status of ["WAITING_ANALYST", "WITH_ANALYST"] as const) {
      it(`responde 409 para conversa em ${status}`, async () => {
        const { id } = await createConversation({ status, messageCount: 2 });
        const res = await post({ message: "oi", conversationId: id });
        await assertRefusedWithoutEffects(res, 409, "CONVERSATION_NOT_WITH_AGENT", id, 2);
      });
    }
  });

  describe("falhas", () => {
    it("responde 503 e apaga a conversa nova quando o agent falha", async () => {
      agent.respond = () => Promise.reject(new AgentUnavailableError());
      await assertError(await post({ message: "oi" }), 503, "AGENT_UNAVAILABLE");
      assert.equal(await client.conversation.count(), 0);
      assert.equal(await client.message.count(), 0);
    });

    it("responde 503 e desfaz só o turno na conversa existente", async () => {
      const { id } = await createConversation({ messageCount: 2 });
      agent.respond = () => Promise.reject(new AgentUnavailableError());
      await assertError(await post({ message: "oi", conversationId: id }), 503, "AGENT_UNAVAILABLE");
      const stored = await client.conversation.findUniqueOrThrow({ where: { id } });
      assert.equal(stored.messageCount, 2);
      assert.deepEqual(stored.lastMessageAt, LAST_MESSAGE_AT);
      assert.equal(await client.message.count({ where: { conversationId: id } }), 0);
    });

    it("permite tentar de novo depois da falha na 30ª mensagem", async () => {
      const { id } = await createConversation({ messageCount: 29 });
      agent.respond = () => Promise.reject(new AgentUnavailableError());
      await assertError(await post({ message: "oi", conversationId: id }), 503, "AGENT_UNAVAILABLE");
      agent.respond = () => Promise.resolve(reply());
      assert.equal((await post({ message: "oi", conversationId: id })).status, 200);
    });

    it("não repassa o erro do provedor ao cliente", async () => {
      const detail = "chave-do-provedor-nao-vazar";
      agent.respond = () => Promise.reject(new AgentUnavailableError());
      const res = await post({ message: detail });
      assert.equal((await res.text()).includes(detail), false);
    });

    it("responde 500 e desfaz o turno se o runner falhar de outro jeito", async (t) => {
      t.mock.method(console, "error", () => undefined);
      agent.respond = () => Promise.reject(new Error("falha inesperada"));
      await assertError(await post({ message: "oi" }), 500, "INTERNAL_ERROR");
      assert.equal(await client.conversation.count(), 0);
    });

    it("responde 500 e desfaz o turno, sem retry, se gravar a resposta falhar", async (t) => {
      t.mock.method(console, "error", () => undefined);
      const { id } = await createConversation({ messageCount: 2 });
      completeTurnFailure = new Error("falha ao gravar");
      await assertError(await post({ message: "oi", conversationId: id }), 500, "INTERNAL_ERROR");
      assert.equal(agent.inputs.length, 1);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id } })).messageCount, 2);
      assert.equal(await client.message.count({ where: { conversationId: id } }), 0);
    });

    it("nunca registra o conteúdo da mensagem no log", async (t) => {
      const logged = t.mock.method(console, "error", () => undefined);
      const secret = "conteudo-sensivel-da-mensagem";
      agent.respond = () => Promise.reject(new Error(`falha com ${secret}`));
      await post({ message: secret });
      assert.equal(JSON.stringify(logged.mock.calls.map((call) => call.arguments.map(String))).includes(secret), false);
    });
  });
});
