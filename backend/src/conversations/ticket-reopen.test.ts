import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ProposedTicketDraft, SimilarTicket } from "../shared/chat.js";
import { reopenDraftSchema } from "../shared/conversation-draft.js";
import { agentTraceSchema, type AgentTrace } from "../shared/transparency.js";
import { computeDueAt } from "../tickets/sla.js";
import { applyTicketEvent, initialTimeline, type TicketTimeline } from "../tickets/ticket-rules.js";
import { createConversationService, type ConversationService } from "./conversation-service.js";
import { DraftKindMismatchError, DraftNotFoundError, TicketNotReopenableError } from "./ticket-draft.js";

const DAY = 86_400_000;
const T0 = new Date("2026-11-02T12:00:00.000Z");
const T1 = new Date("2026-11-02T13:00:00.000Z");
const TRACE: AgentTrace = { understood: "x", intent: "REOPEN", actions: [], confidence: "HIGH", reason: "y" };
const CODE = "INC-30";

describe("reabertura de chamado por rascunho", () => {
  let client: PrismaClient;
  let service: ConversationService;
  let ownerId: string;
  let otherOwnerId: string;
  let analystId: string;
  let ticketId: string;

  /** Histórico real pelas regras: CREATED pelo funcionário e RESOLVED pelo analista. */
  async function createResolvedTicket(resolvedAt: Date, owner = ownerId) {
    const createdAt = new Date(resolvedAt.getTime() - 2 * DAY);
    const created = initialTimeline({ type: "INC", priority: "HIGH", at: createdAt });
    const resolved = applyTicketEvent(created.next, { type: "STATUS_CHANGED", actorType: "ANALYST", at: resolvedAt, toStatus: "RESOLVED" }, resolvedAt);
    const state = resolved.next;
    const ticket = await client.ticket.create({
      data: {
        code: CODE,
        type: "INC",
        category: "HARDWARE",
        priority: state.priority,
        status: state.status,
        title: "Teclado sem resposta",
        description: "Original",
        affectedScope: "INDIVIDUAL",
        ownerId: owner,
        createdAt,
        updatedAt: state.updatedAt,
        resolvedAt: state.resolvedAt,
        slaStartedAt: state.slaStartedAt,
        dueAt: state.dueAt,
        events: {
          create: [
            { type: "CREATED", actorType: "EMPLOYEE", actorId: owner, toStatus: "WAITING_ANALYST", dueAt: created.eventDueAt, createdAt },
            { type: "STATUS_CHANGED", actorType: "ANALYST", actorId: analystId, fromStatus: "WAITING_ANALYST", toStatus: "RESOLVED", createdAt: resolvedAt },
          ],
        },
      },
    });
    ticketId = ticket.id;
  }

  function proposalFor(status: SimilarTicket["status"] = "RESOLVED"): ProposedTicketDraft {
    return {
      kind: "REOPEN",
      reason: "O teclado voltou a falhar.",
      ticket: {
        code: CODE,
        type: "INC",
        category: "HARDWARE",
        priority: "HIGH",
        status,
        statusLabel: "Resolvido",
        title: "Teclado sem resposta",
        createdAt: T0.toISOString(),
        dueAt: null,
        overdue: false,
        canReopen: true,
      },
    };
  }

  async function conversationWithDraft(at = T0) {
    const turn = await service.startTurn(ownerId, { content: "voltou o problema", now: at });
    const stored = await service.completeTurn(turn, { content: "Confirma?", trace: TRACE, ticketDraft: proposalFor(), now: at });
    assert.ok(stored.draftId);
    return { conversationId: turn.conversationId, draftId: stored.draftId };
  }

  const confirm = (draftId: string, owner = ownerId, at = T1, reason = "Voltou a falhar hoje.") =>
    service.confirmDraft(owner, draftId, { kind: "REOPEN", reason }, at);
  const eventsOf = () => client.ticketEvent.findMany({ where: { ticketId }, orderBy: { createdAt: "asc" } });
  const ticketOf = () => client.ticket.findUniqueOrThrow({ where: { id: ticketId } });

  async function assertUnchanged(conversationId: string, draftId: string) {
    assert.equal((await eventsOf()).length, 2);
    const ticket = await ticketOf();
    assert.equal(ticket.status, "RESOLVED");
    assert.notEqual(ticket.resolvedAt, null);
    assert.equal(ticket.dueAt, null);
    assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, draftId);
  }

  before(async () => {
    client = await createTestDatabase();
    service = createConversationService(client);
    ownerId = (await client.user.create({ data: { name: "Dona", email: "dona@teste.example", role: "EMPLOYEE" } })).id;
    otherOwnerId = (await client.user.create({ data: { name: "Outro", email: "outro@teste.example", role: "EMPLOYEE" } })).id;
    analystId = (await client.user.create({ data: { name: "Analista", email: "analista@teste.example", role: "ANALYST" } })).id;
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
  });

  after(async () => {
    await client.$disconnect();
  });

  it("salva o rascunho REOPEN com o código e o motivo", async () => {
    await createResolvedTicket(new Date(T0.getTime() - DAY));
    const { conversationId, draftId } = await conversationWithDraft();
    const conversation = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.deepEqual(reopenDraftSchema.parse(conversation.pendingDraft), {
      draftId,
      createdAt: T0.toISOString(),
      kind: "REOPEN",
      ticketCode: CODE,
      reason: "O teclado voltou a falhar.",
    });
  });

  describe("confirmDraft", () => {
    it("reabre com status, prazo pela prioridade original e updatedAt igual ao evento", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const { draftId } = await conversationWithDraft();
      const { ticket } = await confirm(draftId);
      const stored = await ticketOf();

      assert.equal(stored.status, "WAITING_ANALYST");
      assert.equal(stored.priority, "HIGH");
      assert.equal(stored.resolvedAt, null);
      assert.deepEqual(stored.slaStartedAt, T1);
      assert.deepEqual(stored.dueAt, computeDueAt("HIGH", T1));
      assert.deepEqual(stored.updatedAt, T1);
      assert.equal(stored.description, "Original");
      assert.equal(ticket.status, "WAITING_ANALYST");
      assert.equal(ticket.dueAt, computeDueAt("HIGH", T1).toISOString());
    });

    it("grava um único REOPENED com motivo, transição, prazo, autor e conversa", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const { conversationId, draftId } = await conversationWithDraft();
      await confirm(draftId);
      const events = await eventsOf();
      assert.equal(events.length, 3);
      const reopened = events.filter((event) => event.type === "REOPENED");
      assert.equal(reopened.length, 1);
      const [event] = reopened;
      assert.equal(event?.actorType, "EMPLOYEE");
      assert.equal(event?.actorId, ownerId);
      assert.equal(event?.content, "Voltou a falhar hoje.");
      assert.equal(event?.fromStatus, "RESOLVED");
      assert.equal(event?.toStatus, "WAITING_ANALYST");
      assert.equal(event?.conversationId, conversationId);
      assert.deepEqual(event?.dueAt, computeDueAt("HIGH", T1));
      assert.deepEqual(event?.createdAt, T1);
    });

    it("refazer o histórico com as regras, como o verify do seed, chega ao estado gravado", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const { draftId } = await conversationWithDraft();
      await confirm(draftId);
      const [first, ...rest] = await eventsOf();
      assert.equal(first?.type, "CREATED");
      const stored = await ticketOf();
      let state: TicketTimeline = initialTimeline({ type: "INC", priority: "HIGH", at: first.createdAt }).next;
      for (const event of rest) {
        const result = applyTicketEvent(
          state,
          { type: event.type, actorType: event.actorType, at: event.createdAt, ...(event.toStatus ? { toStatus: event.toStatus } : {}) },
          event.createdAt,
        );
        assert.equal(result.fromStatus, event.fromStatus, `fromStatus de ${event.type}`);
        assert.deepEqual(result.eventDueAt, event.dueAt, `dueAt de ${event.type}`);
        state = result.next;
      }
      assert.equal(state.status, stored.status);
      assert.deepEqual(state.dueAt, stored.dueAt);
      assert.deepEqual(state.slaStartedAt, stored.slaStartedAt);
      assert.deepEqual(state.resolvedAt, stored.resolvedAt);
      assert.deepEqual(state.updatedAt, stored.updatedAt);
    });

    it("limpa o rascunho, grava mensagem fixa com trace válido e não consome cota", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const { conversationId, draftId } = await conversationWithDraft();
      const { message } = await confirm(draftId);
      assert.match(message.content, new RegExp(CODE));
      assert.match(message.content, /Aguardando analista/);
      const trace = agentTraceSchema.parse(message.trace);
      assert.equal(trace.intent, "REOPEN");
      assert.deepEqual(trace.actions.map(({ tool, status }) => [tool, status]), [["reopenTicket", "SUCCESS"]]);
      const conversation = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.pendingDraftId, null);
      assert.equal(conversation.messageCount, 1);
    });

    it("aceita resolvido há exatos 7 dias", async () => {
      await createResolvedTicket(new Date(T1.getTime() - 7 * DAY));
      const { draftId } = await conversationWithDraft();
      assert.equal((await confirm(draftId)).ticket.status, "WAITING_ANALYST");
    });

    it("recusa resolvido há 8 dias, sem efeitos", async () => {
      await createResolvedTicket(new Date(T1.getTime() - 8 * DAY));
      const { conversationId, draftId } = await conversationWithDraft();
      await assert.rejects(confirm(draftId), TicketNotReopenableError);
      await assertUnchanged(conversationId, draftId);
    });

    it("recusa quando a janela vence entre o rascunho e o clique", async () => {
      await createResolvedTicket(new Date(T0.getTime() - 7 * DAY + 60_000));
      const { conversationId, draftId } = await conversationWithDraft();
      await assert.rejects(confirm(draftId), TicketNotReopenableError);
      await assertUnchanged(conversationId, draftId);
    });

    it("recusa chamado que já foi reaberto ou não está resolvido", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const first = await conversationWithDraft();
      const second = await conversationWithDraft();
      await confirm(first.draftId);
      await assert.rejects(confirm(second.draftId), TicketNotReopenableError);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: second.conversationId } })).pendingDraftId, second.draftId);
      assert.equal((await eventsOf()).filter((event) => event.type === "REOPENED").length, 1);
    });

    it("recusa chamado de outro dono como não reabrível, sem efeitos", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY), otherOwnerId);
      const { conversationId, draftId } = await conversationWithDraft();
      await assert.rejects(confirm(draftId), TicketNotReopenableError);
      await assertUnchanged(conversationId, draftId);
    });

    it("recusa dono errado da conversa como rascunho inexistente", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const { conversationId, draftId } = await conversationWithDraft();
      await assert.rejects(confirm(draftId, otherOwnerId), DraftNotFoundError);
      await assertUnchanged(conversationId, draftId);
    });

    it("recusa body de outro kind", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const { conversationId, draftId } = await conversationWithDraft();
      await assert.rejects(service.confirmDraft(ownerId, draftId, { kind: "COMPLEMENT", content: "x" }, T1), DraftKindMismatchError);
      await assertUnchanged(conversationId, draftId);
    });

    it("em duplo clique reabre uma vez só", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const { draftId } = await conversationWithDraft();
      const results = await Promise.allSettled([confirm(draftId), confirm(draftId)]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal((await eventsOf()).filter((event) => event.type === "REOPENED").length, 1);
    });

    it("falha depois do evento desfaz evento, chamado e limpeza do rascunho", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const { conversationId, draftId } = await conversationWithDraft();
      await client.$executeRawUnsafe(
        `CREATE TRIGGER "test_fail_agent_message" BEFORE INSERT ON "Message" BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`,
      );
      try {
        await assert.rejects(confirm(draftId), (error: { meta?: unknown }) => JSON.stringify(error.meta).includes("falha simulada"));
      } finally {
        await client.$executeRawUnsafe(`DROP TRIGGER "test_fail_agent_message"`);
      }
      await assertUnchanged(conversationId, draftId);
      assert.equal((await confirm(draftId)).ticket.status, "WAITING_ANALYST");
    });
  });

  describe("cancelDraft", () => {
    it("limpa o rascunho sem mexer no chamado", async () => {
      await createResolvedTicket(new Date(T0.getTime() - DAY));
      const { draftId } = await conversationWithDraft();
      const { message } = await service.cancelDraft(ownerId, draftId, T1);
      const trace = agentTraceSchema.parse(message.trace);
      assert.equal(trace.intent, "REOPEN");
      assert.equal(trace.actions[0]?.status, "SKIPPED");
      assert.equal((await ticketOf()).status, "RESOLVED");
      assert.equal((await eventsOf()).length, 2);
    });
  });
});
