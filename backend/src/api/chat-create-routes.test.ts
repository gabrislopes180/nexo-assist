import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createEventBus } from "../realtime/event-bus.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import type { AgentRunner, AgentTurnResult } from "../chat/agent-runner.js";
import { createChatService } from "../chat/chat-service.js";
import { createConversationQueries } from "../conversations/conversation-queries.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ChatResponse, ConfirmDraftResponse, ProposedTicketDraft } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { createTicketService, TicketServiceUnavailableError, type ResolvedTicketReader, type TicketAvailability, type TicketCodeReader } from "../tickets/ticket-service.js";
import type { ApiConfig } from "./config.js";
import { unusedConsoleService, unusedConsoleTicketService, unusedKnowledgeService } from "./test-support.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const TRACE: AgentTrace = { understood: "x", intent: "OPEN_TICKET", actions: [], confidence: "HIGH", reason: "y" };

const proposal: ProposedTicketDraft = {
  kind: "CREATE",
  type: "REQ",
  category: "SOFTWARE",
  priority: "LOW",
  priorityReason: "Pedido sem urgência.",
  title: "Licença do Power BI",
  description: "Preciso de uma licença Pro.",
  affectedScope: "INDIVIDUAL",
};

const body = {
  kind: "CREATE",
  title: "Licença do Power BI Pro",
  description: "Preciso de uma licença Pro para o time.",
  affectedScope: "TEAM",
  affectedDescription: "Time de dados",
};

