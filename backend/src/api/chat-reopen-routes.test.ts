import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import type { AgentRunner, AgentTurnResult } from "../chat/agent-runner.js";
import { createChatService } from "../chat/chat-service.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ChatResponse, ConfirmDraftResponse, ProposedTicketDraft } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { computeDueAt } from "../tickets/sla.js";
import { createTicketService, TicketServiceUnavailableError, type FullTicketService } from "../tickets/ticket-service.js";
import type { ApiConfig } from "./config.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const TRACE: AgentTrace = { understood: "x", intent: "REOPEN", actions: [], confidence: "HIGH", reason: "y" };
const DAY = 86_400_000;
const CODE = "INC-77";

describe("rotas de reabertura", () => {
  let client: PrismaClient;
  let url: string;
  let server: Server;
  let llmCalls = 0;
  let respond: () => Promise<AgentTurnResult>;
  let ticketsDown = false;
  let employeeId: string;
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

  async function createTicket(status: "RESOLVED" | "IN_PROGRESS", resolvedDaysAgo = 1) {
    await client.ticket.create({
      data: {
        code: CODE,
        type: "INC",
        category: "SOFTWARE",
        priority: "MEDIUM",
        status,
        title: "Excel fecha sozinho",
        description: "Original",
        affectedScope: "INDIVIDUAL",
        ownerId: employeeId,
        resolvedAt: status === "RESOLVED" ? new Date(Date.now() - resolvedDaysAgo * DAY) : null,
        dueAt: status === "RESOLVED" ? null : new Date(Date.now() + DAY),
      },
    });
  }

  const proposal = (code = CODE): ProposedTicketDraft => ({
    kind: "REOPEN",
    reason: "Voltou a fechar sozinho.",
    ticket: {
      code,
      type: "INC",
      category: "SOFTWARE",
      priority: "LOW",
      status: "RESOLVED",
      statusLabel: "inventado",
      title: "Título inventado",
      createdAt: new Date().toISOString(),
      dueAt: null,
      overdue: false,
      canReopen: true,
    },
  });

  async function chatWith(draft: ProposedTicketDraft) {
    respond = () => Promise.resolve({ content: "Confirma a reabertura?", trace: TRACE, ticketLookup: null, ticketDraft: draft, quickReplies: ["Sim"] });
    const res = await post("/chat", { message: "voltou o problema" });
    assert.equal(res.status, 200);
    return (await res.json()) as ChatResponse;
  }

  async function createDraft() {
    const response = await chatWith(proposal());
    assert.ok(response.ticketDraft);
    llmCalls = 0;
    return { conversationId: response.conversation.id, draftId: response.ticketDraft.id, response };
  }

  const confirm = (draftId: string, payload: unknown = { kind: "REOPEN", reason: "Voltou hoje." }, cookie?: string) =>
    post(`/chat/drafts/${draftId}/confirm`, payload, cookie);

  before(async () => {
    client = await createTestDatabase();
    const employee = await client.user.create({ data: { name: "Pessoa", email: "pessoa@teste.example", role: "EMPLOYEE" } });
    const other = await client.user.create({ data: { name: "Outra", email: "outra@teste.example", role: "EMPLOYEE" } });
    const analyst = await client.user.create({ data: { name: "Analista", email: "analista@teste.example", role: "ANALYST" } });
    employeeId = employee.id;
    employeeCookie = await cookieOf(employee.id);
    otherCookie = await cookieOf(other.id);
    analystCookie = await cookieOf(analyst.id);

    const real = createTicketService(client);
    const down = () => Promise.reject(new TicketServiceUnavailableError());
    const tickets: FullTicketService = {
      ...real,
      findResolvedTicketByCode: (...args) => (ticketsDown ? down() : real.findResolvedTicketByCode(...args)),
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
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
    ticketsDown = false;
    llmCalls = 0;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  describe("POST /chat", () => {
    it("devolve o rascunho REOPEN com o chamado do serviço e o prazo previsto pela prioridade original", async () => {
      await createTicket("RESOLVED");
      const before = Date.now();
      const { response, draftId } = await createDraft();
      assert.ok(response.ticketDraft?.kind === "REOPEN");
      const { ticket, reason, dueAtPreview, id } = response.ticketDraft;
      assert.equal(id, draftId);
      assert.equal(reason, "Voltou a fechar sozinho.");
      assert.equal(ticket.title, "Excel fecha sozinho");
      assert.equal(ticket.priority, "MEDIUM");
      assert.equal(ticket.status, "RESOLVED");
      assert.equal(ticket.canReopen, true);
      const preview = new Date(dueAtPreview).getTime();
      assert.ok(preview >= computeDueAt("MEDIUM", new Date(before)).getTime());
      assert.ok(preview <= computeDueAt("MEDIUM", new Date()).getTime());
      assert.deepEqual(response.quickReplies, ["Sim"]);
    });

    const discards: [string, () => Promise<void>, RegExp, string][] = [
      ["chamado ainda aberto", () => createTicket("IN_PROGRESS"), /ainda está aberto/, "SKIPPED"],
      ["resolvido há 8 dias", () => createTicket("RESOLVED", 8), /não pode ser reaberto/, "SKIPPED"],
      ["chamado inexistente ou de outro dono", () => Promise.resolve(), /não pode ser reaberto/, "SKIPPED"],
    ];
    for (const [name, setup, text, status] of discards) {
      it(`descarta a proposta com ${name}, com texto fixo e trace coerente`, async () => {
        await setup();
        const response = await chatWith(proposal());
        assert.equal(response.ticketDraft, null);
        assert.equal(response.quickReplies, null);
        assert.match(response.message.content, text);
        assert.doesNotMatch(response.message.content, /Confirma/);
        assert.equal(response.message.trace.actions.at(-1)?.status, status);
        assert.equal(await client.conversation.count({ where: { pendingDraftId: { not: null } } }), 0);
      });
    }

    it("descarta a proposta com o serviço indisponível, sem derrubar o turno", async () => {
      await createTicket("RESOLVED");
      ticketsDown = true;
      const response = await chatWith(proposal());
      assert.equal(response.ticketDraft, null);
      assert.match(response.message.content, /tente novamente/i);
      assert.equal(response.message.trace.actions.at(-1)?.status, "ERROR");
    });
  });

  describe("POST /chat/drafts/:id/confirm", () => {
    it("reabre sem LLM nem cota e responde com mensagem e chamado", async () => {
      await createTicket("RESOLVED");
      const { conversationId, draftId } = await createDraft();
      const res = await confirm(draftId);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const body = (await res.json()) as ConfirmDraftResponse;
      assert.deepEqual(Object.keys(body).sort(), ["conversation", "message", "ticket"]);
      assert.equal(body.ticket.code, CODE);
      assert.equal(body.ticket.status, "WAITING_ANALYST");
      assert.equal(body.message.trace.actions[0]?.tool, "reopenTicket");
      assert.equal(llmCalls, 0);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).messageCount, 1);
      const [event] = await client.ticketEvent.findMany({ where: { type: "REOPENED" } });
      assert.equal(event?.content, "Voltou hoje.");
    });

    it("responde 409 TICKET_NOT_REOPENABLE quando o chamado já não pode ser reaberto, e mantém o rascunho", async () => {
      await createTicket("RESOLVED");
      const { conversationId, draftId } = await createDraft();
      await client.ticket.updateMany({ data: { resolvedAt: new Date(Date.now() - 8 * DAY) } });
      await assertError(await confirm(draftId), 409, "TICKET_NOT_REOPENABLE");
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, draftId);
    });

    it("em duplo clique reabre uma vez só", async () => {
      await createTicket("RESOLVED");
      const { draftId } = await createDraft();
      const statuses = (await Promise.all([confirm(draftId), confirm(draftId)])).map((res) => res.status).sort();
      assert.deepEqual(statuses, [200, 404]);
      assert.equal(await client.ticketEvent.count({ where: { type: "REOPENED" } }), 1);
    });

    it("com o serviço indisponível responde 503 e mantém o rascunho", async () => {
      await createTicket("RESOLVED");
      const { conversationId, draftId } = await createDraft();
      ticketsDown = true;
      await assertError(await confirm(draftId), 503, "TICKET_SERVICE_UNAVAILABLE");
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, draftId);
      ticketsDown = false;
      assert.equal((await confirm(draftId)).status, 200);
    });

    it("responde 400 para kind diferente do rascunho e 404, 403 e 401", async () => {
      await createTicket("RESOLVED");
      const { draftId } = await createDraft();
      await assertError(await confirm(draftId, { kind: "COMPLEMENT", content: "x" }), 400, "INVALID_REQUEST");
      await assertError(await confirm(draftId, undefined, otherCookie), 404, "DRAFT_NOT_FOUND");
      await assertError(await confirm(draftId, undefined, analystCookie), 403, "FORBIDDEN");
      const noSession = await fetch(`${url}/chat/drafts/${draftId}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "REOPEN", reason: "x" }),
      });
      await assertError(noSession, 401, "SESSION_MISSING");
      assert.equal(await client.ticketEvent.count(), 0);
    });

    const invalid: [string, unknown][] = [
      ["sem motivo", { kind: "REOPEN" }],
      ["motivo vazio", { kind: "REOPEN", reason: "   " }],
      ["motivo longo", { kind: "REOPEN", reason: "a".repeat(2001) }],
      ["motivo com NUL", { kind: "REOPEN", reason: "a\u0000b" }],
      ["campo extra", { kind: "REOPEN", reason: "a", ticketCode: "INC-1" }],
    ];
    for (const [name, payload] of invalid) {
      it(`responde 400 para ${name}`, async () => {
        await assertError(await confirm("d1", payload), 400, "INVALID_REQUEST");
      });
    }
  });

  describe("POST /chat/drafts/:id/cancel", () => {
    it("cancela sem reabrir", async () => {
      await createTicket("RESOLVED");
      const { draftId } = await createDraft();
      assert.equal((await post(`/chat/drafts/${draftId}/cancel`, {})).status, 200);
      assert.equal((await client.ticket.findUniqueOrThrow({ where: { code: CODE } })).status, "RESOLVED");
    });
  });
});
