import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConfirmDraftRequest, ProposedTicketDraft } from "../shared/chat.js";
import { createDraftSchema } from "../shared/conversation-draft.js";
import { agentTraceSchema, type AgentTrace } from "../shared/transparency.js";
import { computeDueAt } from "../tickets/sla.js";
import { initialTimeline } from "../tickets/ticket-rules.js";
import { createConversationService, type ConversationService } from "./conversation-service.js";
import { DraftKindMismatchError, DraftNotFoundError } from "./ticket-draft.js";

const T0 = new Date("2026-11-02T12:00:00.000Z");
const T1 = new Date("2026-11-02T13:00:00.000Z");
const TRACE: AgentTrace = { understood: "x", intent: "OPEN_TICKET", actions: [], confidence: "HIGH", reason: "y" };

const proposal = (overrides: Partial<Extract<ProposedTicketDraft, { kind: "CREATE" }>> = {}): ProposedTicketDraft => ({
  kind: "CREATE",
  type: "INC",
  category: "EMAIL",
  priority: "MEDIUM",
  priorityReason: "Afeta a equipe, sem parar o trabalho.",
  title: "Outlook não sincroniza",
  description: "A caixa compartilhada parou de sincronizar.",
  affectedScope: "TEAM",
  affectedDescription: "Equipe Comercial",
  ...overrides,
});

const request = (overrides: Partial<Extract<ConfirmDraftRequest, { kind: "CREATE" }>> = {}): ConfirmDraftRequest => ({
  kind: "CREATE",
  title: "Título confirmado",
  description: "Descrição confirmada",
  affectedScope: "TEAM",
  affectedDescription: "Equipe Comercial",
  ...overrides,
});

