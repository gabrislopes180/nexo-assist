import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConfirmDraftRequest, ProposedTicketDraft } from "../shared/chat.js";
import type { ConversationChange } from "../shared/conversation-events.js";
import type { AgentTrace } from "../shared/transparency.js";
import { ConversationNotWaitingError } from "./attendance.js";
import { ConversationNotWithAgentError } from "./conversation-rules.js";
import { createConversationService, type ConversationService } from "./conversation-service.js";
import { startAgentTurn } from "./test-helpers.js";

const T0 = new Date("2026-11-03T12:00:00.000Z");
const T1 = new Date("2026-11-03T12:05:00.000Z");
const TRACE: AgentTrace = { understood: "x", intent: "OTHER", actions: [], confidence: "HIGH", reason: "y" };
const HANDOFF = { reason: "EMPLOYEE_REQUEST", summary: "Pediu para falar com um analista." } as const;

const draft = (priority: "MEDIUM" | "CRITICAL" = "MEDIUM"): ProposedTicketDraft => ({
  kind: "CREATE",
  type: "INC",
  category: "EMAIL",
  priority,
  priorityReason: "r",
  title: "Outlook",
  description: "Não sincroniza",
  affectedScope: "TEAM",
});
const createRequest: ConfirmDraftRequest = { kind: "CREATE", title: "Outlook", description: "Não sincroniza", affectedScope: "TEAM" };

/** O que cada publicação carregou, sem os ids gerados. */
const shape = (change: ConversationChange) => ({
  conversationId: change.conversationId,
  ownerId: change.ownerId,
  messages: change.messages.map((m) => [m.authorType, m.content]),
  ticketsChanged: change.ticketsChanged,
});

