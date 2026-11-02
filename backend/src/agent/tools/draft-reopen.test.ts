import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestContext } from "@mastra/core/request-context";
import { proposedReopenDraftSchema, type SimilarTicket } from "../../shared/chat.js";
import { TicketServiceUnavailableError, type ResolvedTicketReader, type SimilarTicketReader } from "../../tickets/ticket-service.js";
import { createDraftReopenTool, draftReopen, draftReopenInputSchema, type DraftReopenInput } from "./draft-reopen.js";
import { createTurnRecorder, type TurnContextValues, type TurnRecorder } from "./turn-recorder.js";

const NOW = new Date("2026-11-02T12:00:00.000Z");

const resolved = (code: string, overrides: Partial<SimilarTicket> = {}): SimilarTicket => ({
  code,
  type: "INC",
  category: "ACCESS",
  priority: "HIGH",
  status: "RESOLVED",
  statusLabel: "Resolvido",
  title: "Senha do SAP bloqueada",
  createdAt: "2026-10-20T12:00:00.000Z",
  dueAt: null,
  overdue: false,
  canReopen: true,
  ...overrides,
});

type Reader = ResolvedTicketReader & SimilarTicketReader;

function fakeReader({
  byCode = () => Promise.resolve(null),
  similar = () => Promise.resolve([]),
}: {
  byCode?: (code: string) => Promise<{ ticket: SimilarTicket; canReopen: boolean } | null>;
  similar?: () => Promise<SimilarTicket[]>;
} = {}) {
  const calls: { method: string; ownerId: string; arg: unknown }[] = [];
  const ticketService: Reader = {
    findResolvedTicketByCode(ownerId, code) {
      calls.push({ method: "byCode", ownerId, arg: code });
      return byCode(code);
    },
    // Imita o serviço: com `only: "reopenable"`, filtra antes do corte em 5.
    async findSimilarTickets(ownerId, keywords, _now, options) {
      calls.push({ method: "similar", ownerId, arg: { keywords, only: options?.only ?? null } });
      const all = await similar();
      return (options?.only === "reopenable" ? all.filter((ticket) => ticket.status === "RESOLVED" && ticket.canReopen) : all).slice(0, 5);
    },
  };
  return { ticketService, calls };
}

function contextOf(actorId: string | null = "marina", recorder: TurnRecorder = createTurnRecorder()): RequestContext<TurnContextValues> {
  const context = new RequestContext<TurnContextValues>();
  if (actorId !== null) context.set("actorId", actorId);
  context.set("recorder", recorder);
  return context;
}

const run = (ticketService: Reader, input: DraftReopenInput, context = contextOf()) => draftReopen({ ticketService, now: () => NOW }, input, context);

const reopenable = (code: string) => Promise.resolve({ ticket: resolved(code.toUpperCase()), canReopen: true });

