import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "../app.js";
import { createAuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import { createConsoleTicketService } from "../console/console-ticket-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createEventBus, type BusEvent } from "../realtime/event-bus.js";
import { createFanout, type Fanout } from "../realtime/fanout.js";
import type { ChangeTicketStatusResponse, ConsoleTicketDetail } from "../shared/console-tickets.js";
import { initialTimeline } from "../tickets/ticket-rules.js";
import { TicketServiceUnavailableError } from "../tickets/ticket-service.js";
import { createTicketStatusService } from "../tickets/ticket-status-service.js";
import type { ApiConfig } from "./config.js";
import { unusedChatService, unusedConsoleService, unusedKnowledgeService } from "./test-support.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const config: ApiConfig = { sessionSecret: SECRET, corsOrigins: ["http://localhost:3000"], isProduction: false };
const T0 = new Date(Date.now() - 60 * 60_000);

describe("rotas de chamados do console", () => {
  let client: PrismaClient;
  let server: Server;
  let url: string;
  let fanout: Fanout;
  let busEvents: BusEvent[];
  let down = false;
  let ownerId: string;
  let otherOwnerId: string;
  let bruno: string;
  let ana: string;

  const cookieOf = async (userId: string) => `nexo_session=${await issueSessionToken({ userId, secret: SECRET, now: new Date() })}`;

  function request(method: "GET" | "POST", path: string, cookie: string | undefined, body?: unknown): Promise<Response> {
    return fetch(`${url}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  const get = (path: string, cookie: string = bruno) => request("GET", path, cookie);
  const post = (path: string, body: unknown, cookie: string = bruno) => request("POST", path, cookie, body);

  async function assertError(res: Response, status: number, code: string, message?: string) {
    assert.equal(res.status, status);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const { error } = (await res.json()) as { error: { code: string; message: string } };
    assert.equal(error.code, code);
    if (message !== undefined) assert.equal(error.message, message);
  }

  const json = async <T>(res: Response): Promise<T> => {
    assert.equal(res.status, 200, await res.clone().text());
    assert.equal(res.headers.get("cache-control"), "no-store");
    return (await res.json()) as T;
  };

  async function createTicket(code = "INC-1", type: "INC" | "REQ" = "INC") {
    const { next, eventDueAt } = initialTimeline({ type, priority: "MEDIUM", at: T0 });
    await client.ticket.create({
      data: {
        code,
        type,
        category: "SOFTWARE",
        priority: "MEDIUM",
        status: next.status,
        title: "Excel trava",
        description: "Trava ao abrir planilha grande.",
        affectedScope: "INDIVIDUAL",
        ownerId,
        createdAt: T0,
        updatedAt: T0,
        slaStartedAt: next.slaStartedAt,
        dueAt: next.dueAt,
        events: { create: { type: "CREATED", actorType: "EMPLOYEE", actorId: ownerId, toStatus: next.status, dueAt: eventDueAt, createdAt: T0 } },
      },
    });
  }

  before(async () => {
    client = await createTestDatabase();
    ownerId = (await client.user.create({ data: { name: "Ana Souza", email: "ana@teste.example", role: "EMPLOYEE", department: "Financeiro" } })).id;
    otherOwnerId = (await client.user.create({ data: { name: "Outra", email: "outra@teste.example", role: "EMPLOYEE" } })).id;
    const brunoId = (await client.user.create({ data: { name: "Bruno Martins", email: "bruno@teste.example", role: "ANALYST" } })).id;
    bruno = await cookieOf(brunoId);
    ana = await cookieOf(ownerId);

    const eventBus = createEventBus();
    eventBus.subscribe({ onEvent: (event) => busEvents.push(event) });
    fanout = createFanout({ bus: eventBus, readConversation: () => Promise.reject(new Error("não usado")) });
    const consoleTicketService = createConsoleTicketService({
      statuses: createTicketStatusService(client),
      availability: { ensureAvailable: () => (down ? Promise.reject(new TicketServiceUnavailableError()) : Promise.resolve()) },
      publisher: fanout,
    });
    server = createApp({
      eventBus,
      config,
      authService: createAuthService(client),
      chatService: unusedChatService,
      consoleService: unusedConsoleService,
      consoleTicketService,
      knowledgeService: unusedKnowledgeService,
    }).listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    await client.ticketEvent.deleteMany();
    await client.ticket.deleteMany();
    await client.conversation.deleteMany();
    busEvents = [];
    down = false;
  });

  after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await client.$disconnect();
  });

  it("401 sem sessão e 403 para funcionário, inclusive com corpo inválido (403 antes de 400)", async () => {
    await createTicket();
    await assertError(await request("GET", "/console/tickets/INC-1", undefined), 401, "SESSION_MISSING");
    await assertError(await request("POST", "/console/tickets/INC-1/status", undefined, {}), 401, "SESSION_MISSING");
    await assertError(await get("/console/tickets/INC-1", ana), 403, "FORBIDDEN");
    await assertError(await post("/console/tickets/INC-1/status", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" }, ana), 403, "FORBIDDEN");
    await assertError(await post("/console/tickets/INC-1/status", { lixo: true }, ana), 403, "FORBIDDEN");
  });

  it("GET devolve o detalhe com histórico e transições permitidas, sem diferenciar maiúsculas", async () => {
    await createTicket();
    const { ticket } = await json<{ ticket: ConsoleTicketDetail }>(await get("/console/tickets/inc-1"));
    assert.equal(ticket.code, "INC-1");
    assert.deepEqual(ticket.owner, { id: ownerId, name: "Ana Souza", department: "Financeiro" });
    assert.deepEqual(ticket.allowedStatuses, ["IN_PROGRESS", "WAITING_EMPLOYEE", "RESOLVED"]);
    assert.deepEqual(ticket.statusNoteRequired, ["WAITING_EMPLOYEE", "RESOLVED"]);
    assert.equal(ticket.events.length, 1);
    assert.equal(ticket.slaPaused, false);
  });

  it("GET de chamado inexistente ou código inválido: 404 TICKET_NOT_FOUND", async () => {
    await assertError(await get("/console/tickets/INC-999"), 404, "TICKET_NOT_FOUND", "Chamado não encontrado.");
    await assertError(await get("/console/tickets/qualquer-coisa"), 404, "TICKET_NOT_FOUND");
  });

  it("POST muda o status, devolve o detalhe e publica tickets.changed", async () => {
    await createTicket();
    const conversation = await client.conversation.create({ data: { ownerId } });
    const body = await json<ChangeTicketStatusResponse>(
      await post("/console/tickets/INC-1/status", {
        toStatus: "WAITING_EMPLOYEE",
        expectedStatus: "WAITING_ANALYST",
        note: "  Preciso do print do erro.  ",
        conversationId: conversation.id,
      }),
    );
    assert.equal(body.changed, true);
    assert.equal(body.ticket.status, "WAITING_EMPLOYEE");
    assert.equal(body.ticket.statusLabel, "Aguardando funcionário");
    assert.deepEqual([body.ticket.slaPaused, body.ticket.dueAt, body.ticket.overdue], [true, null, false]);
    const last = body.ticket.events.at(-1);
    assert.equal(last?.content, "Preciso do print do erro.");
    assert.equal(last?.conversationId, conversation.id);
    assert.deepEqual(last?.actor?.name, "Bruno Martins");
    await fanout.idle();
    assert.deepEqual(
      busEvents.map((event) => (event.type === "tickets.changed" ? [event.ownerId, event.ticketCode, event.conversationId] : event.type)),
      [[ownerId, "INC-1", conversation.id]],
    );
  });

  it("repetir a mesma mudança devolve 200 changed false e não publica de novo", async () => {
    await createTicket();
    const change = { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" };
    assert.equal((await json<ChangeTicketStatusResponse>(await post("/console/tickets/INC-1/status", change))).changed, true);
    const again = await json<ChangeTicketStatusResponse>(await post("/console/tickets/INC-1/status", change));
    assert.equal(again.changed, false);
    assert.equal(again.ticket.events.length, 2);
    await fanout.idle();
    assert.equal(busEvents.length, 1);
  });

  it("400 INVALID_REQUEST: corpo fora do contrato, nota ausente ou grande, conversa de outro dono", async () => {
    await createTicket();
    const foreign = await client.conversation.create({ data: { ownerId: otherOwnerId } });
    const bodies: unknown[] = [
      {},
      { toStatus: "IN_PROGRESS" },
      { toStatus: "WAITING_ANALYST", expectedStatus: "WAITING_ANALYST" },
      { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", extra: 1 },
      { toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST" },
      { toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST", note: "   " },
      { toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST", note: "x".repeat(1001) },
      { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", conversationId: foreign.id },
      { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST", conversationId: "nao-existe" },
    ];
    for (const body of bodies) await assertError(await post("/console/tickets/INC-1/status", body), 400, "INVALID_REQUEST");
    assert.equal((await client.ticketEvent.count()), 1);
  });

  it("409 TICKET_STATUS_CONFLICT quando o status mudou", async () => {
    await createTicket();
    await post("/console/tickets/INC-1/status", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" });
    await assertError(
      await post("/console/tickets/INC-1/status", { toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST", note: "ok" }),
      409,
      "TICKET_STATUS_CONFLICT",
      "O status deste chamado mudou. Atualize e tente de novo.",
    );
  });

  it("409 TICKET_TRANSITION_NOT_ALLOWED para APPROVED em INC e para chamado resolvido", async () => {
    await createTicket();
    await assertError(
      await post("/console/tickets/INC-1/status", { toStatus: "APPROVED", expectedStatus: "WAITING_ANALYST" }),
      409,
      "TICKET_TRANSITION_NOT_ALLOWED",
      "Essa mudança de status não é permitida para este chamado.",
    );
    await post("/console/tickets/INC-1/status", { toStatus: "RESOLVED", expectedStatus: "WAITING_ANALYST", note: "Resolvido." });
    await assertError(
      await post("/console/tickets/INC-1/status", { toStatus: "IN_PROGRESS", expectedStatus: "RESOLVED" }),
      409,
      "TICKET_TRANSITION_NOT_ALLOWED",
    );
  });

  it("404 no POST para chamado inexistente", async () => {
    await assertError(await post("/console/tickets/REQ-404/status", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" }), 404, "TICKET_NOT_FOUND");
  });

  it("503 TICKET_SERVICE_UNAVAILABLE com o serviço fora", async () => {
    await createTicket();
    down = true;
    await assertError(await get("/console/tickets/INC-1"), 503, "TICKET_SERVICE_UNAVAILABLE");
    await assertError(await post("/console/tickets/INC-1/status", { toStatus: "IN_PROGRESS", expectedStatus: "WAITING_ANALYST" }), 503, "TICKET_SERVICE_UNAVAILABLE");
  });
});