describe("criação de chamado por rascunho", () => {
  let client: PrismaClient;
  let service: ConversationService;
  let ownerId: string;
  let otherOwnerId: string;

  async function conversationWithDraft(draft: ProposedTicketDraft = proposal()) {
    const turn = await service.startTurn(ownerId, { content: "abre um chamado", now: T0 });
    const stored = await service.completeTurn(turn, { content: "Confirma?", trace: TRACE, ticketDraft: draft, now: T0 });
    assert.ok(stored.draftId);
    return { conversationId: turn.conversationId, draftId: stored.draftId };
  }

  const confirm = (draftId: string, body: ConfirmDraftRequest = request(), owner = ownerId) => service.confirmDraft(owner, draftId, body, T1);
  const counter = async (type: "INC" | "REQ" = "INC") => (await client.ticketCounter.findUniqueOrThrow({ where: { type } })).lastNumber;

  async function assertNothingPersisted(conversationId: string, draftId: string, lastNumber: number) {
    assert.equal(await client.ticket.count(), 0);
    assert.equal(await client.ticketEvent.count(), 0);
    assert.equal(await counter(), lastNumber);
    const conversation = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(conversation.pendingDraftId, draftId);
    assert.deepEqual(conversation.lastMessageAt, T0);
    assert.equal(await client.message.count({ where: { conversationId } }), 2);
  }

  before(async () => {
    client = await createTestDatabase();
    service = createConversationService(client);
    ownerId = (await client.user.create({ data: { name: "Dona", email: "dona@teste.example", role: "EMPLOYEE" } })).id;
    otherOwnerId = (await client.user.create({ data: { name: "Outro", email: "outro@teste.example", role: "EMPLOYEE" } })).id;
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
    await client.ticketCounter.deleteMany();
    await client.ticketCounter.createMany({ data: [{ type: "INC", lastNumber: 100 }, { type: "REQ", lastNumber: 200 }] });
  });

  after(async () => {
    await client.$disconnect();
  });

  it("salva o rascunho CREATE junto com a mensagem", async () => {
    const { conversationId, draftId } = await conversationWithDraft();
    const conversation = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    assert.equal(conversation.pendingDraftId, draftId);
    const { draftId: storedId, createdAt, ...draft } = createDraftSchema.parse(conversation.pendingDraft);
    assert.equal(storedId, draftId);
    assert.equal(createdAt, T0.toISOString());
    assert.deepEqual(draft, proposal());
  });

  describe("confirmDraft", () => {
    it("cria o chamado com o dono da sessão, os campos editados e os travados do rascunho", async () => {
      const { draftId } = await conversationWithDraft();
      const { ticket } = await confirm(draftId);
      const stored = await client.ticket.findUniqueOrThrow({ where: { code: ticket.code } });
      const { next } = initialTimeline({ type: "INC", priority: "MEDIUM", at: T1 });

      assert.equal(stored.code, "INC-101");
      assert.equal(stored.ownerId, ownerId);
      assert.equal(stored.title, "Título confirmado");
      assert.equal(stored.description, "Descrição confirmada");
      assert.equal(stored.affectedScope, "TEAM");
      assert.equal(stored.affectedDescription, "Equipe Comercial");
      assert.equal(stored.type, "INC");
      assert.equal(stored.category, "EMAIL");
      assert.equal(stored.priority, "MEDIUM");
      assert.equal(stored.status, "WAITING_ANALYST");
      assert.deepEqual(stored.dueAt, next.dueAt);
      assert.deepEqual(stored.slaStartedAt, T1);
      assert.equal(stored.resolvedAt, null);
      assert.deepEqual(stored.createdAt, T1);
      assert.equal(ticket.status, "WAITING_ANALYST");
      assert.equal(ticket.statusLabel, "Aguardando analista");
      assert.equal(ticket.dueAt, next.dueAt?.toISOString());
    });

    it("grava um único CREATED no formato que o verify do seed exige, com updatedAt igual ao evento", async () => {
      const { conversationId, draftId } = await conversationWithDraft();
      const { ticket } = await confirm(draftId);
      const stored = await client.ticket.findUniqueOrThrow({ where: { code: ticket.code }, include: { events: true } });

      assert.equal(stored.events.length, 1);
      const [event] = stored.events;
      assert.equal(event?.type, "CREATED");
      assert.equal(event?.actorType, "EMPLOYEE");
      assert.equal(event?.actorId, ownerId);
      assert.equal(event?.conversationId, conversationId);
      assert.equal(event?.toStatus, "WAITING_ANALYST");
      assert.equal(event?.fromStatus, null);
      assert.equal(event?.fromPriority, null);
      assert.deepEqual(event?.dueAt, stored.dueAt);
      assert.deepEqual(event?.createdAt, T1);
      assert.deepEqual(stored.updatedAt, event?.createdAt);
    });

    it("limpa o rascunho e grava mensagem fixa com código, status e prazo, sem consumir cota", async () => {
      const { conversationId, draftId } = await conversationWithDraft();
      const { message, ticket } = await confirm(draftId);

      assert.match(message.content, /INC-101/);
      assert.match(message.content, /Aguardando analista/);
      assert.match(message.content, /às \d{2}:\d{2}/);
      const trace = agentTraceSchema.parse(message.trace);
      assert.equal(trace.intent, "OPEN_TICKET");
      assert.deepEqual(trace.actions.map(({ tool, status }) => [tool, status]), [["createTicket", "SUCCESS"]]);

      const conversation = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.pendingDraftId, null);
      assert.equal(conversation.pendingDraft, null);
      assert.equal(conversation.messageCount, 1);
      assert.deepEqual(conversation.lastMessageAt, T1);
      assert.equal(ticket.code, "INC-101");
      const stored = await client.message.findUniqueOrThrow({ where: { id: message.id } });
      assert.equal(stored.authorType, "AGENT");
      assert.equal(stored.authorId, null);
    });

    it("não guarda descrição de afetados com escopo INDIVIDUAL", async () => {
      const { draftId } = await conversationWithDraft();
      const { ticket } = await confirm(draftId, request({ affectedScope: "INDIVIDUAL", affectedDescription: "Equipe Comercial" }));
      const stored = await client.ticket.findUniqueOrThrow({ where: { code: ticket.code } });
      assert.equal(stored.affectedScope, "INDIVIDUAL");
      assert.equal(stored.affectedDescription, null);
    });

    it("usa o contador do tipo do rascunho", async () => {
      const { draftId } = await conversationWithDraft(proposal({ type: "REQ" }));
      assert.equal((await confirm(draftId)).ticket.code, "REQ-201");
      assert.equal(await counter("REQ"), 201);
      assert.equal(await counter("INC"), 100);
    });

    it("não repete código entre confirmações simultâneas de conversas diferentes", async () => {
      const first = await conversationWithDraft();
      const second = await conversationWithDraft();
      const results = await Promise.all([confirm(first.draftId), confirm(second.draftId)]);
      assert.deepEqual(results.map(({ ticket }) => ticket.code).sort(), ["INC-101", "INC-102"]);
      assert.equal(await counter(), 102);
    });

    it("em duplo clique cria um único chamado e consome um único número", async () => {
      const { draftId } = await conversationWithDraft();
      const results = await Promise.allSettled([confirm(draftId), confirm(draftId)]);
      const rejected = results.filter((result) => result.status === "rejected");
      assert.equal(rejected.length, 1);
      assert.ok(rejected[0]?.reason instanceof DraftNotFoundError);
      assert.equal(await client.ticket.count(), 1);
      assert.equal(await client.ticketEvent.count(), 1);
      assert.equal(await counter(), 101);
    });

    it("recusa dono errado sem efeitos", async () => {
      const { conversationId, draftId } = await conversationWithDraft();
      await assert.rejects(confirm(draftId, request(), otherOwnerId), DraftNotFoundError);
      await assertNothingPersisted(conversationId, draftId, 100);
    });

    it("recusa body de outro kind sem efeitos", async () => {
      const { conversationId, draftId } = await conversationWithDraft();
      await assert.rejects(confirm(draftId, { kind: "COMPLEMENT", content: "x" }), DraftKindMismatchError);
      await assertNothingPersisted(conversationId, draftId, 100);
    });

    describe("teto de prioridade", () => {
      it("mantém CRITICAL com TEAM, avisa da prioridade e transfere a conversa", async () => {
        const { conversationId, draftId } = await conversationWithDraft(proposal({ priority: "CRITICAL" }));
        const { ticket, message, conversation } = await confirm(draftId);
        assert.equal(ticket.priority, "CRITICAL");
        assert.deepEqual(conversation, { id: conversationId, status: "WAITING_ANALYST" });
        assert.match(message.content, /analista/);
        assert.match(message.content, /Crítica/);
        assert.match(message.content, /1 hora/);
      });

      it("rebaixa para HIGH quando a edição deixa o escopo INDIVIDUAL, com prazo e aviso coerentes", async () => {
        const { draftId } = await conversationWithDraft(proposal({ priority: "CRITICAL" }));
        const { ticket, message, conversation } = await confirm(draftId, request({ affectedScope: "INDIVIDUAL" }));
        assert.equal(ticket.priority, "HIGH");
        assert.equal(conversation.status, "WITH_AGENT");
        assert.equal(ticket.dueAt, computeDueAt("HIGH", T1).toISOString());
        assert.match(message.content, /Alta/);
      });

      it("rebaixa mesmo se o rascunho salvo vier CRITICAL com INDIVIDUAL", async () => {
        const { draftId } = await conversationWithDraft(proposal({ priority: "CRITICAL", affectedScope: "INDIVIDUAL" }));
        const { ticket } = await confirm(draftId, request({ affectedScope: "INDIVIDUAL" }));
        assert.equal(ticket.priority, "HIGH");
      });

      it("ampliar o escopo não sobe a prioridade", async () => {
        const { draftId } = await conversationWithDraft(proposal({ priority: "HIGH", affectedScope: "INDIVIDUAL" }));
        assert.equal((await confirm(draftId, request({ affectedScope: "COMPANY" }))).ticket.priority, "HIGH");
      });
    });

    describe("rollback", () => {
      it("sem linha no contador nada persiste e o rascunho é mantido", async () => {
        const { conversationId, draftId } = await conversationWithDraft();
        await client.ticketCounter.delete({ where: { type: "INC" } });
        await assert.rejects(confirm(draftId), { code: "P2025" });
        assert.equal(await client.ticket.count(), 0);
        assert.equal(await client.ticketEvent.count(), 0);
        assert.equal(await client.message.count({ where: { conversationId } }), 2);
        assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, draftId);
      });

      it("falha depois do evento desfaz chamado, evento, número e limpeza do rascunho", async () => {
        const { conversationId, draftId } = await conversationWithDraft();
        await client.$executeRawUnsafe(
          `CREATE TRIGGER "test_fail_agent_message" BEFORE INSERT ON "Message" BEGIN SELECT RAISE(ABORT, 'falha simulada'); END`,
        );
        try {
          await assert.rejects(confirm(draftId), (error: { meta?: unknown }) => JSON.stringify(error.meta).includes("falha simulada"));
        } finally {
          await client.$executeRawUnsafe(`DROP TRIGGER "test_fail_agent_message"`);
        }
        await assertNothingPersisted(conversationId, draftId, 100);
        assert.equal((await confirm(draftId)).ticket.code, "INC-101");
      });
    });
  });

  describe("cancelDraft", () => {
    it("limpa o rascunho e grava mensagem fixa, sem consumir número nem criar chamado", async () => {
      const { conversationId, draftId } = await conversationWithDraft();
      const { message } = await service.cancelDraft(ownerId, draftId, T1);
      const trace = agentTraceSchema.parse(message.trace);
      assert.equal(trace.intent, "OPEN_TICKET");
      assert.equal(trace.actions[0]?.status, "SKIPPED");
      assert.equal(await counter(), 100);
      assert.equal(await client.ticket.count(), 0);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).pendingDraftId, null);
    });
  });
});