describe("draftReopen", () => {
  it("falha fechada sem dono: não consulta o serviço", async () => {
    const { ticketService, calls } = fakeReader({ byCode: reopenable });
    const recorder = createTurnRecorder();
    const result = await run(ticketService, { code: "INC-20150", reason: "voltou" }, contextOf(null, recorder));
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { outcome: "UNAVAILABLE" });
    assert.equal(recorder.drafts().length, 1);
  });

  it("por código: proposta válida com o chamado do serviço e o dono da sessão", async () => {
    const { ticketService, calls } = fakeReader({ byCode: reopenable });
    const recorder = createTurnRecorder();
    const result = await run(ticketService, { code: "inc-20150", reason: "A senha voltou a bloquear." }, contextOf("marina", recorder));
    assert.deepEqual(result, { outcome: "DRAFTED", code: "INC-20150" });
    assert.deepEqual(calls, [{ method: "byCode", ownerId: "marina", arg: "inc-20150" }]);
    const last = recorder.drafts().at(-1);
    const proposal = last?.outcome === "DRAFTED" ? last.proposal : null;
    assert.equal(proposedReopenDraftSchema.safeParse(proposal).success, true);
    assert.equal(proposal?.kind === "REOPEN" ? proposal.reason : null, "A senha voltou a bloquear.");
  });

  it("chamado ainda aberto: STILL_OPEN", async () => {
    const { ticketService } = fakeReader({ byCode: () => Promise.resolve({ ticket: resolved("INC-20311", { status: "IN_PROGRESS", canReopen: false }), canReopen: false }) });
    assert.deepEqual(await run(ticketService, { code: "INC-20311", reason: "x" }), { outcome: "STILL_OPEN", code: "INC-20311" });
  });

  it("resolvido fora da janela: WINDOW_EXPIRED", async () => {
    const { ticketService } = fakeReader({ byCode: () => Promise.resolve({ ticket: resolved("INC-19987", { canReopen: false }), canReopen: false }) });
    assert.deepEqual(await run(ticketService, { code: "INC-19987", reason: "x" }), { outcome: "WINDOW_EXPIRED", code: "INC-19987" });
  });

  it("alheio ou inexistente: NOT_FOUND, sem dizer qual dos dois", async () => {
    const { ticketService } = fakeReader();
    assert.deepEqual(await run(ticketService, { code: "INC-20410", reason: "x" }), { outcome: "NOT_FOUND" });
  });

  it("por keywords: considera só os reabríveis", async () => {
    const { ticketService } = fakeReader({ similar: () => Promise.resolve([resolved("INC-20311", { status: "IN_PROGRESS", canReopen: false }), resolved("INC-20150")]) });
    assert.deepEqual(await run(ticketService, { keywords: ["sap", "senha"], reason: "voltou" }), { outcome: "DRAFTED", code: "INC-20150" });
  });

  it("por keywords: 6 abertos parecidos não escondem o reabrível, e o aberto não é consultado", async () => {
    const open = Array.from({ length: 6 }, (_, index) => resolved(`INC-3000${index}`, { status: "IN_PROGRESS", canReopen: false }));
    const { ticketService, calls } = fakeReader({ similar: () => Promise.resolve([...open, resolved("INC-20150")]) });
    assert.deepEqual(await run(ticketService, { keywords: ["sap"], reason: "voltou" }), { outcome: "DRAFTED", code: "INC-20150" });
    assert.deepEqual(calls, [{ method: "similar", ownerId: "marina", arg: { keywords: ["sap"], only: "reopenable" } }]);
  });

  it("por keywords sem reabrível: só então busca sem filtro para oferecer complemento", async () => {
    const { ticketService, calls } = fakeReader({ similar: () => Promise.resolve([resolved("INC-20311", { status: "IN_PROGRESS", canReopen: false })]) });
    assert.deepEqual(await run(ticketService, { keywords: ["notebook"], reason: "voltou" }), { outcome: "STILL_OPEN", code: "INC-20311" });
    assert.deepEqual(calls.map((call) => call.arg), [
      { keywords: ["notebook"], only: "reopenable" },
      { keywords: ["notebook"], only: null },
    ]);
  });

  it("por keywords com vários reabríveis: MULTIPLE com a lista", async () => {
    const { ticketService } = fakeReader({ similar: () => Promise.resolve([resolved("INC-20150"), resolved("INC-20151")]) });
    const result = await run(ticketService, { keywords: ["sap"], reason: "voltou" });
    assert.equal(result.outcome, "MULTIPLE");
    assert.deepEqual(result.outcome === "MULTIPLE" ? result.tickets.map((ticket) => ticket.code) : [], ["INC-20150", "INC-20151"]);
  });

  it("por keywords com só um aberto parecido: STILL_OPEN, para oferecer complemento", async () => {
    const { ticketService } = fakeReader({ similar: () => Promise.resolve([resolved("INC-20311", { status: "IN_PROGRESS", canReopen: false })]) });
    assert.deepEqual(await run(ticketService, { keywords: ["notebook"], reason: "voltou" }), { outcome: "STILL_OPEN", code: "INC-20311" });
  });

  it("por keywords sem nada parecido: NOT_FOUND", async () => {
    const { ticketService } = fakeReader();
    assert.deepEqual(await run(ticketService, { keywords: ["notebook"], reason: "voltou" }), { outcome: "NOT_FOUND" });
  });

  it("sem código nem keywords: NOT_FOUND, sem consultar", async () => {
    const { ticketService, calls } = fakeReader();
    assert.deepEqual(await run(ticketService, { reason: "voltou" }), { outcome: "NOT_FOUND" });
    assert.equal(calls.length, 0);
  });

  it("sem motivo: pede o que voltou a falhar, sem proposta", async () => {
    const { ticketService } = fakeReader({ byCode: reopenable });
    const recorder = createTurnRecorder();
    const result = await run(ticketService, { code: "INC-20150" }, contextOf("marina", recorder));
    assert.deepEqual(result, { outcome: "NEEDS_REASON", code: "INC-20150" });
    assert.ok(recorder.drafts().every((execution) => execution.outcome !== "DRAFTED"));
  });

  it("serviço indisponível: UNAVAILABLE", async () => {
    const { ticketService } = fakeReader({ byCode: () => Promise.reject(new TicketServiceUnavailableError()) });
    assert.deepEqual(await run(ticketService, { code: "INC-20150", reason: "x" }), { outcome: "UNAVAILABLE" });
  });

  it("não trata erro inesperado como indisponibilidade", async () => {
    const { ticketService } = fakeReader({ byCode: () => Promise.reject(new TypeError("bug")) });
    await assert.rejects(run(ticketService, { code: "INC-20150", reason: "x" }), TypeError);
  });

  it("a tool expõe o mesmo contrato pelo execute do Mastra", async () => {
    const { ticketService } = fakeReader({ byCode: reopenable });
    const tool = createDraftReopenTool({ ticketService });
    const result = await tool.execute?.({ code: "INC-20150", reason: "voltou" }, { requestContext: contextOf() as RequestContext });
    assert.deepEqual(result, { outcome: "DRAFTED", code: "INC-20150" });
  });

  it("não tem campo de usuário e recusa campo extra", () => {
    assert.deepEqual(Object.keys(draftReopenInputSchema.shape).sort(), ["code", "keywords", "reason"]);
    assert.equal(draftReopenInputSchema.safeParse({ code: "INC-1", reason: "x", ownerId: "juliana" }).success, false);
  });
});
