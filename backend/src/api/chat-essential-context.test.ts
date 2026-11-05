import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createAgentRunner } from "../agent/agent-runner.js";
import { decisionJson, fakeModel, type FakeStep } from "../agent/testing/fake-model.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import { createChatService } from "../chat/chat-service.js";
import type { AgentRunner } from "../chat/agent-runner.js";
import { createConsoleService } from "../console/console-service.js";
import { createConversationQueries } from "../conversations/conversation-queries.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createEventBus } from "../realtime/event-bus.js";
import type { ChatResponse } from "../shared/chat.js";
import type { ConsoleConversation } from "../shared/console.js";
import type { HelpArticle } from "../shared/knowledge.js";
import { createTicketService } from "../tickets/ticket-service.js";
import { unusedConsoleTicketService, unusedKnowledgeService } from "./test-support.js";

const NOW = new Date("2026-11-04T15:00:00Z");
const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const CREATE = {
  title: "Integrador do laboratório falha", description: "Validador de assinatura inconsistente; reiniciar não resolveu. Não há documentação.",
  type: "INC", category: "SOFTWARE", priority: "MEDIUM", priorityReason: "Afeta só a pessoa", affectedScope: "INDIVIDUAL", keywords: ["integrador"],
};
const VPN: HelpArticle = { slug: "vpn-809", title: "VPN com erro 809", category: "NETWORK_VPN", content: "A orientação vale apenas para Windows 10: reinstale o cliente. Para Windows 11, abra um chamado." };
const APPLICABILITY = "Não. A orientação deste artigo vale apenas para Windows 10; para Windows 11 o artigo orienta abrir um chamado.";
const tool = (toolName: string, input: Record<string, unknown>): FakeStep => ({ kind: "tool", toolName, input });
const say = (fields: Record<string, string> = {}): FakeStep => ({ kind: "text", text: decisionJson("Resposta que será substituída pela proposta.", fields) });

