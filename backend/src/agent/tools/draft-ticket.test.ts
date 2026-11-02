import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestContext } from "@mastra/core/request-context";
import { proposedCreateDraftSchema, type SimilarTicket } from "../../shared/chat.js";
import { TicketServiceUnavailableError, type SimilarTicketReader } from "../../tickets/ticket-service.js";
import { createDraftTicketTool, draftTicket, draftTicketInputSchema, type DraftTicketInput } from "./draft-ticket.js";
import { createTurnRecorder, type TurnContextValues, type TurnRecorder } from "./turn-recorder.js";

const NOW = new Date("2026-11-01T12:00:00.000Z");

const similar = (code: string, overrides: Partial<SimilarTicket> = {}): SimilarTicket => ({
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
  canReopen: false,
  ...overrides,
});

const base: DraftTicketInput = {
  title: "Notebook não conecta na VPN",
  description: "Erro 809 ao conectar na VPN.",
  type: "INC",
  category: "NETWORK_VPN",
  priority: "MEDIUM",
  priorityReason: "impede o acesso remoto",
  keywords: ["vpn", "809"],
};

function fakeReader(result: () => Promise<SimilarTicket[]> = () => Promise.resolve([])) {
  const calls: { ownerId: string; keywords: readonly string[]; now: Date }[] = [];
  const ticketService: SimilarTicketReader = {
    findSimilarTickets(ownerId, keywords, now) {
      calls.push({ ownerId, keywords, now });
      return result();
    },
  };
  return { ticketService, calls };
}

type Context = { actorId?: string; message?: string; shownCodes?: readonly string[]; recorder?: TurnRecorder };

function contextOf({ actorId = "u1", message = "", shownCodes = [], recorder = createTurnRecorder() }: Context = {}): RequestContext<TurnContextValues> {
  const context = new RequestContext<TurnContextValues>();
  if (actorId !== "") context.set("actorId", actorId);
  context.set("message", message);
  context.set("shownCodes", shownCodes);
  context.set("recorder", recorder);
  return context;
}

const run = (ticketService: SimilarTicketReader, input: DraftTicketInput, context = contextOf()) =>
  draftTicket({ ticketService, now: () => NOW }, input, context);

function proposalOf(recorder: TurnRecorder) {
  const last = recorder.drafts().at(-1);
  return last?.outcome === "DRAFTED" && last.proposal.kind === "CREATE" ? last.proposal : null;
}

