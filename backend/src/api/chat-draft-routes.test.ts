import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import { AgentUnavailableError, type AgentRunner, type AgentTurnResult } from "../chat/agent-runner.js";
import { createChatService } from "../chat/chat-service.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ChatResponse, ConfirmDraftResponse, ProposedTicketDraft, TicketSummary } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { createTicketService, TicketServiceUnavailableError, type TicketCodeReader } from "../tickets/ticket-service.js";
import type { ApiConfig } from "./config.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const TRACE: AgentTrace = { understood: "x", intent: "COMPLEMENT", actions: [], confidence: "HIGH", reason: "y" };
const CODE = "INC-55";

describe("rotas de rascunho do chat", () => {
  let client: PrismaClient;
  let url: string;
  let server: Server;
  let llmCalls = 0;
  let respond: () => Promise<AgentTurnResult>;
  let ticketsDown = false;
  let employeeCookie: string;
  let otherCookie: string;
  let analystCookie: string;
  let summary: TicketSummary;

  const cookieOf = async (userId: string) => `nexo_session=${await issueSessionToken({ userId, secret: SECRET, now: new Date() })}`;
  const proposal = (): ProposedTicketDraft => ({ kind: "COMPLEMENT", ticket: summary, content: "Proposta do agent" });

  function post(path: string, body: unknown, cookie: string | undefined = employeeCookie): Promise<Response> {
    return fetch(`${url}${path}`, {
      method: "POST",
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }

  const confirm = (id: string, content: unknown = "Texto confirmado", cookie?: string) => post(`/chat/drafts/${id}/confirm`, { content }, cookie);
  const cancel = (id: string, cookie?: string) => post(`/chat/drafts/${id}/cancel`, undefined, cookie);

  async function assertError(res: Response, status: number, code: string) {
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, code);
  }

  async function createDraft() {
    respond = () => Promise.resolve({ content: "Confirma?", trace: TRACE, ticketLookup: null, ticketDraft: proposal() });
    const body = (await (await post("/chat", { message: "complementa" })).json()) as ChatResponse;
    assert.ok(body.ticketDraft);
    llmCalls = 0;
    return { conversationId: body.conversation.id, draftId: body.ticketDraft.id };
  }

  before(async () => {
    client = await createTestDatabase();
    const employee = await client.user.create({ data: { name: "Pessoa", email: "pessoa@teste.example", role: "EMPLOYEE" } });
    const other = await client.user.create({ data: { name: "Outra", email: "outra@teste.example", role: "EMPLOYEE" } });
    const analyst = await client.user.create({ data: { name: "Analista", email: "analista@teste.example", role: "ANALYST" } });
    employeeCookie = await cookieOf(employee.id);
    otherCookie = await cookieOf(other.id);
    analystCookie = await cookieOf(analyst.id);

    await client.ticket.create({
      data: {
        code: CODE,
        type: "INC",
        category: "EMAIL",
        priority: "LOW",
        status: "IN_PROGRESS",
        title: "Outlook",
        description: "Original",
        affectedScope: "INDIVIDUAL",
        ownerId: employee.id,
        dueAt: new Date(Date.now() + 86_400_000),
      },
    });
    const real = createTicketService(client);
    const found = await real.findOpenTicketByCode(employee.id, CODE, new Date());
    assert.ok(found);
    summary = found;

    const tickets: TicketCodeReader = {
      findOpenTicketByCode: (...args) => (ticketsDown ? Promise.reject(new TicketServiceUnavailableError()) : real.findOpenTicketByCode(...args)),
    };
    const agentRunner: AgentRunner = {
      runTurn: () => {
        llmCalls++;
        return respond();
      },
    };
    const chatService = createChatService({ conversations: createConversationService(client), agentRunner, tickets });
    server = createApp({ config, authService: createAuthService(client), chatService }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.conversation.deleteMany();
    await client.ticket.updateMany({ data: { status: "IN_PROGRESS" } });
    ticketsDown = false;
    llmCalls = 0;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  describe("POST /chat", () => {
    it("devolve ticketDraft com id gerado no backend", async () => {
      respond = () => Promise.resolve({ content: "Confirma?", trace: TRACE, ticketLookup: null, ticketDraft: proposal() });
      const body = (await (await post("/chat", { message: "complementa" })).json()) as ChatResponse;
      assert.ok(body.ticketDraft?.id);
      assert.deepEqual(body.ticketDraft, { id: body.ticketDraft.id, ...proposal() });
    });

    it("usa o resumo do serviço, não o da proposta, e grava o código canônico", async () => {
      const tampered = { ...proposal(), ticket: { ...summary, code: CODE.toLowerCase(), title: "Título inventado" } };
      respond = () => Promise.resolve({ content: "Confirma?", trace: TRACE, ticketLookup: null, ticketDraft: tampered });
      const body = (await (await post("/chat", { message: "complementa" })).json()) as ChatResponse;
      assert.deepEqual(body.ticketDraft?.ticket, summary);
      assert.ok(body.ticketDraft);
      assert.equal((await confirm(body.ticketDraft.id)).status, 200);
    });

    it("descarta proposta de chamado alheio, sem derrubar o turno", async () => {
      const foreign = { ...proposal(), ticket: { ...summary, code: "INC-999" } };
      respond = () => Promise.resolve({ content: "Confirma?", trace: TRACE, ticketLookup: null, ticketDraft: foreign });
      const res = await post("/chat", { message: "complementa" });
      assert.equal(res.status, 200);
      const body = (await res.json()) as ChatResponse;
      assert.equal(body.ticketDraft, null);
      assert.equal(await client.conversation.count({ where: { pendingDraftId: { not: null } } }), 0);
    });

    it("descarta a proposta com o serviço de chamados indisponível, sem derrubar o turno", async () => {
      ticketsDown = true;
      respond = () => Promise.resolve({ content: "Confirma?", trace: TRACE, ticketLookup: null, ticketDraft: proposal() });
      const res = await post("/chat", { message: "complementa" });
      assert.equal(res.status, 200);
      assert.equal(((await res.json()) as ChatResponse).ticketDraft, null);
    });

    it("devolve ticketDraft null sem rascunho no turno", async () => {
      respond = () => Promise.resolve({ content: "Oi", trace: TRACE, ticketLookup: null });
      assert.equal(((await (await post("/chat", { message: "oi" })).json()) as ChatResponse).ticketDraft, null);
    });

    it("com a LLM falhando não deixa rascunho", async () => {
      const { conversationId, draftId } = await createDraft();
      respond = () => Promise.reject(new AgentUnavailableError());
      await assertError(await post("/chat", { message: "outra", conversationId }), 503, "AGENT_UNAVAILABLE");
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, draftId);

      await client.conversation.deleteMany();
      await assertError(await post("/chat", { message: "nova" }), 503, "AGENT_UNAVAILABLE");
      assert.equal(await client.conversation.count({ where: { pendingDraftId: { not: null } } }), 0);
    });
  });

  describe("POST /chat/drafts/:id/confirm", () => {
    it("confirma sem chamar a LLM nem consumir cota, com o texto do body", async () => {
      const { conversationId, draftId } = await createDraft();
      const res = await confirm(draftId);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const body = (await res.json()) as ConfirmDraftResponse;
      assert.deepEqual(Object.keys(body).sort(), ["message", "ticket"]);
      assert.equal(body.ticket.code, CODE);
      assert.equal(body.message.authorType, "AGENT");
      assert.equal(llmCalls, 0);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).messageCount, 1);
      const [event] = await client.ticketEvent.findMany();
      assert.equal(event?.content, "Texto confirmado");
    });

    it("responde 404 igual para inexistente, usado e de outro dono", async () => {
      const { draftId } = await createDraft();
      const missing = await confirm("nao-existe");
      const foreign = await confirm(draftId, "x", otherCookie);
      assert.equal(foreign.status, 404);
      const expected = (await missing.json()) as { error: { code: string } };
      assert.equal(expected.error.code, "DRAFT_NOT_FOUND");
      assert.deepEqual(await foreign.json(), expected);
      assert.equal((await confirm(draftId)).status, 200);
      const used = await confirm(draftId);
      assert.equal(used.status, 404);
      assert.deepEqual(await used.json(), expected);
    });

    it("responde 409 TICKET_NOT_OPEN e mantém o rascunho", async () => {
      const { conversationId, draftId } = await createDraft();
      await client.ticket.updateMany({ data: { status: "RESOLVED" } });
      await assertError(await confirm(draftId), 409, "TICKET_NOT_OPEN");
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, draftId);
    });

    it("responde 409 CONVERSATION_NOT_WITH_AGENT", async () => {
      const { conversationId, draftId } = await createDraft();
      await client.conversation.update({ where: { id: conversationId }, data: { status: "WITH_ANALYST" } });
      await assertError(await confirm(draftId), 409, "CONVERSATION_NOT_WITH_AGENT");
    });

    it("informa o estado da conversa antes do estado do chamado ou do serviço", async () => {
      const { conversationId, draftId } = await createDraft();
      await client.conversation.update({ where: { id: conversationId }, data: { status: "WITH_ANALYST" } });
      await client.ticket.updateMany({ data: { status: "RESOLVED" } });
      await assertError(await confirm(draftId), 409, "CONVERSATION_NOT_WITH_AGENT");
      ticketsDown = true;
      await assertError(await confirm(draftId), 409, "CONVERSATION_NOT_WITH_AGENT");
    });

    it("em duplo clique grava um único evento", async () => {
      const { draftId } = await createDraft();
      const statuses = (await Promise.all([confirm(draftId), confirm(draftId)])).map((res) => res.status).sort();
      assert.deepEqual(statuses, [200, 404]);
      assert.equal(await client.ticketEvent.count(), 1);
    });

    it("com o serviço indisponível responde 503 e permite tentar de novo", async () => {
      const { conversationId, draftId } = await createDraft();
      ticketsDown = true;
      await assertError(await confirm(draftId), 503, "TICKET_SERVICE_UNAVAILABLE");
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, draftId);
      assert.equal(await client.ticketEvent.count(), 0);
      ticketsDown = false;
      assert.equal((await confirm(draftId)).status, 200);
    });

    const invalid: [string, unknown][] = [
      ["sem content", {}],
      ["content vazio", { content: "   " }],
      ["content longo", { content: "a".repeat(2001) }],
      ["content com NUL", { content: "a\u0000b" }],
      ["campo extra", { content: "a", ticketCode: "INC-1" }],
    ];
    for (const [name, body] of invalid) {
      it(`responde 400 para ${name}`, async () => {
        await assertError(await post("/chat/drafts/d1/confirm", body), 400, "INVALID_REQUEST");
      });
    }

    it("responde 401 sem sessão e 403 para analista", async () => {
      const { draftId } = await createDraft();
      const res = await fetch(`${url}/chat/drafts/${draftId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: "x" }),
      });
      await assertError(res, 401, "SESSION_MISSING");
      await assertError(await post(`/chat/drafts/${draftId}/confirm`, { content: "x" }, "nexo_session=lixo"), 401, "SESSION_INVALID");
      await assertError(await confirm(draftId, "x", analystCookie), 403, "FORBIDDEN");
      assert.equal(await client.ticketEvent.count(), 0);
    });
  });

  describe("POST /chat/drafts/:id/cancel", () => {
    it("cancela com body vazio, sem chamar a LLM nem gravar evento", async () => {
      const { conversationId, draftId } = await createDraft();
      const res = await cancel(draftId);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const body = (await res.json()) as { message: { authorType: string } };
      assert.deepEqual(Object.keys(body), ["message"]);
      assert.equal(body.message.authorType, "AGENT");
      assert.equal(llmCalls, 0);
      assert.equal(await client.ticketEvent.count(), 0);
      const conversation = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.pendingDraftId, null);
      assert.equal(conversation.messageCount, 1);
    });

    it("funciona com o serviço de chamados indisponível", async () => {
      const { draftId } = await createDraft();
      ticketsDown = true;
      assert.equal((await cancel(draftId)).status, 200);
    });

    it("recusa body com campos", async () => {
      await assertError(await post("/chat/drafts/d1/cancel", { motivo: "x" }), 400, "INVALID_REQUEST");
    });

    it("responde 404, 409, 401 e 403", async () => {
      const { conversationId, draftId } = await createDraft();
      await assertError(await cancel("nao-existe"), 404, "DRAFT_NOT_FOUND");
      await assertError(await cancel(draftId, otherCookie), 404, "DRAFT_NOT_FOUND");
      await assertError(await cancel(draftId, analystCookie), 403, "FORBIDDEN");
      await assertError(await fetch(`${url}/chat/drafts/${draftId}/cancel`, { method: "POST" }), 401, "SESSION_MISSING");
      await client.conversation.update({ where: { id: conversationId }, data: { status: "CLOSED" } });
      await assertError(await cancel(draftId), 409, "CONVERSATION_NOT_WITH_AGENT");
    });
  });
});
