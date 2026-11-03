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
import { HANDOFF_SYSTEM_MESSAGE } from "../conversations/handoff.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ChatResponse, ConfirmDraftResponse, ProposedTicketDraft } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { createTicketService } from "../tickets/ticket-service.js";
import type { ApiConfig } from "./config.js";
import { unusedConsoleService } from "./test-support.js";

/** Turno com o agent: a resposta do agent está sempre presente. */
type AgentChatResponse = ChatResponse & { message: NonNullable<ChatResponse["message"]> };

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const TRACE: AgentTrace = { understood: "x", intent: "TALK_TO_ANALYST", actions: [], confidence: "HIGH", reason: "y" };

const createDraft = (priority: "CRITICAL" | "HIGH"): ProposedTicketDraft => ({
  kind: "CREATE",
  type: "INC",
  category: "SOFTWARE",
  priority,
  priorityReason: "Filial parada.",
  title: "Sistema de ponto fora do ar",
  description: "Ninguém da filial consegue bater o ponto.",
  affectedScope: "COMPANY",
  affectedDescription: "Filial Campinas",
});

describe("transferência para analista pelo chat", () => {
  let client: PrismaClient;
  let url: string;
  let server: Server;
  let respond: () => Promise<AgentTurnResult>;
  let cookie: string;

  function post(path: string, payload: unknown): Promise<Response> {
    return fetch(`${url}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(payload),
    });
  }

  async function chat(result: Partial<AgentTurnResult>, conversationId?: string) {
    respond = () => Promise.resolve({ content: "Resposta do agent.", trace: TRACE, ticketLookup: null, ...result });
    const res = await post("/chat", { message: "mensagem", ...(conversationId ? { conversationId } : {}) });
    assert.equal(res.status, 200);
    return (await res.json()) as AgentChatResponse;
  }

  async function confirmCreation(priority: "CRITICAL" | "HIGH") {
    const turn = await chat({ ticketDraft: createDraft(priority) });
    assert.ok(turn.ticketDraft);
    const res = await post(`/chat/drafts/${turn.ticketDraft.id}/confirm`, {
      kind: "CREATE",
      title: "Sistema de ponto fora do ar",
      description: "Ninguém da filial consegue bater o ponto.",
      affectedScope: "COMPANY",
      affectedDescription: "Filial Campinas",
    });
    assert.equal(res.status, 200);
    return { conversationId: turn.conversation.id, body: (await res.json()) as ConfirmDraftResponse };
  }

  before(async () => {
    client = await createTestDatabase();
    const employee = await client.user.create({ data: { name: "Pessoa", email: "pessoa@teste.example", role: "EMPLOYEE" } });
    cookie = `nexo_session=${await issueSessionToken({ userId: employee.id, secret: SECRET, now: new Date() })}`;
    const agentRunner: AgentRunner = { runTurn: () => respond() };
    const chatService = createChatService({ queries: createConversationQueries(client), conversations: createConversationService(client), agentRunner, tickets: createTicketService(client) });
    server = createApp({ eventBus: createEventBus(), config, authService: createAuthService(client), chatService, consoleService: unusedConsoleService }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
    await client.ticketCounter.deleteMany();
    await client.ticketCounter.createMany({ data: [{ type: "INC", lastNumber: 500 }, { type: "REQ", lastNumber: 0 }] });
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  describe("POST /chat", () => {
    it("transfere e devolve o estado pós-turno, sem rascunho nem respostas rápidas", async () => {
      const body = await chat({ handoff: { reason: "EMPLOYEE_REQUEST", summary: "Pediu um analista." }, ticketDraft: createDraft("HIGH"), quickReplies: ["Sim"] });
      assert.equal(body.conversation.status, "WAITING_ANALYST");
      assert.equal(body.message.content, "Resposta do agent.");
      assert.equal(body.ticketDraft, null);
      assert.equal(body.quickReplies, null);
      assert.equal(body.message.trace.actions.at(-1)?.tool, "validateTicketDraft");
      const conversation = await client.conversation.findUniqueOrThrow({ where: { id: body.conversation.id } });
      assert.equal(conversation.handoffReason, "EMPLOYEE_REQUEST");
      assert.equal(conversation.pendingDraftId, null);
    });

    it("transferência inválida sem rascunho tem motivo próprio no trace e texto neutro", async () => {
      const body = await chat({ handoff: { reason: "LOW_CONFIDENCE", summary: "" } as AgentTurnResult["handoff"] });
      assert.equal(body.conversation.status, "WITH_AGENT");
      assert.doesNotMatch(body.message.trace.reason, /rascunho/);
      assert.match(body.message.trace.reason, /transferência/i);
      assert.doesNotMatch(body.message.content, /peça de novo/);
      assert.deepEqual(body.message.trace.actions.map((action) => action.tool), ["transferToAnalyst"]);
    });

    it("transferência inválida com rascunho registra também o rascunho descartado", async () => {
      const body = await chat({ handoff: { reason: "LOW_CONFIDENCE", summary: "" } as AgentTurnResult["handoff"], ticketDraft: createDraft("HIGH") });
      assert.deepEqual(body.message.trace.actions.map((action) => [action.tool, action.status]), [
        ["validateTicketDraft", "SKIPPED"],
        ["transferToAnalyst", "ERROR"],
      ]);
    });

    it("transferência válida prevalece sobre rascunho malformado, sem 503", async () => {
      const body = await chat({
        handoff: { reason: "EMPLOYEE_REQUEST", summary: "Pediu analista." },
        ticketDraft: { kind: "CREATE", title: "" } as unknown as ProposedTicketDraft,
      });
      assert.equal(body.conversation.status, "WAITING_ANALYST");
      assert.equal(body.ticketDraft, null);
    });

    it("depois da transferência, nova mensagem é gravada para o analista, sem LLM", async () => {
      const body = await chat({ handoff: { reason: "OVERDUE", summary: "Chamado INC-1 vencido; aceitou falar com analista." } });
      respond = () => Promise.reject(new Error("a LLM não deveria ser chamada"));
      const res = await post("/chat", { message: "e aí?", conversationId: body.conversation.id });
      assert.equal(res.status, 200);
      const next = (await res.json()) as AgentChatResponse;
      assert.equal(next.message, null);
      assert.equal(next.conversation.status, "WAITING_ANALYST");
    });

    const invalid: [string, unknown][] = [
      ["resumo vazio", { reason: "LOW_CONFIDENCE", summary: "   " }],
      ["resumo longo", { reason: "LOW_CONFIDENCE", summary: "a".repeat(1001) }],
      ["resumo com NUL", { reason: "LOW_CONFIDENCE", summary: "a\u0000b" }],
      ["motivo CRITICAL vindo do agent", { reason: "CRITICAL", summary: "resumo" }],
      ["campo extra", { reason: "LOW_CONFIDENCE", summary: "resumo", analystId: "x" }],
    ];
    for (const [name, handoff] of invalid) {
      it(`descarta a transferência com ${name}, com texto fixo e trace coerente`, async () => {
        const body = await chat({ handoff: handoff as AgentTurnResult["handoff"], ticketDraft: createDraft("HIGH") });
        assert.equal(body.conversation.status, "WITH_AGENT");
        assert.notEqual(body.message.content, "Resposta do agent.");
        assert.match(body.message.content, /não consegui transferir/i);
        assert.equal(body.message.trace.actions.at(-1)?.tool, "transferToAnalyst");
        assert.equal(body.message.trace.actions.at(-1)?.status, "ERROR");
        assert.equal(body.ticketDraft, null);
        const conversation = await client.conversation.findUniqueOrThrow({ where: { id: body.conversation.id } });
        assert.equal(conversation.handoffReason, null);
        assert.equal(conversation.pendingDraftId, null);
      });
    }
  });

  describe("confirmação de chamado CRITICAL", () => {
    it("transfere na mesma transação, com resumo determinístico, mensagem SYSTEM e estado na resposta", async () => {
      const { conversationId, body } = await confirmCreation("CRITICAL");
      assert.deepEqual(body.conversation, { id: conversationId, status: "WAITING_ANALYST" });
      assert.match(body.message.content, /analista/);
      assert.ok(body.message.trace.actions.some((action) => action.tool === "transferToAnalyst" && action.status === "SUCCESS"));
      const conversation = await client.conversation.findUniqueOrThrow({
        where: { id: conversationId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      });
      assert.equal(conversation.status, "WAITING_ANALYST");
      assert.equal(conversation.handoffReason, "CRITICAL");
      assert.equal(conversation.handoffSummary, "INC-501 · Sistema de ponto fora do ar · Categoria: Software · Afetados: Empresa (Filial Campinas)");
      assert.equal(conversation.messages.at(-1)?.authorType, "SYSTEM");
      assert.equal(conversation.messages.at(-1)?.content, HANDOFF_SYSTEM_MESSAGE);
    });

    it("com prioridade HIGH não transfere", async () => {
      const { conversationId, body } = await confirmCreation("HIGH");
      assert.deepEqual(body.conversation, { id: conversationId, status: "WITH_AGENT" });
      assert.doesNotMatch(body.message.content, /acionado/);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).handoffReason, null);
    });

    it("falha na mensagem SYSTEM desfaz chamado, número e transferência", async (t) => {
      t.mock.method(console, "error", () => undefined);
      const turn = await chat({ ticketDraft: createDraft("CRITICAL") });
      assert.ok(turn.ticketDraft);
      await client.$executeRawUnsafe(
        `CREATE TRIGGER "test_fail_system" BEFORE INSERT ON "Message" WHEN NEW."authorType" = 'SYSTEM' BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`,
      );
      try {
        const res = await post(`/chat/drafts/${turn.ticketDraft.id}/confirm`, {
          kind: "CREATE",
          title: "t",
          description: "d",
          affectedScope: "COMPANY",
        });
        assert.equal(res.status, 500);
      } finally {
        await client.$executeRawUnsafe(`DROP TRIGGER "test_fail_system"`);
      }
      assert.equal(await client.ticket.count(), 0);
      assert.equal((await client.ticketCounter.findUniqueOrThrow({ where: { type: "INC" } })).lastNumber, 500);
      const conversation = await client.conversation.findUniqueOrThrow({ where: { id: turn.conversation.id } });
      assert.equal(conversation.status, "WITH_AGENT");
      assert.equal(conversation.pendingDraftId, turn.ticketDraft.id);
    });
  });
});
