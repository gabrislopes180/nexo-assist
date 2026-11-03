import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { TicketStatus } from "../generated/prisma/enums.js";
import { createTicketService, type FullTicketService } from "./ticket-service.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

describe("TicketService", () => {
  let client: PrismaClient;
  let service: FullTicketService;
  let ownerId: string;
  let otherOwnerId: string;

  function createTicket(owner: string, code: string, status: TicketStatus, dueAt: Date | null) {
    return client.ticket.create({
      data: {
        code,
        type: "INC",
        category: "SOFTWARE",
        priority: "MEDIUM",
        status,
        title: `Título ${code}`,
        description: "Descrição",
        affectedScope: "INDIVIDUAL",
        ownerId: owner,
        createdAt: hoursFromNow(-24),
        dueAt,
      },
    });
  }

  before(async () => {
    client = await createTestDatabase();
    service = createTicketService(client);
    ownerId = (await client.user.create({ data: { name: "Dona", email: "dona@teste.example", role: "EMPLOYEE" } })).id;
    otherOwnerId = (await client.user.create({ data: { name: "Outro", email: "outro@teste.example", role: "EMPLOYEE" } })).id;
  });

  beforeEach(async () => {
    await client.ticket.deleteMany();
  });

  after(async () => {
    await client.$disconnect();
  });

  it("devolve NO_OPEN_TICKETS quando o dono não tem chamado", async () => {
    await createTicket(otherOwnerId, "INC-9", "IN_PROGRESS", hoursFromNow(1));
    assert.deepEqual(await service.lookupOpenTickets(ownerId, {}, NOW), {
      outcome: "NO_OPEN_TICKETS",
      openTicketCount: 0,
      totalMatches: 0,
      tickets: [],
    });
  });

  it("não considera chamado resolvido, mesmo buscando pelo código", async () => {
    await createTicket(ownerId, "INC-1", "RESOLVED", null);
    assert.equal((await service.lookupOpenTickets(ownerId, { code: "INC-1" }, NOW)).outcome, "NO_OPEN_TICKETS");

    await createTicket(ownerId, "INC-2", "IN_PROGRESS", hoursFromNow(1));
    assert.deepEqual(await service.lookupOpenTickets(ownerId, { code: "INC-1" }, NOW), {
      outcome: "NO_MATCH",
      openTicketCount: 1,
      totalMatches: 0,
      tickets: [],
    });
  });

  it("código de chamado de outro dono resulta em NO_MATCH", async () => {
    await createTicket(ownerId, "INC-1", "IN_PROGRESS", hoursFromNow(1));
    await createTicket(otherOwnerId, "INC-2", "IN_PROGRESS", hoursFromNow(1));
    const result = await service.lookupOpenTickets(ownerId, { code: "INC-2" }, NOW);
    assert.equal(result.outcome, "NO_MATCH");
    assert.equal(result.openTicketCount, 1);
  });

  it("devolve SINGLE_MATCH com overdue calculado", async () => {
    await createTicket(ownerId, "INC-1", "IN_PROGRESS", hoursFromNow(-1));
    await createTicket(ownerId, "INC-2", "IN_PROGRESS", hoursFromNow(1));
    const result = await service.lookupOpenTickets(ownerId, { code: "INC-1" }, NOW);
    assert.equal(result.outcome, "SINGLE_MATCH");
    assert.equal(result.openTicketCount, 2);
    assert.equal(result.totalMatches, 1);
    assert.equal(result.tickets[0]?.overdue, true);
  });

  it("devolve dueAt null e não vencido em WAITING_EMPLOYEE", async () => {
    await createTicket(ownerId, "INC-1", "WAITING_EMPLOYEE", null);
    const result = await service.lookupOpenTickets(ownerId, {}, NOW);
    assert.equal(result.outcome, "SINGLE_MATCH");
    assert.equal(result.tickets[0]?.dueAt, null);
    assert.equal(result.tickets[0]?.overdue, false);
    assert.equal(result.tickets[0]?.statusLabel, "Aguardando funcionário");
  });

  describe("findSimilarTickets", () => {
    const resolvedAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

    async function createResolved(owner: string, code: string, resolvedAt: Date) {
      const ticket = await createTicket(owner, code, "RESOLVED", null);
      await client.ticket.update({ where: { id: ticket.id }, data: { resolvedAt } });
    }

    it("devolve abertos e resolvidos reabríveis, sem description", async () => {
      await createTicket(ownerId, "INC-1", "IN_PROGRESS", hoursFromNow(1));
      await createResolved(ownerId, "INC-2", resolvedAgo(1));
      const similar = await service.findSimilarTickets(ownerId, ["título"], NOW);
      assert.deepEqual(similar.map((t) => [t.code, t.status, t.canReopen]), [
        ["INC-1", "IN_PROGRESS", false],
        ["INC-2", "RESOLVED", true],
      ]);
      assert.equal(similar[1]?.statusLabel, "Resolvido");
      assert.equal("description" in (similar[0] ?? {}), false);
    });

    it("inclui resolvido a exatos 7 dias e exclui a 8 dias", async () => {
      await createResolved(ownerId, "INC-1", resolvedAgo(7));
      await createResolved(ownerId, "INC-2", resolvedAgo(8));
      assert.deepEqual((await service.findSimilarTickets(ownerId, ["título"], NOW)).map((t) => t.code), ["INC-1"]);
    });

    it("não devolve chamados de outro dono", async () => {
      await createTicket(otherOwnerId, "INC-1", "IN_PROGRESS", hoursFromNow(1));
      await createResolved(otherOwnerId, "INC-2", resolvedAgo(1));
      assert.deepEqual(await service.findSimilarTickets(ownerId, ["título"], NOW), []);
    });

    it("reaproveita o match: só os de maior pontuação", async () => {
      await createTicket(ownerId, "INC-1", "IN_PROGRESS", hoursFromNow(1));
      await createTicket(ownerId, "INC-2", "IN_PROGRESS", hoursFromNow(1));
      const similar = await service.findSimilarTickets(ownerId, ["título", "inc-2"], NOW);
      assert.deepEqual(similar.map((t) => t.code), ["INC-2"]);
    });

    it("uma palavra genérica em comum não basta para ser parecido", async () => {
      await createTicket(ownerId, "INC-1", "IN_PROGRESS", hoursFromNow(1));
      await client.ticket.update({ where: { code: "INC-1" }, data: { description: "A caixa parou de sincronizar." } });
      assert.deepEqual(await service.findSimilarTickets(ownerId, ["mouse", "sem fio", "parou", "funcionar"], NOW), []);
    });

    it("sem keyword útil não devolve nada", async () => {
      await createTicket(ownerId, "INC-1", "IN_PROGRESS", hoursFromNow(1));
      assert.deepEqual(await service.findSimilarTickets(ownerId, ["   "], NOW), []);
      assert.deepEqual(await service.findSimilarTickets(ownerId, [], NOW), []);
    });

    it("only reopenable filtra antes do corte: 6 abertos parecidos não escondem o reabrível", async () => {
      for (let i = 1; i <= 6; i++) await createTicket(ownerId, `INC-${i}`, "IN_PROGRESS", hoursFromNow(i));
      await createResolved(ownerId, "INC-7", resolvedAgo(1));
      await createResolved(ownerId, "INC-8", resolvedAgo(8));
      const all = await service.findSimilarTickets(ownerId, ["título"], NOW);
      assert.equal(all.length, 5);
      assert.equal(all.some((t) => t.code === "INC-7"), false);
      const reopenable = await service.findSimilarTickets(ownerId, ["título"], NOW, { only: "reopenable" });
      assert.deepEqual(reopenable.map((t) => [t.code, t.status, t.canReopen]), [["INC-7", "RESOLVED", true]]);
    });

    it("corta em 5", async () => {
      for (let i = 1; i <= 7; i++) await createTicket(ownerId, `INC-${i}`, "IN_PROGRESS", hoursFromNow(i));
      assert.equal((await service.findSimilarTickets(ownerId, ["título"], NOW)).length, 5);
    });
  });

  describe("findResolvedTicketByCode", () => {
    const resolvedAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);

    async function createResolved(owner: string, code: string, resolvedAt: Date) {
      const ticket = await createTicket(owner, code, "RESOLVED", null);
      await client.ticket.update({ where: { id: ticket.id }, data: { resolvedAt } });
    }

    it("devolve resolvido reabrível, sem diferenciar caixa e sem description", async () => {
      await createResolved(ownerId, "INC-1", resolvedAgo(1));
      const found = await service.findResolvedTicketByCode(ownerId, "inc-1", NOW);
      assert.equal(found?.canReopen, true);
      assert.equal(found?.ticket.code, "INC-1");
      assert.equal(found?.ticket.status, "RESOLVED");
      assert.equal(found?.ticket.canReopen, true);
      assert.equal(found && "description" in found.ticket, false);
    });

    it("marca canReopen false a 8 dias e true a exatos 7", async () => {
      await createResolved(ownerId, "INC-1", resolvedAgo(8));
      await createResolved(ownerId, "INC-2", resolvedAgo(7));
      assert.equal((await service.findResolvedTicketByCode(ownerId, "INC-1", NOW))?.canReopen, false);
      assert.equal((await service.findResolvedTicketByCode(ownerId, "INC-2", NOW))?.canReopen, true);
    });

    it("para chamado aberto devolve o status aberto e canReopen false", async () => {
      await createTicket(ownerId, "INC-1", "IN_PROGRESS", hoursFromNow(1));
      const found = await service.findResolvedTicketByCode(ownerId, "INC-1", NOW);
      assert.equal(found?.ticket.status, "IN_PROGRESS");
      assert.equal(found?.canReopen, false);
    });

    it("devolve null para inexistente ou de outro dono", async () => {
      await createResolved(otherOwnerId, "INC-1", resolvedAgo(1));
      assert.equal(await service.findResolvedTicketByCode(ownerId, "INC-1", NOW), null);
      assert.equal(await service.findResolvedTicketByCode(ownerId, "INC-9", NOW), null);
    });
  });

  describe("listOwnerTickets", () => {
    it("traz só os do dono: abertos por updatedAt desc e depois resolvidos por resolvedAt desc", async () => {
      const open1 = await createTicket(ownerId, "INC-1", "IN_PROGRESS", hoursFromNow(1));
      const open2 = await createTicket(ownerId, "INC-2", "WAITING_EMPLOYEE", null);
      const done1 = await createTicket(ownerId, "INC-3", "RESOLVED", null);
      const done2 = await createTicket(ownerId, "INC-4", "RESOLVED", null);
      await createTicket(otherOwnerId, "INC-9", "IN_PROGRESS", hoursFromNow(1));
      await client.ticket.update({ where: { id: open1.id }, data: { updatedAt: hoursFromNow(-5) } });
      await client.ticket.update({ where: { id: open2.id }, data: { updatedAt: hoursFromNow(-1) } });
      await client.ticket.update({ where: { id: done1.id }, data: { resolvedAt: hoursFromNow(-30) } });
      await client.ticket.update({ where: { id: done2.id }, data: { resolvedAt: hoursFromNow(-10) } });

      const tickets = await service.listOwnerTickets(ownerId);
      assert.deepEqual(tickets.map((t) => t.code), ["INC-2", "INC-1", "INC-4", "INC-3"]);
      const [first] = tickets;
      assert.equal(first?.statusLabel, "Aguardando funcionário");
      assert.equal(first?.resolvedAt, null);
      assert.equal(tickets[2]?.resolvedAt, hoursFromNow(-10).toISOString());
      assert.equal("description" in (first ?? {}), false);
    });

    it("sem chamados devolve lista vazia", async () => {
      assert.deepEqual(await service.listOwnerTickets(ownerId), []);
    });
  });

  describe("ensureAvailable", () => {
    it("resolve com o banco no ar", async () => {
      await service.ensureAvailable();
    });
  });

  describe("findOpenTicketByCode", () => {
    it("devolve o resumo do chamado aberto do dono, sem diferenciar caixa", async () => {
      await createTicket(ownerId, "INC-1", "WAITING_EMPLOYEE", null);
      const ticket = await service.findOpenTicketByCode(ownerId, "inc-1", NOW);
      assert.equal(ticket?.code, "INC-1");
      assert.equal(ticket?.statusLabel, "Aguardando funcionário");
      assert.equal(ticket && "description" in ticket, false);
    });

    it("não devolve chamado resolvido, de outro dono ou inexistente", async () => {
      await createTicket(ownerId, "INC-1", "RESOLVED", null);
      await createTicket(otherOwnerId, "INC-2", "IN_PROGRESS", hoursFromNow(1));
      assert.equal(await service.findOpenTicketByCode(ownerId, "INC-1", NOW), null);
      assert.equal(await service.findOpenTicketByCode(ownerId, "INC-2", NOW), null);
      assert.equal(await service.findOpenTicketByCode(ownerId, "INC-3", NOW), null);
    });
  });

  it("devolve MULTIPLE_MATCHES só com chamados abertos do dono, com total real acima do corte", async () => {
    for (let i = 1; i <= 7; i++) await createTicket(ownerId, `INC-${i}`, "WAITING_ANALYST", hoursFromNow(i));
    await createTicket(ownerId, "INC-8", "RESOLVED", null);
    await createTicket(otherOwnerId, "INC-9", "WAITING_ANALYST", hoursFromNow(1));
    const result = await service.lookupOpenTickets(ownerId, {}, NOW);
    assert.equal(result.outcome, "MULTIPLE_MATCHES");
    assert.equal(result.openTicketCount, 7);
    assert.equal(result.totalMatches, 7);
    assert.deepEqual(result.tickets.map((t) => t.code), ["INC-1", "INC-2", "INC-3", "INC-4", "INC-5"]);
    assert.equal("description" in (result.tickets[0] ?? {}), false);
  });
});
