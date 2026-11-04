import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { SessionUser } from "../shared/session.js";
import type { TicketChange } from "../shared/ticket-events.js";
import { initialTimeline } from "../tickets/ticket-rules.js";
import { TicketServiceUnavailableError } from "../tickets/ticket-service.js";
import { createTicketStatusService, TicketNotFoundError, TicketStatusConflictError } from "../tickets/ticket-status-service.js";
import { AnalystOnlyError } from "./console-service.js";
import { createConsoleTicketService, type ConsoleTicketService } from "./console-ticket-service.js";

const T0 = new Date("2026-11-02T12:00:00.000Z");
const T1 = new Date(T0.getTime() + 3_600_000);

describe("ConsoleTicketService", () => {
  let client: PrismaClient;
  let service: ConsoleTicketService;
  let published: TicketChange[];
  let down = false;
  let analyst: SessionUser;
  let employee: SessionUser;

  async function createTicket(code = "INC-1") {
    const { next } = initialTimeline({ type: "INC", priority: "HIGH", at: T0 });
    await client.ticket.create({
      data: {
        code,
        type: "INC",
        category: "SOFTWARE",
        priority: "HIGH",
        status: next.status,
        title: "Excel trava",
        description: "d",
        affectedScope: "INDIVIDUAL",
        ownerId: employee.id,
        createdAt: T0,
        updatedAt: T0,
        slaStartedAt: next.slaStartedAt,
        dueAt: next.dueAt,
      },
    });
  }

  before(async () => {
    client = await createTestDatabase();
    const a = await client.user.create({ data: { name: "Bruno", email: "bruno@teste.example", role: "ANALYST" } });
    const e = await client.user.create({ data: { name: "Ana", email: "ana@teste.example", role: "EMPLOYEE" } });
    analyst = { id: a.id, name: a.name, email: a.email, role: "ANALYST", department: null };
    employee = { id: e.id, name: e.name, email: e.email, role: "EMPLOYEE", department: null };
    service = createConsoleTicketService({
      statuses: createTicketStatusService(client),
      availability: { ensureAvailable: () => (down ? Promise.reject(new TicketServiceUnavailableError()) : Promise.resolve()) },
      publisher: { publishTicketChange: (change) => published.push(change) },
      now: () => T1,
    });
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    published = [];
    down = false;
  });

  after(async () => {
    await client.$disconnect();
  });

  it("funcionário não lê nem muda chamado", async () => {
    await createTicket();
    await assert.rejects(service.getTicket(employee, "INC-1"), AnalystOnlyError);
    await assert.rejects(service.changeStatus(employee, "INC-1", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" }), AnalystOnlyError);
    assert.equal((await client.ticket.findUniqueOrThrow({ where: { code: "INC-1" } })).status, "WAITING_ANALYST");
  });

  it("código fora do formato é 404 sem ir ao banco", async () => {
    await assert.rejects(service.getTicket(analyst, "abc"), TicketNotFoundError);
    await assert.rejects(service.changeStatus(analyst, "INC-1;", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" }), TicketNotFoundError);
  });

  it("muda o status com o analista da sessão, publica depois e devolve o detalhe atualizado", async () => {
    await createTicket();
    const { ticket, changed } = await service.changeStatus(analyst, "inc-1", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" });
    assert.equal(changed, true);
    assert.equal(ticket.status, "IN_PROGRESS");
    assert.deepEqual(ticket.events.at(-1)?.actor, { id: analyst.id, name: "Bruno" });
    assert.deepEqual(published, [{ ownerId: employee.id, ticketCode: "INC-1", conversationId: null }]);
  });

  it("sem mudança (changed false) não publica", async () => {
    await createTicket();
    await service.changeStatus(analyst, "INC-1", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" });
    published = [];
    const again = await service.changeStatus(analyst, "INC-1", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" });
    assert.equal(again.changed, false);
    assert.deepEqual(published, []);
  });

  it("conflito não publica", async () => {
    await createTicket();
    await assert.rejects(service.changeStatus(analyst, "INC-1", { toStatus: "RESOLVED", expectedStatus: "IN_PROGRESS", note: "x" }), TicketStatusConflictError);
    assert.deepEqual(published, []);
  });

  it("serviço indisponível: 503 antes de escrever e na leitura", async () => {
    await createTicket();
    down = true;
    await assert.rejects(service.changeStatus(analyst, "INC-1", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" }), TicketServiceUnavailableError);
    await assert.rejects(service.getTicket(analyst, "INC-1"), TicketServiceUnavailableError);
    assert.equal((await client.ticket.findUniqueOrThrow({ where: { code: "INC-1" } })).status, "WAITING_ANALYST");
  });
});
