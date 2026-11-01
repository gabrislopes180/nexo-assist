import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ConversationStatus, TicketStatus } from "../generated/prisma/enums.js";
import type { ProposedTicketDraft } from "../shared/chat.js";
import { complementDraftSchema } from "../shared/conversation-draft.js";
import { agentTraceSchema, type AgentTrace } from "../shared/transparency.js";
import { ConversationNotWithAgentError, createConversationService, type ConversationService } from "./conversation-service.js";
import { DraftNotFoundError, TicketNotOpenError } from "./ticket-draft.js";

const T0 = new Date("2026-11-01T12:00:00.000Z");
const T1 = new Date("2026-11-01T13:00:00.000Z");
const T2 = new Date("2026-11-01T14:00:00.000Z");
const DUE = new Date("2026-11-03T12:00:00.000Z");
const TRACE: AgentTrace = { understood: "x", intent: "COMPLEMENT", actions: [], confidence: "HIGH", reason: "y" };
const CODE = "INC-7";

const proposal: ProposedTicketDraft = {
  kind: "COMPLEMENT",
  content: "O erro também acontece no Excel.",
  ticket: {
    code: CODE,
    type: "INC",
    category: "SOFTWARE",
    priority: "MEDIUM",
    status: "IN_PROGRESS",
    statusLabel: "Em andamento",
    title: "Office travando",
    createdAt: T0.toISOString(),
    dueAt: DUE.toISOString(),
    overdue: false,
  },
};

