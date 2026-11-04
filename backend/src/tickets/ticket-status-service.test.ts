import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { startAgentTurn } from "../conversations/test-helpers.js";
import { createConversationService } from "../conversations/conversation-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { TicketPriority, TicketType } from "../generated/prisma/enums.js";
import type { AgentTrace } from "../shared/transparency.js";
import { computeDueAt } from "./sla.js";
import { initialTimeline } from "./ticket-rules.js";
import { createTicketService } from "./ticket-service.js";
import {
  createTicketStatusService,
  InvalidTicketConversationError,
  TicketNotFoundError,
  TicketStatusConflictError,
  TicketStatusNoteRequiredError,
  TicketTransitionNotAllowedError,
  type ChangeStatusInput,
  type TicketStatusService,
} from "./ticket-status-service.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Segunda-feira, 09:00 em São Paulo. */
const T0 = new Date("2026-11-02T12:00:00.000Z");
const T1 = new Date(T0.getTime() + HOUR);
const T2 = new Date(T0.getTime() + 2 * HOUR);

describe("TicketStatusService", () => {
  let client: PrismaClient;
  let service: TicketStatusService;
  let ownerId: string;
  let otherOwnerId: string;
  let bruno: { id: string; name: string };
  let rafael: { id: string; name: string };

  async function createTicket({
    code = "INC-1",
    type = "INC" as TicketType,
    priority = "HIGH" as TicketPriority,
    at = T0,
  }: { code?: string; type?: TicketType; priority?: TicketPriority; at?: Date } = {}) {
    const { next, eventDueAt } = initialTimeline({ type, priority, at });
    return client.ticket.create({
      data: {
        code,
        type,
        category: "HARDWARE",
        priority,
        status: next.status,
        title: `Título ${code}`,
        description: "Teclado não responde.",
        affectedScope: "INDIVIDUAL",
        ownerId,
        createdAt: at,
        updatedAt: next.updatedAt,
        slaStartedAt: next.slaStartedAt,
        dueAt: next.dueAt,
        events: { create: { type: "CREATED", actorType: "EMPLOYEE", actorId: ownerId, toStatus: next.status, dueAt: eventDueAt, createdAt: at } },
      },
    });
  }

  const change = (input: Partial<ChangeStatusInput> & Pick<ChangeStatusInput, "toStatus" | "expectedStatus">) =>
    service.changeStatus({ code: "INC-1", actor: bruno, note: null, conversationId: null, now: T1, ...input });

  const ticketOf = (code = "INC-1") => client.ticket.findUniqueOrThrow({ where: { code } });
  const eventsOf = async (code = "INC-1") =>
    client.ticketEvent.findMany({ where: { ticket: { code } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

  before(async () => {
    client = await createTestDatabase();
    service = createTicketStatusService(client);
    ownerId = (await client.user.create({ data: { name: "Dona", email: "dona@teste.example", role: "EMPLOYEE", department: "Financeiro" } })).id;
    otherOwnerId = (await client.user.create({ data: { name: "Outro", email: "outro@teste.example", role: "EMPLOYEE" } })).id;
    bruno = await client.user.create({ data: { name: "Bruno", email: "bruno@teste.example", role: "ANALYST" }, select: { id: true, name: true } });
    rafael = await client.user.create({ data: { name: "Rafael", email: "rafael@teste.example", role: "ANALYST" }, select: { id: true, name: true } });
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.message.deleteMany();
    await client.conversation.deleteMany();
  });

  after(async () => {
    await client.$disconnect();
  });

  describe("getDetail", () => {
    it("lê pelo código sem diferenciar maiúsculas e monta o detalhe", async () => {
      await createTicket({ code: "REQ-7", type: "REQ", priority: "MEDIUM" });
      const detail = await service.getDetail("req-7", T1);
      assert.equal(detail.code, "REQ-7");
      assert.equal(detail.statusLabel, "Aguardando analista");
      assert.equal(detail.description, "Teclado não responde.");
      assert.equal(detail.affectedScope, "INDIVIDUAL");
      assert.equal(detail.affectedDescription, null);
      assert.deepEqual(detail.owner, { id: ownerId, name: "Dona", department: "Financeiro" });
      assert.equal(detail.slaStartedAt, T0.toISOString());
      assert.equal(detail.dueAt, computeDueAt("MEDIUM", T0).toISOString());
      assert.equal(detail.overdue, false);
      assert.equal(detail.slaPaused, false);
      assert.deepEqual(detail.allowedStatuses, ["IN_PROGRESS", "WAITING_EMPLOYEE", "APPROVED", "RESOLVED"]);
      assert.deepEqual(detail.statusNoteRequired, ["WAITING_EMPLOYEE", "RESOLVED"]);
      assert.equal(detail.events.length, 1);
      assert.deepEqual(
        { ...detail.events[0], id: "x" },
        {
          id: "x",
          type: "CREATED",
          actorType: "EMPLOYEE",
          actor: { id: ownerId, name: "Dona" },
          content: null,
          fromStatus: null,
          toStatus: "WAITING_ANALYST",
          fromPriority: null,
          toPriority: null,
          dueAt: computeDueAt("MEDIUM", T0).toISOString(),
          conversationId: null,
          createdAt: T0.toISOString(),
        },
      );
    });

    it("marca vencido em relação a now", async () => {
      await createTicket({ priority: "CRITICAL" });
      assert.equal((await service.getDetail("INC-1", T2)).overdue, true);
    });

    it("chamado inexistente lança TicketNotFoundError", async () => {
      await assert.rejects(service.getDetail("INC-404", T1), TicketNotFoundError);
    });

    it("traz no máximo os 200 eventos mais recentes, em ordem cronológica", async () => {
      const { id } = await createTicket();
      await client.ticketEvent.createMany({
        data: Array.from({ length: 205 }, (_, i) => ({
          ticketId: id,
          type: "COMMENT" as const,
          actorType: "EMPLOYEE" as const,
          actorId: ownerId,
          content: `c${i}`,
          createdAt: new Date(T0.getTime() + (i + 1) * 1000),
        })),
      });
      const { events } = await service.getDetail("INC-1", T1);
      assert.equal(events.length, 200);
      assert.equal(events[0]?.content, "c5");
      assert.equal(events.at(-1)?.content, "c204");
    });
  });

  describe("changeStatus", () => {
    it("WAITING_ANALYST -> IN_PROGRESS abre janela nova e grava o evento com o ator", async () => {
      await createTicket();
      const result = await change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", note: "Vou verificar." });
      assert.deepEqual(result, { changed: true, ownerId, ticketCode: "INC-1", conversationId: null });
      const ticket = await ticketOf();
      assert.equal(ticket.status, "IN_PROGRESS");
      assert.equal(ticket.slaStartedAt?.toISOString(), T1.toISOString());
      assert.equal(ticket.dueAt?.toISOString(), computeDueAt("HIGH", T1).toISOString());
      assert.equal(ticket.updatedAt.toISOString(), T1.toISOString());
      const event = (await eventsOf()).at(-1);
      assert.equal(event?.type, "STATUS_CHANGED");
      assert.equal(event?.actorType, "ANALYST");
      assert.equal(event?.actorId, bruno.id);
      assert.equal(event?.content, "Vou verificar.");
      assert.deepEqual([event?.fromStatus, event?.toStatus], ["WAITING_ANALYST", "IN_PROGRESS"]);
      assert.equal(event?.dueAt?.toISOString(), computeDueAt("HIGH", T1).toISOString());
      assert.equal(event?.createdAt.toISOString(), T1.toISOString());
    });

    it("Em andamento tira o vencido de um chamado atrasado", async () => {
      await createTicket({ priority: "CRITICAL" });
      assert.equal((await service.getDetail("INC-1", T2)).overdue, true);
      await change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", now: T2 });
      assert.equal((await service.getDetail("INC-1", T2)).overdue, false);
    });

    it("WAITING_EMPLOYEE pausa o prazo: dueAt e slaStartedAt nulos, nunca vencido", async () => {
      await createTicket({ priority: "CRITICAL" });
      await change({ toStatus: "WAITING_EMPLOYEE", expectedStatus: "WAITING_ANALYST", note: "Mande o print do erro.", now: T2 });
      const ticket = await ticketOf();
      assert.deepEqual([ticket.status, ticket.dueAt, ticket.slaStartedAt], ["WAITING_EMPLOYEE", null, null]);
      const detail = await service.getDetail("INC-1", new Date(T2.getTime() + 10 * DAY));
      assert.deepEqual([detail.overdue, detail.slaPaused, detail.dueAt], [false, true, null]);
      assert.deepEqual(detail.allowedStatuses, ["IN_PROGRESS", "RESOLVED"]);
      assert.equal(detail.events.at(-1)?.dueAt, null);
    });

    it("WAITING_EMPLOYEE -> IN_PROGRESS retoma com janela nova", async () => {
      await createTicket();
      await change({ toStatus: "WAITING_EMPLOYEE", expectedStatus: "WAITING_ANALYST", note: "Falta o patrimônio." });
      await change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_EMPLOYEE", now: T2 });
      const ticket = await ticketOf();
      assert.equal(ticket.slaStartedAt?.toISOString(), T2.toISOString());
      assert.equal(ticket.dueAt?.toISOString(), computeDueAt("HIGH", T2).toISOString());
    });

    it("APPROVED em REQ abre janela nova", async () => {
      await createTicket({ code: "REQ-1", type: "REQ", priority: "LOW" });
      await change({ code: "REQ-1", toStatus: "APPROVED", expectedStatus: "WAITING_ANALYST" });
      const ticket = await ticketOf("REQ-1");
      assert.equal(ticket.status, "APPROVED");
      assert.equal(ticket.dueAt?.toISOString(), computeDueAt("LOW", T1).toISOString());
    });

    it("RESOLVED grava resolvedAt, zera o prazo e não oferece mais transições", async () => {
      await createTicket();
      await change({ toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST", note: "Troquei o teclado." });
      const ticket = await ticketOf();
      assert.deepEqual([ticket.status, ticket.resolvedAt?.toISOString(), ticket.dueAt, ticket.slaStartedAt], ["RESOLVED", T1.toISOString(), null, null]);
      const detail = await service.getDetail("INC-1", T1);
      assert.deepEqual(detail.allowedStatuses, []);
      assert.equal(detail.resolvedAt, T1.toISOString());
      assert.equal(detail.events.at(-1)?.content, "Troquei o teclado.");
    });

    it("analista resolve e o funcionário consegue reabrir em até 7 dias (fim a fim)", async () => {
      await createTicket();
      await change({ toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST", note: "Troquei o teclado." });
      const reader = createTicketService(client);
      const within = await reader.findResolvedTicketByCode(ownerId, "INC-1", new Date(T1.getTime() + 7 * DAY));
      assert.equal(within?.canReopen, true);
      assert.equal((await reader.findResolvedTicketByCode(ownerId, "INC-1", new Date(T1.getTime() + 7 * DAY + 1)))?.canReopen, false);

      const conversations = createConversationService(client);
      const reopenAt = new Date(T1.getTime() + 3 * DAY);
      const turn = await startAgentTurn(conversations, ownerId, { content: "voltou o problema", now: reopenAt });
      const trace: AgentTrace = { understood: "x", intent: "REOPEN", actions: [], confidence: "HIGH", reason: "y" };
      assert.ok(within);
      const stored = await conversations.completeTurn(turn, {
        content: "Confirma?",
        trace,
        ticketDraft: { kind: "REOPEN", reason: "Voltou.", ticket: within.ticket },
        now: reopenAt,
      });
      assert.ok(stored.draftId);
      await conversations.confirmDraft(ownerId, stored.draftId, { kind: "REOPEN", reason: "Voltou a falhar." }, reopenAt);
      const ticket = await ticketOf();
      assert.deepEqual([ticket.status, ticket.resolvedAt], ["WAITING_ANALYST", null]);
      assert.deepEqual(
        (await eventsOf()).map((event) => event.type),
        ["CREATED", "STATUS_CHANGED", "REOPENED"],
      );
    });

    it("mesmo destino já aplicado: changed false, sem evento novo", async () => {
      await createTicket();
      await change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" });
      const again = await change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", now: T2 });
      assert.equal(again.changed, false);
      assert.equal((await eventsOf()).length, 2);
      assert.equal((await ticketOf()).updatedAt.toISOString(), T1.toISOString());
    });

    it("status atual diferente do esperado: TicketStatusConflictError, nada gravado", async () => {
      await createTicket();
      await change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" });
      await assert.rejects(change({ toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST", note: "x" }), TicketStatusConflictError);
      assert.equal((await ticketOf()).status, "IN_PROGRESS");
      assert.equal((await eventsOf()).length, 2);
    });

    it("transições fora da regra: TicketTransitionNotAllowedError", async () => {
      await createTicket();
      await assert.rejects(change({ toStatus: "APPROVED", expectedStatus: "WAITING_ANALYST" }), TicketTransitionNotAllowedError);
      await change({ toStatus: "WAITING_EMPLOYEE", expectedStatus: "WAITING_ANALYST", note: "x" });
      await createTicket({ code: "REQ-1", type: "REQ" });
      await change({ code: "REQ-1", toStatus: "WAITING_EMPLOYEE", expectedStatus: "WAITING_ANALYST", note: "x" });
      await assert.rejects(change({ code: "REQ-1", toStatus: "APPROVED", expectedStatus: "WAITING_EMPLOYEE" }), TicketTransitionNotAllowedError);
      await change({ toStatus: "RESOLVED", expectedStatus: "WAITING_EMPLOYEE", note: "x" });
      await assert.rejects(change({ toStatus: "IN_PROGRESS", expectedStatus: "RESOLVED" }), TicketTransitionNotAllowedError);
      assert.equal((await eventsOf()).length, 3);
    });

    it("nota obrigatória para WAITING_EMPLOYEE e RESOLVED", async () => {
      await createTicket();
      await assert.rejects(change({ toStatus: "WAITING_EMPLOYEE", expectedStatus: "WAITING_ANALYST" }), TicketStatusNoteRequiredError);
      await assert.rejects(change({ toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST" }), TicketStatusNoteRequiredError);
      assert.equal((await eventsOf()).length, 1);
      assert.equal((await change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" })).changed, true);
    });

    it("chamado inexistente: TicketNotFoundError", async () => {
      await assert.rejects(change({ code: "INC-404", toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" }), TicketNotFoundError);
    });

    it("conversationId do dono vai para o evento; inexistente ou de outro dono é recusado", async () => {
      await createTicket();
      const own = await client.conversation.create({ data: { ownerId } });
      const foreign = await client.conversation.create({ data: { ownerId: otherOwnerId } });
      await assert.rejects(
        change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", conversationId: foreign.id }),
        InvalidTicketConversationError,
      );
      await assert.rejects(
        change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", conversationId: "nao-existe" }),
        InvalidTicketConversationError,
      );
      assert.equal((await eventsOf()).length, 1);
      const result = await change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", conversationId: own.id });
      assert.equal(result.conversationId, own.id);
      assert.equal((await eventsOf()).at(-1)?.conversationId, own.id);
    });

    it("evento nunca fica antes do último: at = max(now, updatedAt)", async () => {
      await createTicket({ at: T2 });
      await change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", now: T1 });
      assert.equal((await eventsOf()).at(-1)?.createdAt.toISOString(), T2.toISOString());
      assert.equal((await ticketOf()).dueAt?.toISOString(), computeDueAt("HIGH", T2).toISOString());
    });

    it("dois analistas, destinos diferentes: um vence e o outro recebe conflito", async () => {
      await createTicket();
      const results = await Promise.allSettled([
        change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" }),
        change({ toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST", note: "x", actor: rafael }),
      ]);
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result) => result.status === "rejected");
      assert.equal(fulfilled.length, 1);
      assert.equal(rejected.length, 1);
      assert.ok(rejected[0]?.status === "rejected" && rejected[0].reason instanceof TicketStatusConflictError);
      assert.equal((await eventsOf()).length, 2);
    });

    it("complemento do funcionário x analista em WAITING_EMPLOYEE: a transação decide, sem estado misto", async () => {
      await createTicket();
      await change({ toStatus: "WAITING_EMPLOYEE", expectedStatus: "WAITING_ANALYST", note: "Mande o print." });
      const conversations = createConversationService(client);
      const summary = await createTicketService(client).findOpenTicketByCode(ownerId, "INC-1", T1);
      assert.ok(summary);
      const turn = await startAgentTurn(conversations, ownerId, { content: "segue o print", now: T1 });
      const trace: AgentTrace = { understood: "x", intent: "COMPLEMENT", actions: [], confidence: "HIGH", reason: "y" };
      const stored = await conversations.completeTurn(turn, { content: "Confirma?", trace, ticketDraft: { kind: "COMPLEMENT", content: "Print anexado.", ticket: summary }, now: T1 });
      assert.ok(stored.draftId);
      const draftId = stored.draftId;

      const [complement, analyst] = await Promise.allSettled([
        conversations.confirmDraft(ownerId, draftId, { kind: "COMPLEMENT", content: "Print anexado." }, T2),
        change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_EMPLOYEE", now: T2 }),
      ]);
      assert.equal(complement.status, "fulfilled");
      const ticket = await ticketOf();
      const types = (await eventsOf()).map((event) => `${event.type}:${event.actorType}`);
      if (analyst.status === "fulfilled") {
        // Analista primeiro: o complemento vira só COMMENT, sem devolução automática.
        assert.equal(ticket.status, "IN_PROGRESS");
        assert.equal(types.filter((type) => type === "STATUS_CHANGED:SYSTEM").length, 0);
      } else {
        // Complemento primeiro: o sistema devolveu à fila e o analista recebe conflito.
        assert.ok(analyst.reason instanceof TicketStatusConflictError);
        assert.equal(ticket.status, "WAITING_ANALYST");
        assert.equal(types.filter((type) => type === "STATUS_CHANGED:SYSTEM").length, 1);
      }
      assert.equal(types.filter((type) => type === "COMMENT:EMPLOYEE").length, 1);
    });

    it("dois analistas, mesmo destino: os dois recebem sucesso e só um evento é gravado", async () => {
      await createTicket();
      const results = await Promise.all([
        change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" }),
        change({ toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", actor: rafael }),
      ]);
      assert.deepEqual(results.map((result) => result.changed).sort(), [false, true]);
      assert.equal((await eventsOf()).length, 2);
    });
  });
});