describe("publicação de mudanças depois do commit", () => {
  let client: PrismaClient;
  let service: ConversationService;
  let ownerId: string;
  const bruno = { id: "", name: "Bruno Martins" };
  const rafael = { id: "", name: "Rafael Lima" };
  let published: ConversationChange[];

  const waiting = () =>
    client.conversation.create({
      data: { ownerId, status: "WAITING_ANALYST", messageCount: 1, lastMessageAt: T0, handoffReason: "EMPLOYEE_REQUEST", handoffSummary: "s", handoffAt: T0 },
    });

  before(async () => {
    client = await createTestDatabase();
    service = createConversationService(client, { publisher: { publish: (change) => published.push(change) } });
    ownerId = (await client.user.create({ data: { name: "Ana Souza", email: "ana@teste.example", role: "EMPLOYEE" } })).id;
    bruno.id = (await client.user.create({ data: { name: bruno.name, email: "bruno@teste.example", role: "ANALYST" } })).id;
    rafael.id = (await client.user.create({ data: { name: rafael.name, email: "rafael@teste.example", role: "ANALYST" } })).id;
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
    await client.ticketCounter.deleteMany();
    await client.ticketCounter.createMany({ data: [{ type: "INC", lastNumber: 100 }, { type: "REQ", lastNumber: 200 }] });
    published = [];
  });

  after(async () => {
    await client.$disconnect();
  });

  describe("turno do agent", () => {
    it("abrir o turno não publica; completar publica a mensagem do funcionário e a do agent, em ordem", async () => {
      const turn = await startAgentTurn(service, ownerId, { content: "oi", now: T0 });
      assert.equal(published.length, 0);
      const stored = await service.completeTurn(turn, { content: "Olá", trace: TRACE, now: T1 });
      assert.deepEqual(published.map(shape), [
        { conversationId: turn.conversationId, ownerId, messages: [["EMPLOYEE", "oi"], ["AGENT", "Olá"]], ticketsChanged: false },
      ]);
      const [change] = published;
      assert.deepEqual(change?.messages.map((m) => m.id), [turn.employeeMessageId, stored.id]);
      assert.deepEqual(change?.messages[1]?.trace, TRACE);
    });

    it("com transferência, inclui a SYSTEM depois da resposta", async () => {
      const turn = await startAgentTurn(service, ownerId, { content: "quero um analista", now: T0 });
      await service.completeTurn(turn, { content: "Vou transferir.", trace: TRACE, handoff: HANDOFF, now: T1 });
      assert.deepEqual(published.map((change) => shape(change).messages), [
        [["EMPLOYEE", "quero um analista"], ["AGENT", "Vou transferir."], ["SYSTEM", "Transferida para um analista"]],
      ]);
    });

    it("turno desfeito não publica nada", async () => {
      const turn = await startAgentTurn(service, ownerId, { content: "oi", now: T0 });
      await service.abortTurn(turn);
      assert.deepEqual(published, []);
    });

    it("completeTurn que falha na transação não publica nada", async () => {
      const turn = await startAgentTurn(service, ownerId, { content: "oi", now: T0 });
      await client.conversation.update({ where: { id: turn.conversationId }, data: { status: "WAITING_ANALYST" } });
      await assert.rejects(service.completeTurn(turn, { content: "Olá", trace: TRACE, now: T1 }), ConversationNotWithAgentError);
      assert.deepEqual(published, []);
    });
  });

  it("mensagem do funcionário para o analista publica só ela", async () => {
    const { id } = await waiting();
    const start = await service.startTurn(ownerId, { conversationId: id, content: "Alguém aí?", now: T1 });
    assert.equal(start.kind, "STORED_FOR_ANALYST");
    assert.deepEqual(published.map(shape), [{ conversationId: id, ownerId, messages: [["EMPLOYEE", "Alguém aí?"]], ticketsChanged: false }]);
  });

  describe("rascunhos", () => {
    async function withDraft(priority: "MEDIUM" | "CRITICAL" = "MEDIUM") {
      const turn = await startAgentTurn(service, ownerId, { content: "abre um chamado", now: T0 });
      const stored = await service.completeTurn(turn, { content: "Confirma?", trace: TRACE, ticketDraft: draft(priority), now: T0 });
      assert.ok(stored.draftId);
      published = [];
      return { conversationId: turn.conversationId, draftId: stored.draftId };
    }

    it("confirmar publica a mensagem do agent e avisa que os chamados mudaram", async () => {
      const { conversationId, draftId } = await withDraft();
      const { message } = await service.confirmDraft(ownerId, draftId, createRequest, T1);
      assert.deepEqual(published.map(shape), [{ conversationId, ownerId, messages: [["AGENT", message.content]], ticketsChanged: true }]);
    });

    it("confirmar um CRITICAL inclui a SYSTEM da transferência", async () => {
      const { draftId } = await withDraft("CRITICAL");
      await service.confirmDraft(ownerId, draftId, createRequest, T1);
      assert.deepEqual(published.map((change) => change.messages.map((m) => m.authorType)), [["AGENT", "SYSTEM"]]);
    });

    it("cancelar publica a mensagem do agent, sem mudança de chamados", async () => {
      const { conversationId, draftId } = await withDraft();
      const { message } = await service.cancelDraft(ownerId, draftId, T1);
      assert.deepEqual(published.map(shape), [{ conversationId, ownerId, messages: [["AGENT", message.content]], ticketsChanged: false }]);
    });
  });

  describe("ações do analista", () => {
    it("assumir, responder, devolver e encerrar publicam as mensagens criadas", async () => {
      const first = await waiting();
      await service.takeOver(first.id, bruno, T1);
      await service.replyAsAnalyst(first.id, bruno, "Oi, Ana!", T1);
      await service.returnToAgent(first.id, bruno, T1);
      const second = await waiting();
      await service.takeOver(second.id, bruno, T1);
      published = [];
      await service.closeAttendance(second.id, bruno, T1);
      assert.deepEqual(published.map(shape), [
        { conversationId: second.id, ownerId, messages: [["SYSTEM", "Bruno encerrou o atendimento"]], ticketsChanged: false },
      ]);
    });

    it("na ordem das ações, uma publicação por ação", async () => {
      const { id } = await waiting();
      await service.takeOver(id, bruno, T1);
      await service.replyAsAnalyst(id, bruno, "Oi, Ana!", T1);
      await service.returnToAgent(id, bruno, T1);
      assert.deepEqual(published.map((change) => shape(change).messages), [
        [["SYSTEM", "Bruno assumiu a conversa"]],
        [["ANALYST", "Oi, Ana!"]],
        [["SYSTEM", "Conversa devolvida ao agent"]],
      ]);
    });

    it("casos idempotentes e transações recusadas não publicam nada", async () => {
      const { id } = await waiting();
      await service.takeOver(id, bruno, T1);
      published = [];
      await service.takeOver(id, bruno, T1);
      await assert.rejects(service.takeOver(id, rafael, T1), ConversationNotWaitingError);
      await service.closeAttendance(id, bruno, T1);
      published = [];
      await service.closeAttendance(id, bruno, T1);
      assert.deepEqual(published, []);
    });
  });

  it("um publisher que lança não derruba a operação já gravada", async (t) => {
    t.mock.method(console, "error", () => undefined);
    const throwing = createConversationService(client, {
      publisher: {
        publish: () => {
          throw new Error("publisher quebrado");
        },
      },
    });
    const { id } = await waiting();
    const result = await throwing.takeOver(id, bruno, T1);
    assert.equal(result.snapshot.status, "WITH_ANALYST");
  });
});