describe("rascunho de complemento", () => {
  let client: PrismaClient;
  let service: ConversationService;
  let ownerId: string;
  let otherOwnerId: string;
  let ticketId: string;

  async function createTicket(status: TicketStatus = "IN_PROGRESS", dueAt: Date | null = DUE) {
    const ticket = await client.ticket.create({
      data: {
        code: CODE,
        type: "INC",
        category: "SOFTWARE",
        priority: "MEDIUM",
        status,
        title: "Office travando",
        description: "Descrição original",
        affectedScope: "INDIVIDUAL",
        ownerId,
        createdAt: T0,
        updatedAt: T0,
        slaStartedAt: dueAt ? T0 : null,
        dueAt,
      },
    });
    ticketId = ticket.id;
  }

  /** Conversa com um rascunho salvo pelo caminho real, o `completeTurn`. */
  async function conversationWithDraft() {
    const turn = await service.startTurn(ownerId, { content: "complementa aí", now: T0 });
    const stored = await service.completeTurn(turn, { content: "Confirma?", trace: TRACE, ticketDraft: proposal, now: T0 });
    assert.ok(stored.draftId);
    return { conversationId: turn.conversationId, draftId: stored.draftId };
  }

  const setStatus = (id: string, status: ConversationStatus) => client.conversation.update({ where: { id }, data: { status } });
  const confirm = (draftId: string, owner = ownerId, content = "Texto final") => service.confirmDraft(owner, draftId, content, T1);
  const eventsOf = () => client.ticketEvent.findMany({ where: { ticketId } });
  const draftIdOf = async (id: string) => (await client.conversation.findUniqueOrThrow({ where: { id } })).pendingDraftId;

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
  });

  after(async () => {
    await client.$disconnect();
  });

  describe("completeTurn", () => {
    it("salva o rascunho válido na conversa", async () => {
      await createTicket();
      const { conversationId, draftId } = await conversationWithDraft();
      const conversation = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.pendingDraftId, draftId);
      assert.deepEqual(complementDraftSchema.parse(conversation.pendingDraft), {
        draftId,
        createdAt: T0.toISOString(),
        kind: "COMPLEMENT",
        ticketCode: CODE,
        content: proposal.content,
      });
    });

    it("sem rascunho no turno mantém o anterior", async () => {
      const { conversationId, draftId } = await conversationWithDraft();
      const turn = await service.startTurn(ownerId, { conversationId, content: "e o prazo?", now: T1 });
      const stored = await service.completeTurn(turn, { content: "Amanhã.", trace: TRACE, now: T1 });
      assert.equal(stored.draftId, null);
      assert.equal(await draftIdOf(conversationId), draftId);
    });

    it("um rascunho novo substitui o anterior", async () => {
      const { conversationId, draftId } = await conversationWithDraft();
      const turn = await service.startTurn(ownerId, { conversationId, content: "troca", now: T1 });
      const stored = await service.completeTurn(turn, { content: "Confirma?", trace: TRACE, ticketDraft: proposal, now: T1 });
      assert.notEqual(stored.draftId, draftId);
      assert.equal(await draftIdOf(conversationId), stored.draftId);
      await assert.rejects(confirm(draftId), DraftNotFoundError);
    });

    it("turno desfeito não deixa rascunho nem mexe no anterior", async () => {
      const { conversationId, draftId } = await conversationWithDraft();
      await service.abortTurn(await service.startTurn(ownerId, { conversationId, content: "falha", now: T1 }));
      assert.equal(await draftIdOf(conversationId), draftId);
    });
  });

  describe("readDraft", () => {
    it("devolve o rascunho só para o dono", async () => {
      const { draftId } = await conversationWithDraft();
      assert.equal((await service.readDraft(ownerId, draftId)).ticketCode, CODE);
      await assert.rejects(service.readDraft(otherOwnerId, draftId), DraftNotFoundError);
      await assert.rejects(service.readDraft(ownerId, "nao-existe"), DraftNotFoundError);
    });
  });

  describe("confirmDraft", () => {
    it("grava o COMMENT com o texto confirmado e iguala updatedAt ao evento", async () => {
      await createTicket();
      const { conversationId, draftId } = await conversationWithDraft();
      await confirm(draftId);

      const [event, ...others] = await eventsOf();
      assert.deepEqual(others, []);
      assert.equal(event?.type, "COMMENT");
      assert.equal(event?.actorType, "EMPLOYEE");
      assert.equal(event?.actorId, ownerId);
      assert.equal(event?.content, "Texto final");
      assert.equal(event?.conversationId, conversationId);
      assert.equal(event?.dueAt, null);
      assert.deepEqual(event?.createdAt, T1);

      const ticket = await client.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      assert.deepEqual(ticket.updatedAt, T1);
      assert.equal(ticket.description, "Descrição original");
      assert.equal(ticket.status, "IN_PROGRESS");
      assert.deepEqual(ticket.dueAt, DUE);
    });

    it("limpa o rascunho e grava a mensagem do agent com trace válido", async () => {
      await createTicket();
      const { conversationId, draftId } = await conversationWithDraft();
      const { message, ticket } = await confirm(draftId);

      assert.equal(ticket.code, CODE);
      assert.match(message.content, new RegExp(CODE));
      assert.equal(agentTraceSchema.parse(message.trace).intent, "COMPLEMENT");
      assert.equal(message.trace.actions[0]?.status, "SUCCESS");

      const conversation = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.pendingDraftId, null);
      assert.equal(conversation.pendingDraft, null);
      assert.deepEqual(conversation.lastMessageAt, T1);
      const stored = await client.message.findUniqueOrThrow({ where: { id: message.id } });
      assert.equal(stored.authorType, "AGENT");
      assert.deepEqual(stored.trace, message.trace);
    });

    it("não consome a cota de mensagens", async () => {
      await createTicket();
      const { conversationId, draftId } = await conversationWithDraft();
      await confirm(draftId);
      assert.equal((await client.conversation.findUniqueOrThrow({ where: { id: conversationId } })).messageCount, 1);
    });

    it("em WAITING_EMPLOYEE só comenta, sem mudar status nem prazo", async () => {
      await createTicket("WAITING_EMPLOYEE", null);
      const { draftId } = await conversationWithDraft();
      const { ticket } = await confirm(draftId);
      assert.equal(ticket.status, "WAITING_EMPLOYEE");
      const stored = await client.ticket.findUniqueOrThrow({ where: { id: ticketId } });
      assert.equal(stored.status, "WAITING_EMPLOYEE");
      assert.equal(stored.dueAt, null);
      assert.equal(stored.slaStartedAt, null);
    });

    it("recusa dono errado igual a rascunho inexistente, sem efeitos", async () => {
      await createTicket();
      const { conversationId, draftId } = await conversationWithDraft();
      await assert.rejects(confirm(draftId, otherOwnerId), DraftNotFoundError);
      await assert.rejects(confirm("nao-existe"), DraftNotFoundError);
      assert.equal(await draftIdOf(conversationId), draftId);
      assert.equal((await eventsOf()).length, 0);
    });

    it("rascunho já usado dá não encontrado", async () => {
      await createTicket();
      const { draftId } = await conversationWithDraft();
      await confirm(draftId);
      await assert.rejects(confirm(draftId), DraftNotFoundError);
      assert.equal((await eventsOf()).length, 1);
    });

    it("em duplo clique concorrente grava um único evento", async () => {
      await createTicket();
      const { draftId } = await conversationWithDraft();
      const results = await Promise.allSettled([confirm(draftId), confirm(draftId)]);
      const rejected = results.filter((result) => result.status === "rejected");
      assert.equal(rejected.length, 1);
      assert.ok(rejected[0]?.reason instanceof DraftNotFoundError);
      assert.equal((await eventsOf()).length, 1);
    });

    it("chamado resolvido: recusa, nada persiste e mantém o rascunho", async () => {
      await createTicket("RESOLVED", null);
      const { conversationId, draftId } = await conversationWithDraft();
      const messagesBefore = await client.message.count({ where: { conversationId } });
      await assert.rejects(confirm(draftId), TicketNotOpenError);
      assert.equal(await draftIdOf(conversationId), draftId);
      assert.equal((await eventsOf()).length, 0);
      assert.equal(await client.message.count({ where: { conversationId } }), messagesBefore);
    });

    it("chamado de outro dono é recusado como não aberto", async () => {
      await createTicket();
      await client.ticket.update({ where: { id: ticketId }, data: { ownerId: otherOwnerId } });
      const { draftId } = await conversationWithDraft();
      await assert.rejects(confirm(draftId), TicketNotOpenError);
      assert.equal((await eventsOf()).length, 0);
    });

    for (const status of ["WAITING_ANALYST", "WITH_ANALYST", "CLOSED"] as const) {
      it(`recusa conversa em ${status} e mantém o rascunho`, async () => {
        await createTicket();
        const { conversationId, draftId } = await conversationWithDraft();
        await setStatus(conversationId, status);
        await assert.rejects(confirm(draftId), ConversationNotWithAgentError);
        assert.equal(await draftIdOf(conversationId), draftId);
        assert.equal((await eventsOf()).length, 0);
      });
    }

    it("o evento continua append-only depois de gravado", async () => {
      await createTicket();
      const { draftId } = await conversationWithDraft();
      await confirm(draftId);
      const [event] = await eventsOf();
      assert.ok(event);
      await assert.rejects(client.ticketEvent.update({ where: { id: event.id }, data: { content: "alterado" } }));
      assert.equal((await eventsOf())[0]?.content, "Texto final");
    });
  });

  describe("cancelDraft", () => {
    it("limpa o rascunho e grava mensagem fixa com trace válido, sem tocar no chamado nem na cota", async () => {
      await createTicket();
      const { conversationId, draftId } = await conversationWithDraft();
      const { message } = await service.cancelDraft(ownerId, draftId, T2);

      assert.equal(agentTraceSchema.safeParse(message.trace).success, true);
      const conversation = await client.conversation.findUniqueOrThrow({ where: { id: conversationId } });
      assert.equal(conversation.pendingDraftId, null);
      assert.equal(conversation.pendingDraft, null);
      assert.equal(conversation.messageCount, 1);
      assert.deepEqual(conversation.lastMessageAt, T2);
      assert.equal((await eventsOf()).length, 0);
      assert.deepEqual((await client.ticket.findUniqueOrThrow({ where: { id: ticketId } })).updatedAt, T0);
    });

    it("recusa dono errado e rascunho já cancelado", async () => {
      const { draftId } = await conversationWithDraft();
      await assert.rejects(service.cancelDraft(otherOwnerId, draftId, T2), DraftNotFoundError);
      await service.cancelDraft(ownerId, draftId, T2);
      await assert.rejects(service.cancelDraft(ownerId, draftId, T2), DraftNotFoundError);
    });

    it("recusa conversa fora do agent", async () => {
      const { conversationId, draftId } = await conversationWithDraft();
      await setStatus(conversationId, "WITH_ANALYST");
      await assert.rejects(service.cancelDraft(ownerId, draftId, T2), ConversationNotWithAgentError);
    });
  });
});