/** API, tools e persistência reais, com modelo fake e SQLite temporário. Nunca carrega .env. */
describe("contexto essencial F01–F03 na API", () => {
  let client: PrismaClient;
  let server: Server;
  let url: string;
  let ownerId: string;
  let cookie: string;
  let analystCookie: string;
  let steps: FakeStep[];

  async function chat(message: string, script: FakeStep[], conversationId?: string) {
    steps = script;
    const response = await fetch(`${url}/chat`, {
      method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }),
    });
    assert.equal(response.status, 200);
    const body = await response.json() as ChatResponse;
    assert.ok(body.message);
    const stored = await client.message.findUniqueOrThrow({ where: { id: body.message.id } });
    assert.equal(stored.content, body.message.content);
    return body;
  }

  before(async () => {
    client = await createTestDatabase();
    const employee = await client.user.create({ data: { name: "Pessoa", email: "pessoa@teste.example", role: "EMPLOYEE" } });
    const analyst = await client.user.create({ data: { name: "Analista", email: "analista@teste.example", role: "ANALYST" } });
    ownerId = employee.id;
    const token = (userId: string) => issueSessionToken({ userId, secret: SECRET, now: new Date() });
    cookie = `nexo_session=${await token(ownerId)}`;
    analystCookie = `nexo_session=${await token(analyst.id)}`;
    const tickets = createTicketService(client);
    const conversations = createConversationService(client);
    const queries = createConversationQueries(client);
    const agentRunner: AgentRunner = { runTurn(input) {
      const { model } = fakeModel(steps);
      return createAgentRunner({ model, ticketService: {
        ...tickets,
        findResolvedTicketByCode: (owner, code) => tickets.findResolvedTicketByCode(owner, code, NOW),
        findSimilarTickets: (owner, keywords, _now, options) => tickets.findSimilarTickets(owner, keywords, NOW, options),
      }, knowledgeService: { searchArticles: () => Promise.resolve([VPN]) } }).runTurn(input);
    } };
    server = createApp({ config: { sessionSecret: SECRET, corsOrigins: [], isProduction: false }, eventBus: createEventBus(),
      authService: createAuthService(client), chatService: createChatService({ conversations, queries, agentRunner, tickets, now: () => NOW }),
      consoleService: createConsoleService({ conversations, queries, tickets, now: () => NOW }), consoleTicketService: unusedConsoleTicketService, knowledgeService: unusedKnowledgeService,
    }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(async () => {
    await client.conversation.deleteMany();
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
  });
  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  it("F01: devolução com rascunho e assunto antigo leva resumo do problema atual ao banco e console", async () => {
    const initial = await chat("O integrador do laboratório falha só comigo; reiniciar não resolveu.", [tool("draftTicket", CREATE), say()]);
    assert.equal(initial.ticketDraft?.kind, "CREATE");
    const id = initial.conversation.id;
    await client.conversation.update({ where: { id }, data: { returnedToAgentAt: NOW } });
    await client.message.create({ data: { conversationId: id, authorType: "ANALYST", content: "Assunto antigo: VPN INC-99999 resolvido.", createdAt: new Date(NOW.getTime() - 1000) } });
    const transferred = await chat("Quero falar com um analista de novo", [tool("transferToAnalyst", { reason: "EMPLOYEE_REQUEST", summary: "Pediu analista de novo." }), say()], id);
    assert.equal(transferred.conversation.status, "WAITING_ANALYST");
    const row = await client.conversation.findUniqueOrThrow({ where: { id } });
    assert.match(row.handoffSummary!, /Integrador do laboratório falha/);
    assert.match(row.handoffSummary!, /reiniciar não resolveu/);
    assert.match(row.handoffSummary!, /INDIVIDUAL/);
    assert.match(row.handoffSummary!, /não confirmado/);
    assert.doesNotMatch(row.handoffSummary!, /VPN|99999/);
    assert.equal(row.handoffReason, "EMPLOYEE_REQUEST");
    assert.equal(row.pendingDraft, null);
    assert.equal(await client.ticket.count(), 0);
    const response = await fetch(`${url}/console/conversations/${id}`, { headers: { Cookie: analystCookie } });
    assert.equal(response.status, 200);
    const view = await response.json() as { conversation: ConsoleConversation };
    assert.equal(view.conversation.handoffSummary, row.handoffSummary);
  });

  for (const variant of ["missing", "enough", "duplicate"] as const) {
    it(`F02: janela vencida + abertura ${variant} mantém explicação no conteúdo persistido`, async () => {
      await client.ticket.create({ data: { code: "INC-77", ownerId, type: "INC", category: "SOFTWARE", priority: "MEDIUM", status: "RESOLVED", title: "Integrador falha", description: "Original", affectedScope: "INDIVIDUAL", resolvedAt: new Date("2026-10-20T15:00:00Z") } });
      if (variant === "duplicate") await client.ticket.create({ data: { code: "INC-78", ownerId, type: "INC", category: "SOFTWARE", priority: "MEDIUM", status: "IN_PROGRESS", title: "Integrador falha", description: "Integrador do laboratório", affectedScope: "INDIVIDUAL" } });
      const draftInput: Record<string, unknown> = { ...CREATE };
      if (variant === "missing") delete draftInput.affectedScope;
      const result = await chat("Quero reabrir INC-77, o integrador voltou a falhar.", [tool("draftReopen", { code: "INC-77", reason: "Voltou a falhar" }), tool("draftTicket", draftInput), say()]);
      assert.match(result.message!.content, /^O INC-77 foi resolvido há mais de 7 dias e não pode mais ser reaberto\./);
      if (variant === "missing") assert.match(result.message!.content, /Quem está sendo afetado/);
      if (variant === "enough") {
        assert.equal(result.ticketDraft?.kind, "CREATE");
        assert.match(result.ticketDraft!.kind === "CREATE" ? result.ticketDraft.description : "", /Relacionado ao INC-77/);
      }
      if (variant === "duplicate") assert.match(result.message!.content, /INC-78/);
      assert.equal((await client.ticket.findUniqueOrThrow({ where: { code: "INC-77" } })).status, "RESOLVED");
      assert.equal(await client.ticketEvent.count(), 0);
      assert.equal(await client.ticket.count(), variant === "duplicate" ? 2 : 1);
    });
  }

  it("F02: dentro da janela continua propondo reabertura, sem escrita antecipada", async () => {
    await client.ticket.create({ data: { code: "INC-77", ownerId, type: "INC", category: "SOFTWARE", priority: "MEDIUM", status: "RESOLVED", title: "Integrador falha", description: "Original", affectedScope: "INDIVIDUAL", resolvedAt: new Date("2026-11-03T15:00:00Z") } });
    const result = await chat("Reabrir INC-77, voltou a falhar", [tool("draftReopen", { code: "INC-77", reason: "Voltou a falhar" }), say()]);
    assert.equal(result.ticketDraft?.kind, "REOPEN");
    assert.doesNotMatch(result.message!.content, /não pode mais/);
    assert.equal((await client.ticket.findUniqueOrThrow({ where: { code: "INC-77" } })).status, "RESOLVED");
    assert.equal(await client.ticketEvent.count(), 0);
  });

  for (const similar of [false, true]) {
    it(`F03: responde aplicabilidade antes de ${similar ? "duplicidade" : "proposta"}, com fonte e sem escrita`, async () => {
      if (similar) await client.ticket.create({ data: { code: "INC-79", ownerId, type: "INC", category: "NETWORK_VPN", priority: "HIGH", status: "IN_PROGRESS", title: "VPN erro 809 no Windows 10", description: "VPN 809 Windows 10", affectedScope: "INDIVIDUAL" } });
      const result = await chat("No Windows 11 o erro 809 da VPN só afeta a mim. A orientação vale para Windows 11?", [
        tool("searchHelpCenter", { keywords: ["vpn", "809"] }),
        tool("draftTicket", { ...CREATE, title: "VPN erro 809 no Windows 11", description: "VPN com erro 809 no Windows 11, só comigo.", category: "NETWORK_VPN", keywords: ["vpn", "809"] }),
        say({ intent: "OPEN_TICKET", articleSlug: VPN.slug, articleAnswer: APPLICABILITY }),
      ]);
      assert.ok(result.message!.content.startsWith(APPLICABILITY));
      assert.doesNotMatch(result.message!.content, /reinstal/i);
      assert.equal(result.message!.trace.sources?.[0]?.slug, VPN.slug);
      assert.ok(!result.quickReplies?.includes("Resolveu"));
      if (similar) assert.match(result.message!.content, /INC-79/);
      else assert.equal(result.ticketDraft?.kind, "CREATE");
      assert.equal(await client.ticket.count(), similar ? 1 : 0);
      assert.equal(await client.ticketEvent.count(), 0);
    });
  }
});
