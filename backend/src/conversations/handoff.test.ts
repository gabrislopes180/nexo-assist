import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import { startAgentTurn } from "./test-helpers.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ProposedTicketDraft } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";
import { ConversationNotWithAgentError, createConversationService, type ConversationService } from "./conversation-service.js";
import { HANDOFF_SYSTEM_MESSAGE, transferToAnalyst } from "./handoff.js";

const T0 = new Date("2026-11-02T12:00:00.000Z");
const T1 = new Date("2026-11-02T13:00:00.000Z");
const TRACE: AgentTrace = { understood: "x", intent: "TALK_TO_ANALYST", actions: [], confidence: "HIGH", reason: "y" };
const HANDOFF = { reason: "EMPLOYEE_REQUEST", summary: "Pediu para falar com um analista sobre a VPN." } as const;

const draft: ProposedTicketDraft = {
  kind: "CREATE",
  type: "INC",
  category: "EMAIL",
  priority: "MEDIUM",
  priorityReason: "r",
  title: "Outlook",
  description: "Não sincroniza",
  affectedScope: "TEAM",
};

describe("transferência no completeTurn", () => {
  let client: PrismaClient;
  let service: ConversationService;
  let ownerId: string;

  const conversationOf = (id: string) => client.conversation.findUniqueOrThrow({ where: { id }, include: { messages: { orderBy: { createdAt: "asc" } } } });

  before(async () => {
    client = await createTestDatabase();
    service = createConversationService(client);
    ownerId = (await client.user.create({ data: { name: "Dona", email: "dona@teste.example", role: "EMPLOYEE" } })).id;
  });

  beforeEach(async () => {
    await client.conversation.deleteMany();
  });

  after(async () => {
    await client.$disconnect();
  });

  it("transfere junto com a mensagem do agent e grava a mensagem SYSTEM depois dela", async () => {
    const turn = await startAgentTurn(service, ownerId, { content: "quero um analista", now: T0 });
    const stored = await service.completeTurn(turn, { content: "Vou transferir.", trace: TRACE, handoff: HANDOFF, now: T1 });

    assert.equal(stored.conversationStatus, "WAITING_ANALYST");
    const conversation = await conversationOf(turn.conversationId);
    assert.deepEqual(
      stored.systemMessages.map((m) => [m.id, m.conversationId, m.authorType, m.systemKind, m.author, m.content, m.createdAt, m.trace]),
      [[conversation.messages[2]?.id, turn.conversationId, "SYSTEM", "HANDOFF", null, HANDOFF_SYSTEM_MESSAGE, new Date(T1.getTime() + 1), null]],
    );
    assert.equal(conversation.status, "WAITING_ANALYST");
    assert.equal(conversation.handoffReason, "EMPLOYEE_REQUEST");
    assert.equal(conversation.handoffSummary, HANDOFF.summary);
    assert.deepEqual(conversation.handoffAt, new Date(T1.getTime() + 1));
    assert.equal(conversation.analystId, null);
    assert.equal(conversation.messageCount, 1);
    assert.deepEqual(conversation.messages.map((m) => [m.authorType, m.content]), [
      ["EMPLOYEE", "quero um analista"],
      ["AGENT", "Vou transferir."],
      ["SYSTEM", HANDOFF_SYSTEM_MESSAGE],
    ]);
    const system = conversation.messages[2];
    assert.equal(system?.authorId, null);
    assert.equal(system?.systemKind, "HANDOFF");
    assert.equal(system?.trace, null);
    assert.ok((system?.createdAt.getTime() ?? 0) > (conversation.messages[1]?.createdAt.getTime() ?? 0));
    assert.deepEqual(conversation.lastMessageAt, system?.createdAt);
  });

  it("sem transferência mantém WITH_AGENT e devolve o estado relido", async () => {
    const turn = await startAgentTurn(service, ownerId, { content: "oi", now: T0 });
    const stored = await service.completeTurn(turn, { content: "Olá", trace: TRACE, now: T1 });
    assert.equal(stored.conversationStatus, "WITH_AGENT");
    assert.deepEqual(stored.systemMessages, []);
    assert.equal((await conversationOf(turn.conversationId)).messages.length, 2);
  });

  it("descarta o rascunho pendente e o do turno ao transferir", async () => {
    const first = await startAgentTurn(service, ownerId, { content: "abre um chamado", now: T0 });
    const withDraft = await service.completeTurn(first, { content: "Confirma?", trace: TRACE, ticketDraft: draft, now: T0 });
    assert.ok(withDraft.draftId);

    const second = await startAgentTurn(service, ownerId, { conversationId: first.conversationId, content: "prefiro analista", now: T1 });
    const stored = await service.completeTurn(second, { content: "Vou transferir.", trace: TRACE, ticketDraft: draft, handoff: HANDOFF, now: T1 });
    assert.equal(stored.draftId, null);
    const conversation = await conversationOf(first.conversationId);
    assert.equal(conversation.pendingDraftId, null);
    assert.equal(conversation.pendingDraft, null);
  });

  it("só transfere conversa WITH_AGENT: se o estado mudou durante o turno, nada é gravado", async () => {
    const turn = await startAgentTurn(service, ownerId, { content: "quero um analista", now: T0 });
    await client.conversation.update({ where: { id: turn.conversationId }, data: { status: "WITH_ANALYST" } });
    await assert.rejects(service.completeTurn(turn, { content: "Vou transferir.", trace: TRACE, handoff: HANDOFF, now: T1 }), ConversationNotWithAgentError);
    const conversation = await conversationOf(turn.conversationId);
    assert.equal(conversation.status, "WITH_ANALYST");
    assert.equal(conversation.handoffReason, null);
    assert.equal(conversation.messages.length, 1);
  });

  it("turno sem transferência não grava em conversa que outra operação já transferiu", async () => {
    const turn = await startAgentTurn(service, ownerId, { content: "oi", now: T0 });
    await client.$transaction((tx) => transferToAnalyst(tx, { conversationId: turn.conversationId, reason: "CRITICAL", summary: "s", at: T0 }));
    await assert.rejects(service.completeTurn(turn, { content: "Olá", trace: TRACE, ticketDraft: draft, now: T1 }), ConversationNotWithAgentError);
    const conversation = await conversationOf(turn.conversationId);
    assert.equal(conversation.pendingDraftId, null);
    assert.deepEqual(conversation.messages.map((m) => m.authorType), ["EMPLOYEE", "SYSTEM"]);
  });

  it("desfazer o turno depois de uma transferência concorrente não volta lastMessageAt", async () => {
    const first = await startAgentTurn(service, ownerId, { content: "oi", now: T0 });
    await service.completeTurn(first, { content: "Olá", trace: TRACE, now: T0 });
    const turn = await startAgentTurn(service, ownerId, { conversationId: first.conversationId, content: "e aí?", now: T1 });
    const transferredAt = new Date(T1.getTime() + 60_000);
    await client.$transaction((tx) => transferToAnalyst(tx, { conversationId: turn.conversationId, reason: "CRITICAL", summary: "s", at: transferredAt }));
    await service.abortTurn(turn);
    const conversation = await conversationOf(turn.conversationId);
    const last = conversation.messages.at(-1);
    assert.equal(last?.authorType, "SYSTEM");
    assert.deepEqual(conversation.lastMessageAt, last?.createdAt);
    assert.equal(conversation.messageCount, 1);
  });

  it("falha ao gravar a mensagem SYSTEM desfaz a resposta e a transferência", async () => {
    const turn = await startAgentTurn(service, ownerId, { content: "quero um analista", now: T0 });
    await client.$executeRawUnsafe(
      `CREATE TRIGGER "test_fail_system" BEFORE INSERT ON "Message" WHEN NEW."authorType" = 'SYSTEM' BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`,
    );
    try {
      await assert.rejects(
        service.completeTurn(turn, { content: "Vou transferir.", trace: TRACE, handoff: HANDOFF, now: T1 }),
        (error: { meta?: unknown }) => JSON.stringify(error.meta).includes("falha simulada"),
      );
    } finally {
      await client.$executeRawUnsafe(`DROP TRIGGER "test_fail_system"`);
    }
    const conversation = await conversationOf(turn.conversationId);
    assert.equal(conversation.status, "WITH_AGENT");
    assert.equal(conversation.handoffAt, null);
    assert.equal(conversation.messages.length, 1);
  });
});
