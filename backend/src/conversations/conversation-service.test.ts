import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus, MessageAuthorType } from "../generated/prisma/enums.js";
import type { AgentTrace } from "../shared/transparency.js";
import {
  ConversationClosedError,
  ConversationMessageLimitReachedError,
  ConversationNotFoundError,
  ConversationNotWithAgentError,
  createConversationService,
  type ConversationService,
} from "./conversation-service.js";

const T0 = new Date("2026-11-01T12:00:00.000Z");
const T1 = new Date("2026-11-01T12:01:00.000Z");
const T2 = new Date("2026-11-01T12:02:00.000Z");

const TRACE: AgentTrace = {
  understood: "Quer saber do chamado",
  intent: "CHECK_TICKET",
  actions: [],
  confidence: "HIGH",
  reason: "Pedido explícito",
};

describe("ConversationService", () => {
  let client: PrismaClient;
  let service: ConversationService;
  let ownerId: string;
  let otherOwnerId: string;

  function createConversation(overrides: { status?: ConversationStatus; messageCount?: number; owner?: string } = {}) {
    return client.conversation.create({
      data: {
        ownerId: overrides.owner ?? ownerId,
        status: overrides.status ?? "WITH_AGENT",
        messageCount: overrides.messageCount ?? 0,
        lastMessageAt: T0,
      },
    });
  }

  async function snapshot(id: string) {
    const conversation = await client.conversation.findUniqueOrThrow({
      where: { id },
      select: { messageCount: true, lastMessageAt: true, status: true },
    });
    return { ...conversation, messages: await client.message.count({ where: { conversationId: id } }) };
  }

  before(async () => {
    client = await createTestDatabase();
    service = createConversationService(client);
    ownerId = (await client.user.create({ data: { name: "Dona", email: "dona@teste.example", role: "EMPLOYEE" } })).id;
    otherOwnerId = (await client.user.create({ data: { name: "Outro", email: "outro@teste.example", role: "EMPLOYEE" } })).id;
  });

  beforeEach(async () => {
    await client.conversation.deleteMany();
  });

  after(async () => {
    await client.$disconnect();
  });

  describe("startTurn", () => {
    it("sem conversationId cria a conversa com a primeira mensagem", async () => {
      const turn = await service.startTurn(ownerId, { content: "oi", now: T0 });
      assert.equal(turn.isNew, true);
      assert.equal(turn.messageCount, 1);
      assert.equal(turn.status, "WITH_AGENT");
      assert.deepEqual(turn.history, []);

      const conversation = await client.conversation.findUniqueOrThrow({
        where: { id: turn.conversationId },
        include: { messages: true },
      });
      assert.equal(conversation.ownerId, ownerId);
      assert.equal(conversation.messageCount, 1);
      assert.deepEqual(conversation.lastMessageAt, T0);
      assert.equal(conversation.messages.length, 1);
      assert.equal(conversation.messages[0]?.id, turn.employeeMessageId);
      assert.equal(conversation.messages[0]?.authorType, "EMPLOYEE");
      assert.equal(conversation.messages[0]?.authorId, ownerId);
      assert.equal(conversation.messages[0]?.content, "oi");
    });

    it("com conversationId continua a conversa e conta a mensagem", async () => {
      const { id } = await createConversation({ messageCount: 3 });
      const turn = await service.startTurn(ownerId, { conversationId: id, content: "de novo", now: T1 });
      assert.equal(turn.isNew, false);
      assert.equal(turn.conversationId, id);
      assert.equal(turn.messageCount, 4);
      assert.deepEqual(turn.previousLastMessageAt, T0);
      assert.deepEqual(await snapshot(id), { messageCount: 4, lastMessageAt: T1, status: "WITH_AGENT", messages: 1 });
    });

    it("aceita a 30ª mensagem", async () => {
      const { id } = await createConversation({ messageCount: 29 });
      const turn = await service.startTurn(ownerId, { conversationId: id, content: "última", now: T1 });
      assert.equal(turn.messageCount, 30);
    });

    it("recusa a 31ª sem gravar nada e sem encerrar a conversa", async () => {
      const { id } = await createConversation({ messageCount: 30 });
      await assert.rejects(service.startTurn(ownerId, { conversationId: id, content: "x", now: T1 }), ConversationMessageLimitReachedError);
      assert.deepEqual(await snapshot(id), { messageCount: 30, lastMessageAt: T0, status: "WITH_AGENT", messages: 0 });
    });

    it("responde igual para conversa inexistente e de outro dono, sem gravar nada", async () => {
      const { id } = await createConversation({ owner: otherOwnerId, messageCount: 2 });
      await assert.rejects(service.startTurn(ownerId, { conversationId: "nao-existe", content: "x", now: T1 }), ConversationNotFoundError);
      await assert.rejects(service.startTurn(ownerId, { conversationId: id, content: "x", now: T1 }), ConversationNotFoundError);
      assert.deepEqual(await snapshot(id), { messageCount: 2, lastMessageAt: T0, status: "WITH_AGENT", messages: 0 });
    });

    it("recusa conversa encerrada, mesmo com o limite atingido", async () => {
      const { id } = await createConversation({ status: "CLOSED", messageCount: 30 });
      await assert.rejects(service.startTurn(ownerId, { conversationId: id, content: "x", now: T1 }), ConversationClosedError);
      assert.equal((await snapshot(id)).messages, 0);
    });

    for (const status of ["WAITING_ANALYST", "WITH_ANALYST"] as const) {
      it(`recusa conversa em ${status}`, async () => {
        const { id } = await createConversation({ status, messageCount: 2 });
        await assert.rejects(service.startTurn(ownerId, { conversationId: id, content: "x", now: T1 }), ConversationNotWithAgentError);
        assert.deepEqual(await snapshot(id), { messageCount: 2, lastMessageAt: T0, status, messages: 0 });
      });
    }

    it("em concorrência na 29ª só aceita um turno", async () => {
      const { id } = await createConversation({ messageCount: 29 });
      const results = await Promise.allSettled([
        service.startTurn(ownerId, { conversationId: id, content: "a", now: T1 }),
        service.startTurn(ownerId, { conversationId: id, content: "b", now: T1 }),
      ]);
      const rejected = results.filter((result) => result.status === "rejected");
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(rejected.length, 1);
      assert.ok(rejected[0]?.reason instanceof ConversationMessageLimitReachedError);
      assert.deepEqual(await snapshot(id), { messageCount: 30, lastMessageAt: T1, status: "WITH_AGENT", messages: 1 });
    });

    describe("histórico", () => {
      async function addMessages(id: string, count: number) {
        for (let i = 0; i < count; i++) {
          const authorType: MessageAuthorType = i % 2 === 0 ? "EMPLOYEE" : "AGENT";
          await client.message.create({
            data: { conversationId: id, authorType, content: `m${i}`, createdAt: new Date(T0.getTime() - (count - i) * 1000) },
          });
        }
      }

      it("traz em ordem cronológica, sem SYSTEM, sem trace e sem a mensagem atual", async () => {
        const { id } = await createConversation({ messageCount: 1 });
        const at = (seconds: number) => new Date(T0.getTime() - seconds * 1000);
        await client.message.createMany({
          data: [
            { conversationId: id, authorType: "EMPLOYEE", content: "um", createdAt: at(40) },
            { conversationId: id, authorType: "AGENT", content: "dois", trace: TRACE, createdAt: at(30) },
            { conversationId: id, authorType: "SYSTEM", content: "aviso", createdAt: at(20) },
            { conversationId: id, authorType: "ANALYST", content: "três", createdAt: at(10) },
          ],
        });
        const turn = await service.startTurn(ownerId, { conversationId: id, content: "atual", now: T1 });
        assert.deepEqual(turn.history, [
          { authorType: "EMPLOYEE", content: "um" },
          { authorType: "AGENT", content: "dois" },
          { authorType: "ANALYST", content: "três" },
        ]);
      });

      it("limita às últimas 20 mensagens", async () => {
        const { id } = await createConversation({ messageCount: 10 });
        await addMessages(id, 25);
        const turn = await service.startTurn(ownerId, { conversationId: id, content: "atual", now: T1 });
        assert.equal(turn.history.length, 20);
        assert.equal(turn.history[0]?.content, "m5");
        assert.equal(turn.history[19]?.content, "m24");
      });
    });
  });

  describe("completeTurn", () => {
    it("grava a mensagem do agent com trace e atualiza lastMessageAt", async () => {
      const turn = await service.startTurn(ownerId, { content: "oi", now: T0 });
      const stored = await service.completeTurn(turn, { content: "olá", trace: TRACE, now: T1 });
      assert.equal(stored.content, "olá");
      assert.deepEqual(stored.trace, TRACE);
      assert.deepEqual(stored.createdAt, T1);

      const message = await client.message.findUniqueOrThrow({ where: { id: stored.id } });
      assert.equal(message.authorType, "AGENT");
      assert.equal(message.authorId, null);
      assert.deepEqual(message.trace, TRACE);
      assert.deepEqual(await snapshot(turn.conversationId), { messageCount: 1, lastMessageAt: T1, status: "WITH_AGENT", messages: 2 });
    });
  });

  describe("abortTurn", () => {
    it("apaga a conversa nova junto com a mensagem", async () => {
      const turn = await service.startTurn(ownerId, { content: "oi", now: T0 });
      await service.abortTurn(turn);
      assert.equal(await client.conversation.count({ where: { id: turn.conversationId } }), 0);
      assert.equal(await client.message.count({ where: { id: turn.employeeMessageId } }), 0);
    });

    it("na conversa existente desfaz só o turno e restaura os contadores", async () => {
      const { id } = await createConversation({ messageCount: 2 });
      const first = await service.startTurn(ownerId, { conversationId: id, content: "fica", now: T1 });
      await service.completeTurn(first, { content: "resposta", trace: TRACE, now: T1 });
      const failed = await service.startTurn(ownerId, { conversationId: id, content: "sai", now: T2 });
      await service.abortTurn(failed);
      assert.deepEqual(await snapshot(id), { messageCount: 3, lastMessageAt: T1, status: "WITH_AGENT", messages: 2 });
      assert.equal(await client.message.count({ where: { id: failed.employeeMessageId } }), 0);
    });

    it("devolve a vaga do limite", async () => {
      const { id } = await createConversation({ messageCount: 29 });
      await service.abortTurn(await service.startTurn(ownerId, { conversationId: id, content: "a", now: T1 }));
      const retried = await service.startTurn(ownerId, { conversationId: id, content: "b", now: T2 });
      assert.equal(retried.messageCount, 30);
    });
  });
});
