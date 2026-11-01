import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestContext } from "@mastra/core/request-context";
import type { TicketSummary } from "../../shared/chat.js";
import { TicketServiceUnavailableError, type TicketCodeReader } from "../../tickets/ticket-service.js";
import { createDraftComplementTool, draftComplement, draftComplementInputSchema } from "./draft-complement.js";
import { createTurnRecorder, type TurnContextValues, type TurnRecorder } from "./turn-recorder.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");

const ticket = (code: string): TicketSummary => ({
  code,
  type: "INC",
  category: "HARDWARE",
  priority: "HIGH",
  status: "IN_PROGRESS",
  statusLabel: "Em atendimento",
  title: "Notebook lento",
  createdAt: "2026-10-28T12:00:00.000Z",
  dueAt: null,
  overdue: false,
});

function fakeReader(result: (code: string) => Promise<TicketSummary | null>) {
  const calls: { ownerId: string; code: string; now: Date }[] = [];
  const ticketService: TicketCodeReader = {
    findOpenTicketByCode(ownerId, code, now) {
      calls.push({ ownerId, code, now });
      return result(code);
    },
  };
  return { ticketService, calls };
}

function contextOf(values: { actorId?: string; recorder?: TurnRecorder }): RequestContext<TurnContextValues> {
  const context = new RequestContext<TurnContextValues>();
  if (values.actorId !== undefined) context.set("actorId", values.actorId);
  if (values.recorder !== undefined) context.set("recorder", values.recorder);
  return context;
}

const input = { code: "INC-20311", content: "Ele também desliga sozinho." };

describe("draftComplement", () => {
  it("valida com o dono do turno e registra a proposta, sem revelar conteúdo extra", async () => {
    const { ticketService, calls } = fakeReader((code) => Promise.resolve(ticket(code)));
    const recorder = createTurnRecorder();
    const result = await draftComplement({ ticketService, now: () => NOW }, input, contextOf({ actorId: "u1", recorder }));
    assert.deepEqual(calls, [{ ownerId: "u1", code: "INC-20311", now: NOW }]);
    assert.deepEqual(result, { outcome: "DRAFTED", code: "INC-20311" });
    assert.deepEqual(recorder.drafts(), [
      { outcome: "DRAFTED", proposal: { kind: "COMPLEMENT", ticket: ticket("INC-20311"), content: input.content } },
    ]);
  });

  it("usa o chamado devolvido pelo serviço, não o código digitado", async () => {
    const { ticketService } = fakeReader(() => Promise.resolve(ticket("INC-20311")));
    const recorder = createTurnRecorder();
    const result = await draftComplement({ ticketService }, { ...input, code: "inc-20311" }, contextOf({ actorId: "u1", recorder }));
    assert.deepEqual(result, { outcome: "DRAFTED", code: "INC-20311" });
  });

  it("falha fechada sem dono no contexto: não consulta o serviço", async () => {
    const { ticketService, calls } = fakeReader((code) => Promise.resolve(ticket(code)));
    const recorder = createTurnRecorder();
    const result = await draftComplement({ ticketService }, input, contextOf({ recorder }));
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { outcome: "SERVICE_UNAVAILABLE" });
    assert.deepEqual(recorder.drafts(), [{ outcome: "SERVICE_UNAVAILABLE" }]);
  });

  it("chamado que não serve não cria proposta nem revela o motivo", async () => {
    const { ticketService } = fakeReader(() => Promise.resolve(null));
    const recorder = createTurnRecorder();
    const result = await draftComplement({ ticketService }, input, contextOf({ actorId: "u1", recorder }));
    assert.deepEqual(result, { outcome: "TICKET_NOT_AVAILABLE" });
    assert.deepEqual(recorder.drafts(), [{ outcome: "TICKET_NOT_AVAILABLE" }]);
  });

  it("converte TicketServiceUnavailableError em SERVICE_UNAVAILABLE", async () => {
    const { ticketService } = fakeReader(() => Promise.reject(new TicketServiceUnavailableError()));
    const result = await draftComplement({ ticketService }, input, contextOf({ actorId: "u1", recorder: createTurnRecorder() }));
    assert.deepEqual(result, { outcome: "SERVICE_UNAVAILABLE" });
  });

  it("não trata erro inesperado como indisponibilidade", async () => {
    const { ticketService } = fakeReader(() => Promise.reject(new TypeError("bug")));
    await assert.rejects(draftComplement({ ticketService }, input, contextOf({ actorId: "u1", recorder: createTurnRecorder() })), TypeError);
  });

  it("guarda todas as execuções na ordem", async () => {
    const { ticketService } = fakeReader((code) => Promise.resolve(ticket(code)));
    const recorder = createTurnRecorder();
    const context = contextOf({ actorId: "u1", recorder });
    await draftComplement({ ticketService }, input, context);
    await draftComplement({ ticketService }, { code: "REQ-1", content: "Outro texto." }, context);
    assert.equal(recorder.drafts().length, 2);
    const last = recorder.drafts().at(-1);
    assert.equal(last?.outcome === "DRAFTED" ? last.proposal.ticket.code : null, "REQ-1");
  });

  it("a tool expõe o mesmo contrato pelo execute do Mastra", async () => {
    const { ticketService, calls } = fakeReader((code) => Promise.resolve(ticket(code)));
    const tool = createDraftComplementTool({ ticketService });
    const requestContext = contextOf({ actorId: "u1", recorder: createTurnRecorder() }) as RequestContext;
    assert.deepEqual(await tool.execute?.(input, { requestContext }), { outcome: "DRAFTED", code: "INC-20311" });
    assert.equal(calls[0]?.ownerId, "u1");
  });

  it("não tem campo de usuário na entrada e recusa campo extra", () => {
    assert.deepEqual(Object.keys(draftComplementInputSchema.shape).sort(), ["code", "content"]);
    assert.equal(draftComplementInputSchema.safeParse({ ...input, ownerId: "outro" }).success, false);
  });

  it("recusa código fora do formato e texto vazio ou longo demais", () => {
    assert.equal(draftComplementInputSchema.safeParse({ ...input, code: "20311" }).success, false);
    assert.equal(draftComplementInputSchema.safeParse({ ...input, content: "   " }).success, false);
    assert.equal(draftComplementInputSchema.safeParse({ ...input, content: "x".repeat(2001) }).success, false);
  });
});
