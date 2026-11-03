import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus } from "../generated/prisma/enums.js";
import {
  closeSystemMessage,
  ConversationNotAssignedError,
  ConversationNotWaitingError,
  firstNameOf,
  RETURN_SYSTEM_MESSAGE,
  takeoverSystemMessage,
} from "./attendance.js";
import { ConversationNotFoundError } from "./conversation-rules.js";
import { createConversationService, type ConversationService } from "./conversation-service.js";

const T0 = new Date("2026-11-03T12:00:00.000Z");
const T1 = new Date("2026-11-03T12:05:00.000Z");
const T2 = new Date("2026-11-03T12:10:00.000Z");

describe("transições de atendimento", () => {
  let client: PrismaClient;
  let service: ConversationService;
  let ownerId: string;
  const bruno = { id: "", name: "Bruno Martins" };
  const rafael = { id: "", name: "Rafael Lima" };

  async function createConversation(status: ConversationStatus = "WAITING_ANALYST", analystId: string | null = null) {
    const handoff = status === "WITH_AGENT" ? {} : { handoffReason: "EMPLOYEE_REQUEST" as const, handoffSummary: "Pediu analista.", handoffAt: T0 };
    return client.conversation.create({
      data: {
        ownerId,
        status,
        analystId,
        ...(analystId ? { assignedAt: T0 } : {}),
        ...handoff,
        ...(status === "CLOSED" ? { closedAt: T0 } : {}),
        messageCount: 3,
        lastMessageAt: T0,
        pendingDraft: { draftId: "d", createdAt: T0.toISOString(), kind: "COMPLEMENT", ticketCode: "INC-1", content: "c" },
        pendingDraftId: "d",
      },
    });
  }

  const systemsOf = (id: string) => client.message.findMany({ where: { conversationId: id, authorType: "SYSTEM" }, orderBy: { createdAt: "asc" } });
  const read = (id: string) => client.conversation.findUniqueOrThrow({ where: { id } });

  before(async () => {
    client = await createTestDatabase();
    service = createConversationService(client);
    ownerId = (await client.user.create({ data: { name: "Ana Souza", email: "ana@teste.example", role: "EMPLOYEE" } })).id;
    bruno.id = (await client.user.create({ data: { name: bruno.name, email: "bruno@teste.example", role: "ANALYST" } })).id;
    rafael.id = (await client.user.create({ data: { name: rafael.name, email: "rafael@teste.example", role: "ANALYST" } })).id;
  });

  beforeEach(async () => {
    await client.conversation.deleteMany();
  });

  after(async () => {
    await client.$disconnect();
  });

  it("firstNameOf usa o primeiro nome, com fallback para o nome inteiro", () => {
    assert.equal(firstNameOf("Bruno Martins"), "Bruno");
    assert.equal(firstNameOf("  Bruno  "), "Bruno");
    assert.equal(firstNameOf("   "), "   ");
    assert.equal(takeoverSystemMessage("Bruno Martins"), "Bruno assumiu a conversa");
    assert.equal(closeSystemMessage("Rafael Lima"), "Rafael encerrou o atendimento");
    assert.equal(RETURN_SYSTEM_MESSAGE, "Conversa devolvida ao agent");
  });

  describe("takeOver", () => {
    it("assume a conversa em espera, grava a SYSTEM e zera o rascunho, mantendo o contexto da transferência", async () => {
      const { id } = await createConversation();
      const { snapshot, createdMessages } = await service.takeOver(id, bruno, T1);

      assert.equal(snapshot.status, "WITH_ANALYST");
      assert.deepEqual(snapshot.analyst, bruno);
      assert.deepEqual(snapshot.assignedAt, T1);
      assert.equal(snapshot.owner.name, "Ana Souza");
      assert.deepEqual(createdMessages.map((m) => [m.authorType, m.content, m.author]), [["SYSTEM", "Bruno assumiu a conversa", null]]);
      assert.deepEqual(createdMessages[0]?.createdAt, T1);

      const stored = await read(id);
      assert.equal(stored.analystId, bruno.id);
      assert.deepEqual(stored.assignedAt, T1);
      assert.deepEqual(stored.lastMessageAt, T1);
      assert.equal(stored.pendingDraftId, null);
      assert.equal(stored.pendingDraft, null);
      assert.equal(stored.handoffReason, "EMPLOYEE_REQUEST");
      assert.deepEqual(stored.handoffAt, T0);
    });

    it("com dois analistas ao mesmo tempo, só um assume e só uma SYSTEM é gravada", async () => {
      const { id } = await createConversation();
      const results = await Promise.allSettled([service.takeOver(id, bruno, T1), service.takeOver(id, rafael, T1)]);
      const rejected = results.filter((result) => result.status === "rejected");
      assert.equal(rejected.length, 1);
      assert.ok(rejected[0]?.reason instanceof ConversationNotWaitingError);
      assert.equal((await systemsOf(id)).length, 1);
    });

    it("o mesmo analista assumindo de novo é idempotente", async () => {
      const { id } = await createConversation();
      await service.takeOver(id, bruno, T1);
      const again = await service.takeOver(id, bruno, T2);
      assert.equal(again.snapshot.status, "WITH_ANALYST");
      assert.deepEqual(again.snapshot.assignedAt, T1);
      assert.deepEqual(again.createdMessages, []);
      assert.equal((await systemsOf(id)).length, 1);
    });

    for (const status of ["WITH_AGENT", "CLOSED"] as const) {
      it(`recusa conversa ${status}`, async () => {
        const { id } = await createConversation(status);
        await assert.rejects(service.takeOver(id, bruno, T1), ConversationNotWaitingError);
      });
    }

    it("recusa conversa de outro analista", async () => {
      const { id } = await createConversation("WITH_ANALYST", rafael.id);
      await assert.rejects(service.takeOver(id, bruno, T1), ConversationNotWaitingError);
    });

    it("conversa inexistente lança não encontrada", async () => {
      await assert.rejects(service.takeOver("nao-existe", bruno, T1), ConversationNotFoundError);
    });
  });

  describe("replyAsAnalyst", () => {
    it("grava a mensagem ANALYST com o autor e atualiza lastMessageAt, sem mexer na cota", async () => {
      const { id } = await createConversation("WITH_ANALYST", bruno.id);
      const { message, snapshot, createdMessages } = await service.replyAsAnalyst(id, bruno, "Oi, Ana!", T1);
      assert.equal(message.authorType, "ANALYST");
      assert.deepEqual(message.author, bruno);
      assert.equal(message.trace, null);
      assert.deepEqual(createdMessages, [message]);
      assert.equal(snapshot.messageCount, 3);
      const stored = await client.message.findUniqueOrThrow({ where: { id: message.id } });
      assert.equal(stored.authorId, bruno.id);
      assert.deepEqual((await read(id)).lastMessageAt, T1);
    });

    it("recusa sem ter assumido, conversa de outro analista e estados fora do atendimento", async () => {
      for (const [status, analystId] of [["WAITING_ANALYST", null], ["WITH_ANALYST", "outro"], ["WITH_AGENT", null], ["CLOSED", null]] as const) {
        const { id } = await createConversation(status, analystId === "outro" ? rafael.id : analystId);
        await assert.rejects(service.replyAsAnalyst(id, bruno, "oi", T1), ConversationNotAssignedError, status);
      }
      await assert.rejects(service.replyAsAnalyst("nao-existe", bruno, "oi", T1), ConversationNotFoundError);
    });
  });

  describe("returnToAgent", () => {
    for (const [label, status, analyst] of [
      ["em espera, sem assumir", "WAITING_ANALYST", null],
      ["assumida por mim", "WITH_ANALYST", "me"],
    ] as const) {
      it(`devolve conversa ${label}, limpando analista e transferência`, async () => {
        const { id } = await createConversation(status, analyst ? bruno.id : null);
        const { snapshot, createdMessages } = await service.returnToAgent(id, bruno, T1);
        assert.equal(snapshot.status, "WITH_AGENT");
        assert.equal(snapshot.analyst, null);
        assert.deepEqual(createdMessages.map((m) => m.content), [RETURN_SYSTEM_MESSAGE]);
        const stored = await read(id);
        assert.equal(stored.analystId, null);
        assert.equal(stored.assignedAt, null);
        assert.equal(stored.handoffReason, null);
        assert.equal(stored.handoffSummary, null);
        assert.equal(stored.handoffAt, null);
        assert.equal(stored.pendingDraftId, null);
        assert.deepEqual(stored.returnedToAgentAt, T1);
        assert.deepEqual(stored.lastMessageAt, T1);
      });
    }

    it("recusa conversa de outro analista, já com o agent e encerrada", async () => {
      for (const [status, analystId] of [["WITH_ANALYST", rafael.id], ["WITH_AGENT", null], ["CLOSED", null]] as const) {
        const { id } = await createConversation(status, analystId);
        await assert.rejects(service.returnToAgent(id, bruno, T1), ConversationNotWaitingError, status);
      }
    });

    it("devolver duas vezes: a segunda é recusada", async () => {
      const { id } = await createConversation();
      await service.returnToAgent(id, bruno, T1);
      await assert.rejects(service.returnToAgent(id, bruno, T2), ConversationNotWaitingError);
      assert.equal((await systemsOf(id)).length, 1);
    });
  });

  describe("closeAttendance", () => {
    it("encerra a conversa assumida por mim, mantendo analista e transferência como registro", async () => {
      const { id } = await createConversation("WITH_ANALYST", bruno.id);
      const { snapshot, createdMessages } = await service.closeAttendance(id, bruno, T1);
      assert.equal(snapshot.status, "CLOSED");
      assert.deepEqual(snapshot.closedAt, T1);
      assert.deepEqual(createdMessages.map((m) => m.content), ["Bruno encerrou o atendimento"]);
      const stored = await read(id);
      assert.equal(stored.analystId, bruno.id);
      assert.deepEqual(stored.assignedAt, T0);
      assert.equal(stored.handoffReason, "EMPLOYEE_REQUEST");
      assert.equal(stored.pendingDraftId, null);
    });

    it("encerrar de novo pelo mesmo analista é idempotente", async () => {
      const { id } = await createConversation("WITH_ANALYST", bruno.id);
      await service.closeAttendance(id, bruno, T1);
      const again = await service.closeAttendance(id, bruno, T2);
      assert.deepEqual(again.createdMessages, []);
      assert.deepEqual(again.snapshot.closedAt, T1);
      assert.equal((await systemsOf(id)).length, 1);
    });

    it("recusa conversa de outro analista, em espera ou com o agent", async () => {
      for (const [status, analystId] of [["WITH_ANALYST", rafael.id], ["WAITING_ANALYST", null], ["WITH_AGENT", null]] as const) {
        const { id } = await createConversation(status, analystId);
        await assert.rejects(service.closeAttendance(id, bruno, T1), ConversationNotAssignedError, status);
      }
      await assert.rejects(service.closeAttendance("nao-existe", bruno, T1), ConversationNotFoundError);
    });
  });
});