describe("rotas de criação de chamado", () => {
  let client: PrismaClient;
  let url: string;
  let server: Server;
  let llmCalls = 0;
  let respond: () => Promise<AgentTurnResult>;
  let ticketsDown = false;
  let employeeCookie: string;
  let otherCookie: string;
  let analystCookie: string;

  const cookieOf = async (userId: string) => `nexo_session=${await issueSessionToken({ userId, secret: SECRET, now: new Date() })}`;

  function post(path: string, payload: unknown, cookie: string | undefined = employeeCookie): Promise<Response> {
    return fetch(`${url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: JSON.stringify(payload),
    });
  }

  async function assertError(res: Response, status: number, code: string) {
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, code);
  }

  async function createDraft() {
    respond = () => Promise.resolve({ content: "Confirma?", trace: TRACE, ticketLookup: null, ticketDraft: proposal, quickReplies: ["Sim", "Não"] });
    const response = (await (await post("/chat", { message: "preciso de licença" })).json()) as ChatResponse;
    assert.ok(response.ticketDraft);
    llmCalls = 0;
    return { conversationId: response.conversation.id, draftId: response.ticketDraft.id, response };
  }

  before(async () => {
    client = await createTestDatabase();
    const employee = await client.user.create({ data: { name: "Pessoa", email: "pessoa@teste.example", role: "EMPLOYEE" } });
    const other = await client.user.create({ data: { name: "Outra", email: "outra@teste.example", role: "EMPLOYEE" } });
    const analyst = await client.user.create({ data: { name: "Analista", email: "analista@teste.example", role: "ANALYST" } });
    employeeCookie = await cookieOf(employee.id);
    otherCookie = await cookieOf(other.id);
    analystCookie = await cookieOf(analyst.id);

    const real = createTicketService(client);
    const tickets: TicketCodeReader & ResolvedTicketReader & TicketAvailability = {
      findResolvedTicketByCode: (...args) => real.findResolvedTicketByCode(...args),
      findOpenTicketByCode: (...args) => real.findOpenTicketByCode(...args),
      ensureAvailable: () => (ticketsDown ? Promise.reject(new TicketServiceUnavailableError()) : real.ensureAvailable()),
    };
    const agentRunner: AgentRunner = {
      runTurn: () => {
        llmCalls++;
        return respond();
      },
    };
    const chatService = createChatService({ queries: createConversationQueries(client), conversations: createConversationService(client), agentRunner, tickets });
    server = createApp({ eventBus: createEventBus(), config, authService: createAuthService(client), chatService, consoleService: unusedConsoleService, consoleTicketService: unusedConsoleTicketService, knowledgeService: unusedKnowledgeService }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
    await client.ticketCounter.deleteMany();
    await client.ticketCounter.createMany({ data: [{ type: "INC", lastNumber: 0 }, { type: "REQ", lastNumber: 40 }] });
    ticketsDown = false;
    llmCalls = 0;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  describe("POST /chat", () => {
    it("devolve o rascunho CREATE com dueAtPreview, sem priorityReason, e as respostas rápidas", async () => {
      const { response, draftId } = await createDraft();
      assert.ok(response.ticketDraft?.kind === "CREATE");
      const { dueAtPreview, ...draft } = response.ticketDraft;
      assert.equal(new Date(dueAtPreview).toISOString(), dueAtPreview);
      assert.ok(new Date(dueAtPreview) > new Date());
      const { priorityReason: _reason, ...visible } = proposal as Extract<ProposedTicketDraft, { kind: "CREATE" }>;
      assert.deepEqual(draft, { id: draftId, ...visible });
      assert.deepEqual(response.quickReplies, ["Sim", "Não"]);
    });

    it("aplica o teto de prioridade ao gravar o rascunho", async () => {
      const critical = { ...proposal, priority: "CRITICAL" } as ProposedTicketDraft;
      respond = () => Promise.resolve({ content: "Confirma?", trace: TRACE, ticketLookup: null, ticketDraft: critical });
      const response = (await (await post("/chat", { message: "urgente" })).json()) as ChatResponse;
      assert.ok(response.ticketDraft?.kind === "CREATE");
      assert.equal(response.ticketDraft.priority, "HIGH");
    });

    it("devolve quickReplies null sem respostas rápidas", async () => {
      respond = () => Promise.resolve({ content: "Oi", trace: TRACE, ticketLookup: null });
      assert.equal(((await (await post("/chat", { message: "oi" })).json()) as ChatResponse).quickReplies, null);
    });

    it("não depende do serviço de chamados para propor CREATE", async () => {
      ticketsDown = true;
      const { response } = await createDraft();
      assert.equal(response.ticketDraft?.kind, "CREATE");
    });
  });

  describe("POST /chat/drafts/:id/confirm", () => {
    it("cria o chamado sem LLM nem cota e responde com mensagem e chamado", async () => {
      const { conversationId, draftId } = await createDraft();
      const res = await post(`/chat/drafts/${draftId}/confirm`, body);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const confirmed = (await res.json()) as ConfirmDraftResponse;
      assert.deepEqual(Object.keys(confirmed).sort(), ["conversation", "message", "ticket"]);
      assert.equal(confirmed.ticket.code, "REQ-41");
      assert.equal(confirmed.ticket.title, body.title);
      assert.equal(confirmed.ticket.type, "REQ");
      assert.equal(confirmed.ticket.category, "SOFTWARE");
      assert.equal(confirmed.ticket.priority, "LOW");
      assert.match(confirmed.message.content, /REQ-41/);
      assert.equal(llmCalls, 0);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).messageCount, 1);
    });

    it("sem linha no contador responde 500 e mantém o rascunho", async (t) => {
      t.mock.method(console, "error", () => undefined);
      const { conversationId, draftId } = await createDraft();
      await client.ticketCounter.delete({ where: { type: "REQ" } });
      await assertError(await post(`/chat/drafts/${draftId}/confirm`, body), 500, "INTERNAL_ERROR");
      assert.equal(await client.ticket.count(), 0);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, draftId);
    });

    it("em duplo clique grava um único chamado", async () => {
      const { draftId } = await createDraft();
      const [first, second] = await Promise.all([post(`/chat/drafts/${draftId}/confirm`, body), post(`/chat/drafts/${draftId}/confirm`, body)]);
      assert.deepEqual([first?.status, second?.status].sort(), [200, 404]);
      assert.equal(await client.ticket.count(), 1);
    });

    it("responde 400 para body com kind diferente do rascunho, sem efeitos", async () => {
      const { draftId } = await createDraft();
      await assertError(await post(`/chat/drafts/${draftId}/confirm`, { kind: "COMPLEMENT", content: "x" }), 400, "INVALID_REQUEST");
      assert.equal(await client.ticket.count(), 0);
      assert.equal((await post(`/chat/drafts/${draftId}/confirm`, body)).status, 200);
    });

    it("com o serviço indisponível responde 503, mantém o rascunho e permite tentar de novo", async () => {
      const { conversationId, draftId } = await createDraft();
      ticketsDown = true;
      await assertError(await post(`/chat/drafts/${draftId}/confirm`, body), 503, "TICKET_SERVICE_UNAVAILABLE");
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, draftId);
      assert.equal(await client.ticket.count(), 0);
      ticketsDown = false;
      assert.equal((await post(`/chat/drafts/${draftId}/confirm`, body)).status, 200);
    });

    it("responde 404 para rascunho inexistente, usado ou de outro dono", async () => {
      const { draftId } = await createDraft();
      await assertError(await post("/chat/drafts/nao-existe/confirm", body), 404, "DRAFT_NOT_FOUND");
      await assertError(await post(`/chat/drafts/${draftId}/confirm`, body, otherCookie), 404, "DRAFT_NOT_FOUND");
      assert.equal((await post(`/chat/drafts/${draftId}/confirm`, body)).status, 200);
      await assertError(await post(`/chat/drafts/${draftId}/confirm`, body), 404, "DRAFT_NOT_FOUND");
    });

    it("responde 409 com a conversa fora do agent, 403 para analista e 401 sem sessão", async () => {
      const { conversationId, draftId } = await createDraft();
      await assertError(await post(`/chat/drafts/${draftId}/confirm`, body, analystCookie), 403, "FORBIDDEN");
      const noSession = await fetch(`${url}/chat/drafts/${draftId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      await assertError(noSession, 401, "SESSION_MISSING");
      await client.conversation.update({ where: { id: conversationId }, data: { status: "WITH_ANALYST" } });
      await assertError(await post(`/chat/drafts/${draftId}/confirm`, body), 409, "CONVERSATION_NOT_WITH_AGENT");
    });

    const invalid: [string, unknown][] = [
      ["sem kind", { title: "a", description: "b", affectedScope: "TEAM" }],
      ["kind desconhecido", { ...body, kind: "REOPEN" }],
      ["título longo", { ...body, title: "a".repeat(121) }],
      ["descrição longa", { ...body, description: "a".repeat(2001) }],
      ["título com NUL", { ...body, title: "a\u0000b" }],
      ["escopo inválido", { ...body, affectedScope: "MUNDO" }],
      ["tentativa de mudar a prioridade", { ...body, priority: "CRITICAL" }],
      ["tentativa de mudar a categoria", { ...body, category: "EMAIL" }],
      ["tentativa de mudar o tipo", { ...body, type: "INC" }],
      ["tentativa de escolher o dono", { ...body, ownerId: "outro" }],
    ];
    for (const [name, payload] of invalid) {
      it(`responde 400 para ${name}`, async () => {
        await assertError(await post("/chat/drafts/d1/confirm", payload), 400, "INVALID_REQUEST");
      });
    }
  });

  describe("POST /chat/drafts/:id/cancel", () => {
    it("cancela sem consumir número, e o próximo chamado usa o número seguinte", async () => {
      const { draftId } = await createDraft();
      const res = await post(`/chat/drafts/${draftId}/cancel`, {});
      assert.equal(res.status, 200);
      assert.equal(await client.ticket.count(), 0);
      const next = await createDraft();
      const confirmed = (await (await post(`/chat/drafts/${next.draftId}/confirm`, body)).json()) as ConfirmDraftResponse;
      assert.equal(confirmed.ticket.code, "REQ-41");
    });
  });
});
