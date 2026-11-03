import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createEventBus } from "../realtime/event-bus.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import type { AgentRunner, AgentTurnInput } from "../chat/agent-runner.js";
import { createChatService } from "../chat/chat-service.js";
import { createConversationQueries } from "../conversations/conversation-queries.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus } from "../generated/prisma/enums.js";
import type { ChatResponse } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { createTicketService } from "../tickets/ticket-service.js";
import type { ApiConfig } from "./config.js";
import { unusedConsoleService } from "./test-support.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const TRACE: AgentTrace = { understood: "x", intent: "OTHER", actions: [], confidence: "HIGH", reason: "y" };
const T0 = new Date("2026-11-01T12:00:00.000Z");

describe("mensagens do funcionário com a conversa no analista", () => {
  let client: PrismaClient;
  let url: string;
  let server: Server;
  let cookie: string;
  let ownerId: string;
  let analystId: string;
  const inputs: AgentTurnInput[] = [];

  function post(payload: unknown): Promise<Response> {
    return fetch(`${url}/chat`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: JSON.stringify(payload) });
  }

  function createConversation(status: ConversationStatus, messageCount = 2, extra: Record<string, unknown> = {}) {
    const analyst = status === "WITH_ANALYST" ? { analystId, assignedAt: T0 } : {};
    const handoff = status === "WITH_AGENT" ? {} : { handoffReason: "EMPLOYEE_REQUEST" as const, handoffSummary: "s", handoffAt: T0 };
    return client.conversation.create({ data: { ownerId, status, messageCount, lastMessageAt: T0, ...analyst, ...handoff, ...extra } });
  }

  before(async () => {
    client = await createTestDatabase();
    ownerId = (await client.user.create({ data: { name: "Ana Souza", email: "ana@teste.example", role: "EMPLOYEE" } })).id;
    analystId = (await client.user.create({ data: { name: "Bruno Martins", email: "bruno@teste.example", role: "ANALYST" } })).id;
    cookie = `nexo_session=${await issueSessionToken({ userId: ownerId, secret: SECRET, now: new Date() })}`;
    const agentRunner: AgentRunner = {
      runTurn: (input) => {
        inputs.push(input);
        return Promise.resolve({ content: "Resposta do agent.", trace: TRACE, ticketLookup: null });
      },
    };
    const chatService = createChatService({ queries: createConversationQueries(client), conversations: createConversationService(client), agentRunner, tickets: createTicketService(client) });
    server = createApp({ eventBus: createEventBus(), config, authService: createAuthService(client), chatService, consoleService: unusedConsoleService }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await client.conversation.deleteMany();
    inputs.length = 0;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  for (const status of ["WAITING_ANALYST", "WITH_ANALYST"] as const) {
    it(`em ${status} grava a mensagem sem chamar a LLM e responde message null`, async () => {
      const { id } = await createConversation(status);
      const res = await post({ message: "  Alguém aí?  ", conversationId: id });
      assert.equal(res.status, 200);
      const body = (await res.json()) as ChatResponse;
      assert.equal(inputs.length, 0);
      assert.equal(body.message, null);
      assert.equal(body.ticketLookup, null);
      assert.equal(body.ticketDraft, null);
      assert.equal(body.quickReplies, null);
      assert.equal(body.employeeMessage.authorType, "EMPLOYEE");
      assert.equal(body.employeeMessage.content, "Alguém aí?");
      assert.equal(body.conversation.status, status);
      assert.equal(body.conversation.messageCount, 3);
      assert.deepEqual(body.conversation.analyst, status === "WITH_ANALYST" ? { id: analystId, name: "Bruno Martins" } : null);

      const stored = await client.message.findUniqueOrThrow({ where: { id: body.employeeMessage.id } });
      assert.equal(stored.authorType, "EMPLOYEE");
      assert.equal(stored.authorId, ownerId);
      const conversation = await client.conversation.findUniqueOrThrow({ where: { id } });
      assert.equal(conversation.messageCount, 3);
      assert.deepEqual(conversation.lastMessageAt, stored.createdAt);
    });
  }

  it("com o analista, aceita além do limite de 30", async () => {
    const { id } = await createConversation("WITH_ANALYST", 30);
    const res = await post({ message: "mais uma", conversationId: id });
    assert.equal(res.status, 200);
    assert.equal(((await res.json()) as ChatResponse).conversation.messageCount, 31);
  });

  it("em CLOSED continua 409 CONVERSATION_CLOSED", async () => {
    const { id } = await createConversation("CLOSED", 2, { closedAt: T0 });
    const res = await post({ message: "oi", conversationId: id });
    assert.equal(res.status, 409);
    assert.equal(((await res.json()) as { error: { code: string } }).error.code, "CONVERSATION_CLOSED");
  });

  it("depois de devolvida ao agent, a mensagem vira turno do agent com returnedFromAnalyst", async () => {
    const { id } = await createConversation("WITH_AGENT", 2, { returnedToAgentAt: T0 });
    const body = (await (await post({ message: "voltei", conversationId: id })).json()) as ChatResponse;
    assert.equal(body.message?.content, "Resposta do agent.");
    assert.equal(body.employeeMessage.content, "voltei");
    assert.equal(inputs.length, 1);
    assert.equal(inputs[0]?.returnedFromAnalyst, true);
  });

  it("turno com o agent em conversa nunca devolvida passa returnedFromAnalyst false e devolve employeeMessage", async () => {
    const body = (await (await post({ message: "oi" })).json()) as ChatResponse;
    assert.equal(inputs[0]?.returnedFromAnalyst, false);
    assert.equal(body.employeeMessage.content, "oi");
    assert.equal(body.conversation.analyst, null);
    const stored = await client.message.findUniqueOrThrow({ where: { id: body.employeeMessage.id } });
    assert.equal(stored.content, "oi");
  });
});
