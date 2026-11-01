import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { TicketStatus } from "../generated/prisma/enums.js";
import { createTicketService, type TicketCodeReader, type TicketService } from "./ticket-service.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const hoursFromNow = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

describe("TicketService", () => {
  let client: PrismaClient;
  let service: TicketService & TicketCodeReader;
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
