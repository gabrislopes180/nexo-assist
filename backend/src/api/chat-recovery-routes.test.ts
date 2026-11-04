import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp, type AppDeps } from "../app.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import type { AgentRunner, AgentTurnInput, AgentTurnResult } from "../chat/agent-runner.js";
import { createChatService } from "../chat/chat-service.js";
import { createConversationQueries } from "../conversations/conversation-queries.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ActiveChatConversation, ChatResponse, ProposedTicketDraft } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { createEventBus } from "../realtime/event-bus.js";
import { createTicketService } from "../tickets/ticket-service.js";
import { unusedConsoleService, unusedConsoleTicketService, unusedKnowledgeService } from "./test-support.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const TRACE: AgentTrace = { understood: "Entendi o pedido", intent: "OTHER", actions: [], confidence: "HIGH", reason: "Pedido do funcionário" };
const proposal: ProposedTicketDraft = {
  kind: "CREATE", type: "INC", category: "NETWORK_VPN", priority: "HIGH", priorityReason: "afeta só você",
  title: "VPN falhando", description: "Erro 809 no notebook azul", affectedScope: "INDIVIDUAL",
};

describe("retomada autenticada de conversa", () => {
  let client: PrismaClient;
  let server: Server;
  let url: string;
  let deps: AppDeps;
  let cookie: string;
  let analystCookie: string;
  const inputs: AgentTurnInput[] = [];
  let reply: AgentTurnResult;
  const runner: AgentRunner = { runTurn: async (input) => { inputs.push(input); return reply; } };
  const chat = () => createChatService({ conversations: createConversationService(client), queries: createConversationQueries(client), tickets: createTicketService(client), agentRunner: runner });
  const get = (auth: string | null = cookie, suffix = "active") => fetch(`${url}/chat/conversations/${suffix}`, { headers: auth ? { Cookie: auth } : {} });
  const post = async (path: string, body: unknown) => fetch(`${url}${path}`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const snapshot = async () => {
    const res = await get();
    assert.equal(res.status, 200);
    return await res.json() as ActiveChatConversation;
  };

  before(async () => {
    client = await createTestDatabase();
    await client.user.createMany({ data: [
      { id: "u1", name: "Pessoa", email: "p@teste.example", role: "EMPLOYEE" },
      { id: "u2", name: "Outra", email: "o@teste.example", role: "EMPLOYEE" },
      { id: "a1", name: "Analista", email: "a@teste.example", role: "ANALYST" },
    ] });
    cookie = `nexo_session=${await issueSessionToken({ userId: "u1", secret: SECRET, now: new Date() })}`;
    analystCookie = `nexo_session=${await issueSessionToken({ userId: "a1", secret: SECRET, now: new Date() })}`;
    deps = {
      config: { sessionSecret: SECRET, corsOrigins: [], isProduction: false },
      authService: createAuthService(client), chatService: chat(), eventBus: createEventBus(),
      consoleService: unusedConsoleService, consoleTicketService: unusedConsoleTicketService, knowledgeService: unusedKnowledgeService,
    };
    server = createApp(deps).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
    await client.ticketCounter.upsert({ where: { type: "INC" }, create: { type: "INC", lastNumber: 0 }, update: { lastNumber: 0 } });
    inputs.length = 0;
    reply = { content: "Entendido", trace: TRACE, ticketLookup: null };
    deps.chatService = chat();
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  it("ausência é explícita e não cria conversa nem chama o agent", async () => {
    const res = await get();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.deepEqual(await res.json(), { conversation: null, messages: [], pendingDraft: null });
    assert.equal(await client.conversation.count(), 0);
    assert.equal(inputs.length, 0);
  });

  it("recusa sessão ausente e analista; /active não cai na rota de ID", async () => {
    assert.equal((await get(null)).status, 401);
    assert.equal((await get(analystCookie)).status, 403);
  });

  it("escolhe a mais ativa com desempate por ID, sem encerradas ou outros donos, preservando a cota", async () => {
    const at = new Date();
    await client.conversation.createMany({ data: [
      { id: "c-a", ownerId: "u1", status: "WITH_AGENT", lastMessageAt: at },
      { id: "c-z", ownerId: "u1", status: "WITH_ANALYST", analystId: "a1", messageCount: 30, lastMessageAt: at },
      { id: "c-closed", ownerId: "u1", status: "CLOSED", lastMessageAt: new Date(at.getTime() + 1000) },
      { id: "c-other", ownerId: "u2", status: "WITH_AGENT", lastMessageAt: new Date(at.getTime() + 2000) },
    ] });
    const restored = await snapshot();
    assert.equal(restored.conversation?.id, "c-z");
    assert.equal(restored.conversation?.status, "WITH_ANALYST");
    assert.equal(restored.conversation?.remainingMessages, 0);
    assert.equal(restored.conversation?.analyst?.id, "a1");
    assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: "c-z" } })).lastMessageAt.getTime(), at.getTime());
    assert.equal(inputs.length, 0);
    await client.conversation.update({ where: { id: "c-z" }, data: { status: "CLOSED" } });
    assert.equal((await snapshot()).conversation?.id, "c-a");
    assert.equal((await get(cookie, "c-other")).status, 404);
  });

  for (const status of ["WAITING_ANALYST", "WITH_ANALYST"] as const) {
    it(`retoma ${status} e a mensagem seguinte continua sem LLM`, async () => {
      await client.conversation.create({ data: { id: "human", ownerId: "u1", status, ...(status === "WITH_ANALYST" ? { analystId: "a1" } : {}) } });
      const restored = await snapshot();
      assert.equal(restored.conversation?.status, status);
      const res = await post("/chat", { conversationId: restored.conversation!.id, message: "Ainda aguardo" });
      assert.equal(res.status, 200);
      assert.equal((await res.json() as ChatResponse).message, null);
      assert.equal(inputs.length, 0);
    });
  }

  it("recupera apenas pelo dono autenticado mesmo com userId na query", async () => {
    await client.conversation.create({ data: { ownerId: "u2", status: "WITH_AGENT" } });
    const res = await get(cookie, "active?userId=u2");
    assert.equal(res.status, 200);
    assert.equal((await res.json() as ActiveChatConversation).conversation, null);
  });

  it("restaura rascunho pelo id, confirma uma vez e não reativa a proposta consumida", async () => {
    reply = { content: "Confira", trace: { ...TRACE, actions: [{ tool: "draftTicket", summary: "Preparou proposta", status: "SUCCESS" }] }, ticketLookup: null, ticketDraft: proposal };
    const res = await post("/chat", { message: "Minha VPN falhou; só eu" });
    assert.equal(res.status, 200);
    const original = await res.json() as ChatResponse;
    const restored = await snapshot();
    assert.equal(restored.pendingDraft?.draft.id, original.ticketDraft?.id);
    assert.equal(restored.pendingDraft?.messageId, original.message?.id);
    assert.deepEqual(restored.messages.find((m) => m.id === original.message?.id)?.trace, original.message?.trace);
    const id = restored.pendingDraft!.draft.id;
    const body = { kind: "CREATE", title: "VPN falhando", description: "Erro 809", affectedScope: "INDIVIDUAL" };
    assert.equal((await post(`/chat/drafts/${id}/confirm`, body)).status, 200);
    assert.equal((await snapshot()).pendingDraft, null);
    assert.equal((await post(`/chat/drafts/${id}/confirm`, body)).status, 404);
    assert.equal(await client.ticket.count(), 1);
    assert.equal(inputs.length, 1, "recuperar e confirmar não chamam a LLM");
    const history = await snapshot();
    assert.ok(history.messages.some((m) => m.trace?.attachments?.ticket?.code === "INC-1"));
  });

  it("não restaura proposta substituída, cancelada ou descartada por transferência", async () => {
    reply = { content: "Confira", trace: { ...TRACE, actions: [{ tool: "draftTicket", summary: "Preparou proposta", status: "SUCCESS" }] }, ticketLookup: null, ticketDraft: proposal };
    const first = await (await post("/chat", { message: "VPN falhou" })).json() as ChatResponse;
    const second = await (await post("/chat", { conversationId: first.conversation.id, message: "Ajuste o título" })).json() as ChatResponse;
    assert.equal((await snapshot()).pendingDraft?.draft.id, second.ticketDraft?.id);
    assert.notEqual(second.ticketDraft?.id, first.ticketDraft?.id);
    assert.equal((await post(`/chat/drafts/${second.ticketDraft!.id}/cancel`, {})).status, 200);
    assert.equal((await snapshot()).pendingDraft, null);
    await post("/chat", { conversationId: first.conversation.id, message: "Prepare de novo" });
    reply = { content: "Transferida", trace: TRACE, ticketLookup: null, handoff: { reason: "EMPLOYEE_REQUEST", summary: "Pediu ajuda humana" } };
    await post("/chat", { conversationId: first.conversation.id, message: "Quero um analista" });
    const restored = await snapshot();
    assert.equal(restored.conversation?.status, "WAITING_ANALYST");
    assert.equal(restored.pendingDraft, null);
  });

  it("o próximo turno usa histórico do banco mesmo depois de recriar os serviços", async () => {
    const first = await (await post("/chat", { message: "Meu notebook é azul" })).json() as ChatResponse;
    deps.chatService = chat(); // Nenhuma memória da instância anterior participa da retomada.
    const restored = await snapshot();
    assert.equal(restored.conversation?.id, first.conversation.id);
    const res = await post("/chat", { conversationId: restored.conversation!.id, message: "Qual a cor?" });
    assert.equal(res.status, 200);
    assert.ok(inputs.at(-1)?.history.some((m) => m.authorType === "EMPLOYEE" && m.content === "Meu notebook é azul"));
    assert.equal(inputs.at(-1)?.conversationId, first.conversation.id);
  });

  it("persiste cards de consulta e opções rápidas exatamente como foram apresentados", async () => {
    reply = {
      content: "Encontrei um chamado", trace: TRACE,
      ticketLookup: { outcome: "SINGLE_MATCH", openTicketCount: 1, totalMatches: 1, tickets: [{
        code: "INC-7", type: "INC", category: "NETWORK_VPN", priority: "HIGH", status: "WAITING_ANALYST",
        statusLabel: "Aguardando analista", title: "Título apresentado", createdAt: new Date().toISOString(), dueAt: null, overdue: false,
      }] },
      quickReplies: ["Falar com um analista", "Não, obrigado"],
    };
    const original = await (await post("/chat", { message: "Meu chamado" })).json() as ChatResponse;
    deps.chatService = chat();
    const restored = await snapshot();
    const attachments = restored.messages.find((m) => m.id === original.message?.id)?.trace?.attachments;
    assert.deepEqual(attachments?.ticketLookup, original.ticketLookup);
    assert.deepEqual(attachments?.quickReplies, original.quickReplies);
    assert.equal(inputs.length, 1);
  });

  for (const kind of ["COMPLEMENT", "REOPEN"] as const) {
    it(`recupera proposta antiga ${kind} e verifica validade e dono sem alterar dados`, async () => {
      const now = new Date();
      await client.ticket.create({ data: {
        code: "INC-9", ownerId: "u1", type: "INC", category: "NETWORK_VPN", priority: "HIGH",
        status: kind === "REOPEN" ? "RESOLVED" : "IN_PROGRESS", title: "VPN", description: "Erro", affectedScope: "INDIVIDUAL",
        resolvedAt: kind === "REOPEN" ? new Date(now.getTime() - 86400000) : null,
      } });
      const draft = { draftId: "legacy", createdAt: now.toISOString(), kind, ticketCode: "INC-9", ...(kind === "REOPEN" ? { reason: "Voltou" } : { content: "Mais detalhes" }) };
      await client.conversation.create({ data: {
        id: "legacy-conversation", ownerId: "u1", pendingDraftId: "legacy", pendingDraft: draft,
        messages: { create: { id: "legacy-message", authorType: "AGENT", content: "Confira a proposta", trace: {
          ...TRACE, actions: [{ tool: kind === "REOPEN" ? "draftReopen" : "draftComplement", summary: "Preparou proposta", status: "SUCCESS" }],
        } } },
      } });
      const restored = await snapshot();
      assert.equal(restored.pendingDraft?.messageId, "legacy-message");
      assert.equal(restored.pendingDraft?.draft.id, "legacy");
      assert.equal(restored.pendingDraft?.draft.kind, kind);
      if (kind === "REOPEN") {
        await client.ticket.update({ where: { code: "INC-9" }, data: { resolvedAt: new Date(now.getTime() - 8 * 86400000) } });
        assert.equal((await snapshot()).pendingDraft, null, "janela expirada não restaura confirmação");
      }
      await client.ticket.update({ where: { code: "INC-9" }, data: { ownerId: "u2" } });
      assert.equal((await snapshot()).pendingDraft, null, "chamado de outro dono não é exposto");
      assert.deepEqual((await client.conversation.findUniqueOrThrow({ where: { id: "legacy-conversation" } })).pendingDraft, draft);
    });
  }

  it("falha de leitura é erro HTTP e não se transforma em ausência", async (t) => {
    const broken = createConversationQueries(client);
    t.mock.method(broken, "activeForEmployee", async () => { throw new Error("banco indisponível"); });
    t.mock.method(console, "error", () => {});
    deps.chatService = createChatService({ conversations: createConversationService(client), queries: broken, tickets: createTicketService(client), agentRunner: runner });
    assert.equal((await get()).status, 500);
    assert.equal(await client.conversation.count(), 0);
    assert.equal(inputs.length, 0);
  });
});