describe("draftTicket", () => {
  it("falha fechada sem dono no contexto: não consulta o serviço", async () => {
    const { ticketService, calls } = fakeReader();
    const recorder = createTurnRecorder();
    const result = await run(ticketService, { ...base, affectedScope: "TEAM" }, contextOf({ actorId: "", recorder }));
    assert.equal(calls.length, 0);
    assert.deepEqual(result, { outcome: "UNAVAILABLE" });
    assert.deepEqual(recorder.drafts(), [{ outcome: "UNAVAILABLE" }]);
  });

  it("consulta parecidos com o dono da sessão e as keywords", async () => {
    const { ticketService, calls } = fakeReader();
    await run(ticketService, { ...base, affectedScope: "TEAM" }, contextOf({ actorId: "marina" }));
    assert.deepEqual(calls, [{ ownerId: "marina", keywords: base.keywords, now: NOW }]);
  });

  it("sem afetados: pede o escopo, sem proposta", async () => {
    const { ticketService } = fakeReader();
    const recorder = createTurnRecorder();
    const result = await run(ticketService, base, contextOf({ recorder }));
    assert.deepEqual(result, { outcome: "NEEDS_AFFECTED_SCOPE" });
    assert.deepEqual(recorder.drafts(), [{ outcome: "NEEDS_AFFECTED_SCOPE" }]);
  });

  it("com afetados: proposta válida no contrato do backend, sem gravar", async () => {
    const { ticketService } = fakeReader();
    const recorder = createTurnRecorder();
    const result = await run(ticketService, { ...base, affectedScope: "TEAM" }, contextOf({ recorder }));
    assert.deepEqual(result, { outcome: "DRAFTED" });
    const proposal = proposalOf(recorder);
    assert.equal(proposedCreateDraftSchema.safeParse(proposal).success, true);
    assert.equal(proposal?.title, base.title);
    assert.equal(proposal?.affectedScope, "TEAM");
  });

  it("CRITICAL individual cai para HIGH com motivo fixo", async () => {
    const { ticketService } = fakeReader();
    const recorder = createTurnRecorder();
    await run(ticketService, { ...base, priority: "CRITICAL", priorityReason: "é crítico, insisti", affectedScope: "INDIVIDUAL" }, contextOf({ recorder }));
    assert.equal(proposalOf(recorder)?.priority, "HIGH");
    assert.equal(proposalOf(recorder)?.priorityReason, "afeta só você");
  });

  it("CRITICAL coletivo é mantido", async () => {
    for (const affectedScope of ["TEAM", "COMPANY"] as const) {
      const { ticketService } = fakeReader();
      const recorder = createTurnRecorder();
      await run(ticketService, { ...base, priority: "CRITICAL", affectedScope }, contextOf({ recorder }));
      assert.equal(proposalOf(recorder)?.priority, "CRITICAL");
      assert.equal(proposalOf(recorder)?.priorityReason, base.priorityReason);
    }
  });

  it("resposta rápida vale mais que o escopo escolhido pelo modelo", async () => {
    const cases = [
      ["Só eu", "INDIVIDUAL"],
      ["só eu.", "INDIVIDUAL"],
      ["Minha equipe", "TEAM"],
      ["Toda a empresa", "COMPANY"],
    ] as const;
    for (const [message, expected] of cases) {
      const { ticketService } = fakeReader();
      const recorder = createTurnRecorder();
      await run(ticketService, { ...base, affectedScope: "COMPANY", priority: "CRITICAL" }, contextOf({ recorder, message }));
      assert.equal(proposalOf(recorder)?.affectedScope, message.startsWith("Toda") ? "COMPANY" : expected);
      if (expected === "INDIVIDUAL") assert.equal(proposalOf(recorder)?.priority, "HIGH");
    }
  });

  it("resposta rápida preenche o escopo que o modelo não mandou", async () => {
    const { ticketService } = fakeReader();
    const recorder = createTurnRecorder();
    const result = await run(ticketService, base, contextOf({ recorder, message: "Minha equipe" }));
    assert.deepEqual(result, { outcome: "DRAFTED" });
    assert.equal(proposalOf(recorder)?.affectedScope, "TEAM");
  });

  it("Não sei vira INDIVIDUAL e registra que não soube informar", async () => {
    const { ticketService } = fakeReader();
    const recorder = createTurnRecorder();
    await run(ticketService, base, contextOf({ recorder, message: "Não sei" }));
    assert.equal(proposalOf(recorder)?.affectedScope, "INDIVIDUAL");
    assert.match(proposalOf(recorder)?.affectedDescription ?? "", /não soube informar/);
  });

  it("parecido bloqueia antes de perguntar afetados e devolve os dados", async () => {
    const { ticketService } = fakeReader(() => Promise.resolve([similar("INC-20311")]));
    const recorder = createTurnRecorder();
    const result = await run(ticketService, base, contextOf({ recorder }));
    assert.equal(result.outcome, "POSSIBLE_DUPLICATE");
    assert.deepEqual(result.outcome === "POSSIBLE_DUPLICATE" ? result.similar.map((ticket) => ticket.code) : [], ["INC-20311"]);
    assert.equal(proposalOf(recorder), null);
  });

  it("reconhecimento válido exige código encontrado e já mostrado ao usuário", async () => {
    const { ticketService } = fakeReader(() => Promise.resolve([similar("INC-20311")]));
    const context = contextOf({ shownCodes: ["INC-20311"] });
    const result = await run(ticketService, { ...base, affectedScope: "TEAM", acknowledgedDuplicates: ["inc-20311"] }, context);
    assert.deepEqual(result, { outcome: "DRAFTED" });
  });

  it("reconhecimento forjado: código nunca mostrado não libera", async () => {
    const { ticketService } = fakeReader(() => Promise.resolve([similar("INC-20311")]));
    const result = await run(ticketService, { ...base, affectedScope: "TEAM", acknowledgedDuplicates: ["INC-20311"] });
    assert.equal(result.outcome, "POSSIBLE_DUPLICATE");
  });

  it("reconhecimento de código que o serviço não encontrou não libera outro parecido", async () => {
    const { ticketService } = fakeReader(() => Promise.resolve([similar("INC-20311")]));
    const result = await run(ticketService, { ...base, affectedScope: "TEAM", acknowledgedDuplicates: ["INC-99999"] }, contextOf({ shownCodes: ["INC-99999"] }));
    assert.equal(result.outcome, "POSSIBLE_DUPLICATE");
  });

  it("parecido novo não reconhecido bloqueia de novo, só com ele", async () => {
    const { ticketService } = fakeReader(() => Promise.resolve([similar("INC-20311"), similar("REQ-7")]));
    const result = await run(ticketService, { ...base, affectedScope: "TEAM", acknowledgedDuplicates: ["INC-20311"] }, contextOf({ shownCodes: ["INC-20311"] }));
    assert.deepEqual(result.outcome === "POSSIBLE_DUPLICATE" ? result.similar.map((ticket) => ticket.code) : [], ["REQ-7"]);
  });

  it("serviço indisponível: sem proposta", async () => {
    const { ticketService } = fakeReader(() => Promise.reject(new TicketServiceUnavailableError()));
    const recorder = createTurnRecorder();
    const result = await run(ticketService, { ...base, affectedScope: "TEAM" }, contextOf({ recorder }));
    assert.deepEqual(result, { outcome: "UNAVAILABLE" });
    assert.equal(proposalOf(recorder), null);
  });

  it("não trata erro inesperado como indisponibilidade", async () => {
    const { ticketService } = fakeReader(() => Promise.reject(new TypeError("bug")));
    await assert.rejects(run(ticketService, base), TypeError);
  });

  it("a tool expõe o mesmo contrato pelo execute do Mastra", async () => {
    const { ticketService } = fakeReader();
    const tool = createDraftTicketTool({ ticketService });
    assert.deepEqual(await tool.execute?.({ ...base, affectedScope: "TEAM" }, { requestContext: contextOf() as RequestContext }), { outcome: "DRAFTED" });
  });

  it("não tem campo de usuário nem de prazo e recusa campo extra", () => {
    const fields = Object.keys(draftTicketInputSchema.shape);
    assert.deepEqual(fields.filter((field) => /owner|user|actor|employee|due|sla|prazo/i.test(field)), []);
    assert.equal(draftTicketInputSchema.safeParse({ ...base, ownerId: "juliana" }).success, false);
    assert.equal(draftTicketInputSchema.safeParse({ ...base, dueAt: "2026-11-02" }).success, false);
  });
});
