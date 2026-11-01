import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestContext } from "@mastra/core/request-context";
import { ticketLookupCriteriaSchema, type TicketLookupCriteria, type TicketLookupResult } from "../../shared/chat.js";
import { TicketServiceUnavailableError, type TicketService } from "../../tickets/ticket-service.js";
import { createSearchMyOpenTicketsTool, searchTickets } from "./search-my-open-tickets.js";
import { createTurnRecorder, type TurnContextValues, type TurnRecorder } from "./turn-recorder.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");
const NO_MATCH: TicketLookupResult = { outcome: "NO_MATCH", openTicketCount: 3, totalMatches: 0, tickets: [] };
const NO_OPEN: TicketLookupResult = { outcome: "NO_OPEN_TICKETS", openTicketCount: 0, totalMatches: 0, tickets: [] };

type Call = { ownerId: string; criteria: TicketLookupCriteria; now: Date };

function fakeService(result: () => Promise<TicketLookupResult>) {
  const calls: Call[] = [];
  const service: TicketService = {
    lookupOpenTickets(ownerId, criteria, now) {
      calls.push({ ownerId, criteria, now });
      return result();
    },
  };
  return { service, calls };
}

function contextOf(values: Partial<TurnContextValues>): RequestContext<TurnContextValues> {
  const context = new RequestContext<TurnContextValues>();
  if (values.actorId !== undefined) context.set("actorId", values.actorId);
  if (values.recorder !== undefined) context.set("recorder", values.recorder);
  return context;
}

function run(ticketService: TicketService, criteria: TicketLookupCriteria, requestContext: RequestContext<TurnContextValues>) {
  return searchTickets({ ticketService, now: () => NOW }, criteria, requestContext);
}

describe("searchMyOpenTickets", () => {
  it("repassa ao serviço o dono fixado no turno e os critérios", async () => {
    const { service, calls } = fakeService(() => Promise.resolve(NO_MATCH));
    const recorder = createTurnRecorder();
    const result = await run(service, { code: "INC-1" }, contextOf({ actorId: "u1", recorder }));
    assert.deepEqual(calls, [{ ownerId: "u1", criteria: { code: "INC-1" }, now: NOW }]);
    assert.deepEqual(result, NO_MATCH);
  });

  it("a tool expõe a consulta com o mesmo contrato pelo execute do Mastra", async () => {
    const { service, calls } = fakeService(() => Promise.resolve(NO_MATCH));
    const tool = createSearchMyOpenTicketsTool({ ticketService: service, now: () => NOW });
    const result = await tool.execute?.({ code: "INC-1" }, { requestContext: contextOf({ actorId: "u1", recorder: createTurnRecorder() }) as RequestContext });
    assert.equal(calls[0]?.ownerId, "u1");
    assert.deepEqual(result, NO_MATCH);
  });

  it("falha fechada sem dono no contexto: não consulta o serviço", async () => {
    const { service, calls } = fakeService(() => Promise.resolve(NO_MATCH));
    const recorder = createTurnRecorder();
    const result = await run(service, {}, contextOf({ recorder }));
    assert.equal(calls.length, 0);
    assert.equal(result.outcome, "UNAVAILABLE");
    assert.equal(recorder.last()?.outcome, "UNAVAILABLE");
  });

  it("converte TicketServiceUnavailableError em UNAVAILABLE", async () => {
    const { service } = fakeService(() => Promise.reject(new TicketServiceUnavailableError()));
    const recorder = createTurnRecorder();
    const result = await run(service, {}, contextOf({ actorId: "u1", recorder }));
    assert.deepEqual(result, { outcome: "UNAVAILABLE", openTicketCount: null, totalMatches: null, tickets: [] });
    assert.deepEqual(recorder.last(), result);
  });

  it("não trata erro inesperado como indisponibilidade do legado", async () => {
    const { service } = fakeService(() => Promise.reject(new TypeError("bug")));
    await assert.rejects(run(service, {}, contextOf({ actorId: "u1", recorder: createTurnRecorder() })), TypeError);
  });

  it("registra todas as execuções e a última vale", async () => {
    const results = [NO_MATCH, NO_OPEN];
    const { service } = fakeService(() => Promise.resolve(results.shift() ?? NO_MATCH));
    const recorder: TurnRecorder = createTurnRecorder();
    const requestContext = contextOf({ actorId: "u1", recorder });
    await run(service, { code: "INC-1" }, requestContext);
    await run(service, {}, requestContext);
    assert.equal(recorder.all().length, 2);
    assert.deepEqual(recorder.last(), NO_OPEN);
  });

  it("não tem campo de usuário na entrada", () => {
    const { service } = fakeService(() => Promise.resolve(NO_MATCH));
    const tool = createSearchMyOpenTicketsTool({ ticketService: service });
    assert.equal(tool.inputSchema, ticketLookupCriteriaSchema);
    const fields = Object.keys(ticketLookupCriteriaSchema.shape);
    assert.deepEqual(fields.filter((field) => /owner|user|actor|employee/i.test(field)), []);
    assert.equal(ticketLookupCriteriaSchema.safeParse({ ownerId: "outro" }).success, false);
  });
});
