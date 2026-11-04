import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createEventBus } from "../realtime/event-bus.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import type { AgentRunner } from "../chat/agent-runner.js";
import { createChatService } from "../chat/chat-service.js";
import { createConsoleService } from "../console/console-service.js";
import { createConversationQueries } from "../conversations/conversation-queries.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus } from "../generated/prisma/enums.js";
import type { ConsoleConversation, ConsoleTickets, TimelineMessageView } from "../shared/console.js";
import { createTicketService, TicketServiceUnavailableError, type FullTicketService } from "../tickets/ticket-service.js";
import type { ApiConfig } from "./config.js";
import { unusedConsoleTicketService, unusedKnowledgeService } from "./test-support.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const T0 = new Date(Date.now() - 60 * 60_000);

describe("rotas do console do analista", () => {
  let client: PrismaClient;
  let url: string;
  let server: Server;
  let ticketsDown = false;
  let ownerId: string;
  let brunoId: string;
  let bruno: string;
  let rafael: string;
  let ana: string;
  let other: string;

  const cookieOf = async (userId: string) => `nexo_session=${await issueSessionToken({ userId, secret: SECRET, now: new Date() })}`;

  function request(method: "GET" | "POST", path: string, cookie: string | undefined, body?: unknown): Promise<Response> {
    return fetch(`${url}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const get = (path: string, cookie: string | undefined = bruno) => request("GET", path, cookie);
  const post = (path: string, cookie: string | undefined = bruno, body?: unknown) => request("POST", path, cookie, body);

  async function assertError(res: Response, status: number, code: string) {
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, code);
  }

  function createConversation(status: ConversationStatus = "WAITING_ANALYST", extra: Record<string, unknown> = {}) {
    const handoff = status === "WITH_AGENT" ? {} : { handoffReason: "OVERDUE" as const, handoffSummary: "INC-50 vencido.", handoffAt: T0 };
    const assigned = status === "WITH_ANALYST" ? { analystId: brunoId, assignedAt: T0 } : {};
    return client.conversation.create({ data: { ownerId, status, messageCount: 2, lastMessageAt: T0, ...handoff, ...assigned, ...extra } });
  }

  const json = async <T>(res: Response): Promise<T> => {
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(res.headers.get("cache-control"), "no-store");
    return (await res.json()) as T;
  };

  before(async () => {
    client = await createTestDatabase();
    ownerId = (await client.user.create({ data: { name: "Ana Souza", email: "ana@teste.example", role: "EMPLOYEE", department: "Financeiro" } })).id;
    brunoId = (await client.user.create({ data: { name: "Bruno Martins", email: "bruno@teste.example", role: "ANALYST" } })).id;
    const rafaelId = (await client.user.create({ data: { name: "Rafael Lima", email: "rafael@teste.example", role: "ANALYST" } })).id;
    bruno = await cookieOf(brunoId);
    rafael = await cookieOf(rafaelId);
    ana = await cookieOf(ownerId);
    other = await cookieOf((await client.user.create({ data: { name: "Outra Pessoa", email: "outra@teste.example", role: "EMPLOYEE" } })).id);

    const real = createTicketService(client);
    const tickets: FullTicketService = {
      ...real,
      listOwnerTickets: (...args) => (ticketsDown ? Promise.reject(new TicketServiceUnavailableError()) : real.listOwnerTickets(...args)),
    };
    const conversations = createConversationService(client);
    const agentRunner: AgentRunner = { runTurn: () => Promise.reject(new Error("a LLM não deveria ser chamada")) };
    const chatService = createChatService({ queries: createConversationQueries(client), conversations, agentRunner, tickets });
    const consoleService = createConsoleService({ conversations, queries: createConversationQueries(client), tickets });
    server = createApp({ eventBus: createEventBus(), config, authService: createAuthService(client), chatService, consoleService, consoleTicketService: unusedConsoleTicketService, knowledgeService: unusedKnowledgeService }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
    ticketsDown = false;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  describe("sessão e papel", () => {
    it("responde 401 sem cookie e 403 para funcionário em todas as rotas", async () => {
      const { id } = await createConversation();
      const routes: Array<["GET" | "POST", string]> = [
        ["GET", "/console/conversations"],
        ["GET", `/console/conversations/${id}`],
        ["GET", `/console/conversations/${id}/messages`],
        ["GET", `/console/conversations/${id}/tickets`],
        ["POST", `/console/conversations/${id}/takeover`],
        ["POST", `/console/conversations/${id}/return`],
        ["POST", `/console/conversations/${id}/close`],
      ];
      for (const [method, path] of routes) {
        await assertError(await request(method, path, undefined), 401, "SESSION_MISSING");
        await assertError(await request(method, path, ana), 403, "FORBIDDEN");
      }
      await assertError(await post(`/console/conversations/${id}/messages`, ana, { content: "oi" }), 403, "FORBIDDEN");
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id } })).status, "WAITING_ANALYST");
    });

    it("checa sessão e papel antes de validar query: 401 sem cookie e 403 para funcionário com filter inválido", async () => {
      for (const path of ["/console/conversations?filter=x", "/console/conversations?outro=1"]) {
        await assertError(await request("GET", path, undefined), 401, "SESSION_MISSING");
        await assertError(await get(path, ana), 403, "FORBIDDEN");
      }
    });

    it("checa sessão e papel antes de validar corpo: 401 sem cookie e 403 para funcionário com corpo inválido", async () => {
      const { id } = await createConversation();
      const cases: Array<[string, unknown]> = [
        [`/console/conversations/${id}/messages`, { content: "  " }],
        [`/console/conversations/${id}/messages`, { content: "oi", analystId: "x" }],
        [`/console/conversations/${id}/takeover`, { analystId: "x" }],
        [`/console/conversations/${id}/return`, { analystId: "x" }],
        [`/console/conversations/${id}/close`, { analystId: "x" }],
      ];
      for (const [path, body] of cases) {
        await assertError(await request("POST", path, undefined, body), 401, "SESSION_MISSING");
        await assertError(await post(path, ana, body), 403, "FORBIDDEN");
      }
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id } })).status, "WAITING_ANALYST");
    });
  });

  describe("leituras", () => {
    it("lista com a conversa completa e assumedToMe calculado por sessão", async () => {
      const { id } = await createConversation("WITH_ANALYST");
      await client.message.create({ data: { conversationId: id, authorType: "EMPLOYEE", authorId: ownerId, content: "oi", createdAt: T0 } });
      const asBruno = await json<{ conversations: ConsoleConversation[] }>(await get("/console/conversations"));
      const asRafael = await json<{ conversations: ConsoleConversation[] }>(await get("/console/conversations", rafael));
      const [conversation] = asBruno.conversations;
      assert.equal(conversation?.assignedToMe, true);
      assert.equal(asRafael.conversations[0]?.assignedToMe, false);
      assert.deepEqual(conversation?.owner, { id: ownerId, name: "Ana Souza", department: "Financeiro" });
      assert.deepEqual(conversation?.analyst, { id: brunoId, name: "Bruno Martins" });
      assert.equal(conversation?.assignedAt, T0.toISOString());
      assert.equal(conversation?.messageCount, 2);
      assert.equal(conversation?.messageLimit, 30);
      assert.equal(conversation?.lastMessage?.content, "oi");
      assert.equal(conversation?.handoffReason, "OVERDUE");
    });

    it("aceita filter e q, e responde 400 para filter inválido ou campo extra", async () => {
      await createConversation();
      assert.equal((await json<{ conversations: unknown[] }>(await get("/console/conversations?filter=waiting&q=ana"))).conversations.length, 1);
      assert.equal((await json<{ conversations: unknown[] }>(await get("/console/conversations?filter=mine"))).conversations.length, 0);
      await assertError(await get("/console/conversations?filter=x"), 400, "INVALID_REQUEST");
      await assertError(await get("/console/conversations?outro=1"), 400, "INVALID_REQUEST");
    });

    it("detalhe e mensagens; inexistente ou id longo dá 404", async () => {
      const { id } = await createConversation();
      await client.message.create({ data: { conversationId: id, authorType: "SYSTEM", content: "Transferida para um analista", createdAt: T0 } });
      assert.equal((await json<{ conversation: ConsoleConversation }>(await get(`/console/conversations/${id}`))).conversation.id, id);
      const { messages } = await json<{ messages: TimelineMessageView[] }>(await get(`/console/conversations/${id}/messages`));
      assert.deepEqual(messages.map((m) => [m.authorType, m.author, m.trace]), [["SYSTEM", null, null]]);
      for (const path of ["nao-existe", "a".repeat(65)]) {
        await assertError(await get(`/console/conversations/${path}`), 404, "CONVERSATION_NOT_FOUND");
        await assertError(await get(`/console/conversations/${path}/messages`), 404, "CONVERSATION_NOT_FOUND");
      }
    });

    it("chamados: o da conversa separado dos outros do dono; 503 com o serviço fora, e a lista continua 200", async () => {
      for (const [code, status] of [["INC-50", "WAITING_ANALYST"], ["INC-51", "RESOLVED"]] as const) {
        await client.ticket.create({
          data: { code, type: "INC", category: "HARDWARE", priority: "MEDIUM", status, title: code, description: "d", affectedScope: "INDIVIDUAL", ownerId, ...(status === "RESOLVED" ? { resolvedAt: T0 } : {}) },
        });
      }
      const { id } = await createConversation();
      const tickets = await json<ConsoleTickets>(await get(`/console/conversations/${id}/tickets`));
      assert.equal(tickets.conversationTicket?.code, "INC-50");
      assert.deepEqual(tickets.otherTickets.map((t) => [t.code, t.status, t.resolvedAt]), [["INC-51", "RESOLVED", T0.toISOString()]]);

      ticketsDown = true;
      await assertError(await get(`/console/conversations/${id}/tickets`), 503, "TICKET_SERVICE_UNAVAILABLE");
      assert.equal((await get("/console/conversations")).status, 200);
    });
  });

  describe("GET /chat/conversations/:id", () => {
    it("o dono vê a conversa e todas as mensagens, com o autor do analista", async () => {
      const { id } = await createConversation();
      await post(`/console/conversations/${id}/takeover`);
      await post(`/console/conversations/${id}/messages`, bruno, { content: "Oi, Ana!" });
      const body = await json<{ conversation: { id: string; status: string; analyst: unknown; messageCount: number }; messages: TimelineMessageView[] }>(
        await get(`/chat/conversations/${id}`, ana),
      );
      assert.equal(body.conversation.id, id);
      assert.equal(body.conversation.status, "WITH_ANALYST");
      assert.deepEqual(body.conversation.analyst, { id: brunoId, name: "Bruno Martins" });
      assert.deepEqual(body.messages.map((m) => [m.authorType, m.content, m.author?.name ?? null]), [
        ["SYSTEM", "Bruno assumiu a conversa", null],
        ["ANALYST", "Oi, Ana!", "Bruno Martins"],
      ]);
    });

    it("outro funcionário recebe 404 igual a inexistente, e o analista recebe 403", async () => {
      const { id } = await createConversation();
      await assertError(await get(`/chat/conversations/${id}`, other), 404, "CONVERSATION_NOT_FOUND");
      await assertError(await get("/chat/conversations/nao-existe", ana), 404, "CONVERSATION_NOT_FOUND");
      await assertError(await get(`/chat/conversations/${id}`, bruno), 403, "FORBIDDEN");
      await assertError(await request("GET", `/chat/conversations/${id}`, undefined), 401, "SESSION_MISSING");
    });
  });

  describe("ações", () => {
    it("assumir, responder, e o funcionário vê a resposta com o autor", async () => {
      const { id } = await createConversation();
      const taken = await json<{ conversation: ConsoleConversation }>(await post(`/console/conversations/${id}/takeover`));
      assert.equal(taken.conversation.status, "WITH_ANALYST");
      assert.equal(taken.conversation.assignedToMe, true);

      const replied = await json<{ message: TimelineMessageView; conversation: ConsoleConversation }>(
        await post(`/console/conversations/${id}/messages`, bruno, { content: "  Oi, Ana!  " }),
      );
      assert.equal(replied.message.authorType, "ANALYST");
      assert.equal(replied.message.content, "Oi, Ana!");
      assert.deepEqual(replied.message.author, { id: brunoId, name: "Bruno Martins" });
      assert.equal(replied.conversation.lastMessage?.content, "Oi, Ana!");
    });

    it("segundo analista: assumir dá 409 NOT_WAITING e responder dá 409 NOT_ASSIGNED", async () => {
      const { id } = await createConversation();
      await post(`/console/conversations/${id}/takeover`);
      await assertError(await post(`/console/conversations/${id}/takeover`, rafael), 409, "CONVERSATION_NOT_WAITING");
      await assertError(await post(`/console/conversations/${id}/messages`, rafael, { content: "oi" }), 409, "CONVERSATION_NOT_ASSIGNED");
      await assertError(await post(`/console/conversations/${id}/close`, rafael), 409, "CONVERSATION_NOT_ASSIGNED");
      await assertError(await post(`/console/conversations/${id}/return`, rafael), 409, "CONVERSATION_NOT_WAITING");
    });

    it("assumir de novo pelo mesmo analista é 200 sem nova SYSTEM", async () => {
      const { id } = await createConversation();
      await post(`/console/conversations/${id}/takeover`);
      assert.equal((await post(`/console/conversations/${id}/takeover`)).status, 200);
      assert.equal(await client.message.count({ where: { conversationId: id, authorType: "SYSTEM" } }), 1);
    });

    it("devolver leva a WITH_AGENT, e a segunda devolução dá 409", async () => {
      const { id } = await createConversation();
      const returned = await json<{ conversation: ConsoleConversation }>(await post(`/console/conversations/${id}/return`));
      assert.equal(returned.conversation.status, "WITH_AGENT");
      assert.equal(returned.conversation.handoffReason, null);
      await assertError(await post(`/console/conversations/${id}/return`), 409, "CONVERSATION_NOT_WAITING");
    });

    it("encerrar é idempotente, e o funcionário passa a receber 409 CONVERSATION_CLOSED", async () => {
      const { id } = await createConversation("WITH_ANALYST");
      const closed = await json<{ conversation: ConsoleConversation }>(await post(`/console/conversations/${id}/close`));
      assert.equal(closed.conversation.status, "CLOSED");
      assert.equal((await post(`/console/conversations/${id}/close`)).status, 200);
      assert.equal(await client.message.count({ where: { conversationId: id, authorType: "SYSTEM" } }), 1);
      const res = await request("POST", "/chat", ana, { message: "oi", conversationId: id });
      await assertError(res, 409, "CONVERSATION_CLOSED");
    });

    it("responder sem assumir dá 409, e conversa inexistente dá 404", async () => {
      const { id } = await createConversation();
      await assertError(await post(`/console/conversations/${id}/messages`, bruno, { content: "oi" }), 409, "CONVERSATION_NOT_ASSIGNED");
      await assertError(await post("/console/conversations/nao-existe/takeover"), 404, "CONVERSATION_NOT_FOUND");
    });

    const invalid: [string, unknown][] = [
      ["content vazio", { content: "  " }],
      ["content longo", { content: "a".repeat(2001) }],
      ["content com NUL", { content: "a\u0000b" }],
      ["campo extra", { content: "oi", analystId: "x" }],
    ];
    for (const [name, body] of invalid) {
      it(`responder com ${name} dá 400`, async () => {
        const { id } = await createConversation("WITH_ANALYST");
        await assertError(await post(`/console/conversations/${id}/messages`, bruno, body), 400, "INVALID_REQUEST");
      });
    }

    it("ações com corpo dá 400", async () => {
      const { id } = await createConversation();
      await assertError(await post(`/console/conversations/${id}/takeover`, bruno, { analystId: "x" }), 400, "INVALID_REQUEST");
    });
  });
});
