import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RequestContext } from "@mastra/core/request-context";
import { handoffProposalSchema, type TicketLookupResult, type TicketSummary } from "../../shared/chat.js";
import { createTransferToAnalystTool, transferToAnalyst, transferToAnalystInputSchema } from "./transfer-to-analyst.js";
import { createTurnRecorder, type TurnContextValues, type TurnRecorder } from "./turn-recorder.js";

const ticket = (code: string, overdue: boolean): TicketSummary => ({
  code,
  type: "INC",
  category: "HARDWARE",
  priority: "HIGH",
  status: "WAITING_ANALYST",
  statusLabel: "Aguardando analista",
  title: "Notebook lento",
  createdAt: "2026-10-28T12:00:00.000Z",
  dueAt: "2026-10-30T12:00:00.000Z",
  overdue,
});

type Context = {
  actorId?: string | null;
  message?: string;
  overdueOfferCode?: string | null;
  offerDeclinedRecently?: boolean;
  knownCodes?: readonly string[];
  recorder?: TurnRecorder;
};

function contextOf({ actorId = "marina", message = "", overdueOfferCode = null, offerDeclinedRecently = false, knownCodes = [], recorder = createTurnRecorder() }: Context = {}) {
  const context = new RequestContext<TurnContextValues>();
  if (actorId !== null) context.set("actorId", actorId);
  context.set("message", message);
  context.set("overdueOfferCode", overdueOfferCode);
  context.set("offerDeclinedRecently", offerDeclinedRecently);
  context.set("knownCodes", knownCodes);
  context.set("recorder", recorder);
  return { context, recorder };
}

const request = { reason: "EMPLOYEE_REQUEST", summary: "Pediu para falar com um analista sobre a VPN." } as const;

describe("transferToAnalyst", () => {
  it("pedido do funcionário: aceita e registra a proposta válida, sem gravar", async () => {
    const { context, recorder } = contextOf({ message: "Quero falar com um analista" });
    assert.deepEqual(await transferToAnalyst(request, context), { outcome: "ACCEPTED" });
    const last = recorder.handoffs().at(-1);
    assert.equal(last?.outcome, "ACCEPTED");
    assert.equal(handoffProposalSchema.safeParse(last?.outcome === "ACCEPTED" ? last.proposal : null).success, true);
  });

  it("falha fechada sem dono no contexto", async () => {
    const { context, recorder } = contextOf({ actorId: null });
    assert.deepEqual(await transferToAnalyst(request, context), { outcome: "REJECTED", problem: "UNAVAILABLE" });
    assert.equal(recorder.handoffs().at(-1)?.outcome, "REJECTED");
  });

  it("LOW_CONFIDENCE é decisão do agent e é aceito", async () => {
    const { context } = contextOf();
    assert.deepEqual(await transferToAnalyst({ reason: "LOW_CONFIDENCE", summary: "Não consegui identificar o problema relatado." }, context), { outcome: "ACCEPTED" });
  });

  it("OVERDUE só depois da oferta do agent aceita pela pessoa", async () => {
    const { context } = contextOf({ message: "Falar com um analista", overdueOfferCode: "INC-20311" });
    assert.deepEqual(await transferToAnalyst({ reason: "OVERDUE", summary: "INC-20311 com prazo vencido." }, context), { outcome: "ACCEPTED" });
  });

  it("OVERDUE forjado sem oferta é recusado", async () => {
    const { context, recorder } = contextOf({ message: "Meu chamado está atrasado" });
    assert.deepEqual(await transferToAnalyst({ reason: "OVERDUE", summary: "Chamado atrasado." }, context), { outcome: "REJECTED", problem: "OVERDUE_NOT_ACCEPTED" });
    assert.equal(recorder.handoffs().at(-1)?.outcome, "REJECTED");
  });

  it("OVERDUE com a oferta recusada é recusado", async () => {
    for (const message of ["Não, obrigado", "não precisa", "nao"]) {
      const { context } = contextOf({ message, overdueOfferCode: "INC-20311" });
      assert.deepEqual(await transferToAnalyst({ reason: "OVERDUE", summary: "INC-20311 vencido." }, context), { outcome: "REJECTED", problem: "OFFER_DECLINED" }, message);
    }
  });

  it("oferta recusada bloqueia transferência por qualquer motivo", async () => {
    for (const reason of ["EMPLOYEE_REQUEST", "LOW_CONFIDENCE", "OVERDUE"] as const) {
      const { context } = contextOf({ message: "Não, obrigado", overdueOfferCode: "INC-20311" });
      assert.deepEqual(await transferToAnalyst({ reason, summary: "Recusou a oferta." }, context), { outcome: "REJECTED", problem: "OFFER_DECLINED" }, reason);
    }
  });

  it("oferta aceita vira OVERDUE mesmo se o modelo mandar outro motivo", async () => {
    const { context, recorder } = contextOf({ message: "Falar com um analista", overdueOfferCode: "INC-20311" });
    assert.deepEqual(await transferToAnalyst({ reason: "EMPLOYEE_REQUEST", summary: "INC-20311 vencido; aceitou." }, context), { outcome: "ACCEPTED" });
    const last = recorder.handoffs().at(-1);
    assert.equal(last?.outcome === "ACCEPTED" ? last.proposal.reason : null, "OVERDUE");
  });

  it("EMPLOYEE_REQUEST exige que a mensagem peça uma pessoa", async () => {
    const { context } = contextOf({ message: "Meu notebook está lento" });
    assert.deepEqual(await transferToAnalyst(request, context), { outcome: "REJECTED", problem: "NOT_REQUESTED" });
    for (const message of ["Quero falar com uma pessoa", "Me passa para um atendente", "Preciso de um humano", "falar com analista"]) {
      const accepted = contextOf({ message });
      assert.deepEqual(await transferToAnalyst(request, accepted.context), { outcome: "ACCEPTED" }, message);
    }
  });

  it("depois da oferta, resposta que não é aceite não vira OVERDUE", async () => {
    for (const message of ["depois eu vejo", "obrigado, tá bom", "pode deixar", "tá certo", "e o INC-2?"]) {
      const { context } = contextOf({ message, overdueOfferCode: "INC-20311" });
      const result = await transferToAnalyst({ reason: "LOW_CONFIDENCE", summary: "x" }, context);
      const overdue = await transferToAnalyst({ reason: "OVERDUE", summary: "x" }, contextOf({ message, overdueOfferCode: "INC-20311" }).context);
      assert.equal(overdue.outcome, "REJECTED", message);
      if (result.outcome === "ACCEPTED") assert.fail(`${message} transferiu`);
    }
  });

  it("recusa ou pedido negado bloqueia qualquer motivo, inclusive LOW_CONFIDENCE", async () => {
    for (const message of ["Não quero falar com analista", "não preciso de analista"]) {
      const { context } = contextOf({ message });
      assert.equal((await transferToAnalyst({ reason: "LOW_CONFIDENCE", summary: "x" }, context)).outcome, "REJECTED", message);
    }
  });

  it("recusa recente vale no turno seguinte para LOW_CONFIDENCE", async () => {
    const { context } = contextOf({ message: "ok", offerDeclinedRecently: true });
    assert.equal((await transferToAnalyst({ reason: "LOW_CONFIDENCE", summary: "x" }, context)).outcome, "REJECTED");
    const asked = contextOf({ message: "Mudei de ideia, quero falar com um analista", offerDeclinedRecently: true });
    assert.equal((await transferToAnalyst(request, asked.context)).outcome, "ACCEPTED");
  });

  it("pedido explícito com 'não' no meio transfere", async () => {
    const { context } = contextOf({ message: "Não consegui resolver, chama o analista", overdueOfferCode: "INC-20311" });
    assert.deepEqual(await transferToAnalyst({ reason: "EMPLOYEE_REQUEST", summary: "INC-20311 vencido." }, context), { outcome: "ACCEPTED" });
  });

  it("menção a técnico ou a outra pessoa não é pedido de analista", async () => {
    for (const message of ["tenho um problema técnico", "outra pessoa não consegue logar"]) {
      const { context } = contextOf({ message });
      assert.deepEqual(await transferToAnalyst(request, context), { outcome: "REJECTED", problem: "NOT_REQUESTED" }, message);
    }
  });

  it("código no resumo com espaço ou sem hífen também é conferido", async () => {
    for (const summary of ["Quer falar do INC 99999.", "Quer falar do inc99999.", "Quer falar do REQ–123."]) {
      const { context } = contextOf({ knownCodes: ["INC-20311"], message: "Quero falar com um analista" });
      assert.deepEqual(await transferToAnalyst({ ...request, summary }, context), { outcome: "REJECTED", problem: "UNKNOWN_TICKET_CODE" }, summary);
    }
    const { context } = contextOf({ knownCodes: ["INC-20311"], message: "Quero falar com um analista" });
    assert.deepEqual(await transferToAnalyst({ ...request, summary: "Sobre o inc 20311." }, context), { outcome: "ACCEPTED" });
  });

  it("relato de problema não vira recusa para LOW_CONFIDENCE", async () => {
    const { context } = contextOf({ message: "Não consigo acessar a VPN" });
    assert.deepEqual(await transferToAnalyst({ reason: "LOW_CONFIDENCE", summary: "Erro de VPN sem diagnóstico." }, context), { outcome: "ACCEPTED" });
  });

  it("código com outros separadores também é conferido", async () => {
    for (const summary of ["INC/99999", "INC#99999", "INC \u221299999"]) {
      const { context } = contextOf({ message: "Quero falar com um analista" });
      assert.equal((await transferToAnalyst({ ...request, summary }, context)).outcome, "REJECTED", summary);
    }
  });

  it("resumo com código que nenhuma tool devolveu é recusado", async () => {
    const { context } = contextOf({ knownCodes: ["INC-20311"], message: "Quero falar com um analista" });
    assert.deepEqual(await transferToAnalyst({ ...request, summary: "Quer falar do INC-99999." }, context), { outcome: "REJECTED", problem: "UNKNOWN_TICKET_CODE" });
  });

  it("resumo pode citar código do histórico ou de consulta do turno", async () => {
    const recorder = createTurnRecorder();
    const lookup: TicketLookupResult = { outcome: "SINGLE_MATCH", openTicketCount: 1, totalMatches: 1, tickets: [ticket("INC-1", false)] };
    recorder.record(lookup);
    const { context } = contextOf({ knownCodes: ["INC-20311"], recorder, message: "Quero um analista" });
    assert.deepEqual(await transferToAnalyst({ ...request, summary: "INC-20311 e INC-1 sem solução." }, context), { outcome: "ACCEPTED" });
  });

  it("a tool expõe o mesmo contrato pelo execute do Mastra", async () => {
    const tool = createTransferToAnalystTool();
    const { context } = contextOf({ message: "Quero falar com um analista" });
    assert.deepEqual(await tool.execute?.(request, { requestContext: context as RequestContext }), { outcome: "ACCEPTED" });
  });

  it("não tem campo de usuário nem de analista, e recusa resumo inválido", () => {
    assert.deepEqual(Object.keys(transferToAnalystInputSchema.shape).sort(), ["reason", "summary"]);
    assert.equal(transferToAnalystInputSchema.safeParse({ ...request, analystId: "rafael" }).success, false);
    assert.equal(transferToAnalystInputSchema.safeParse({ ...request, summary: "   " }).success, false);
    assert.equal(transferToAnalystInputSchema.safeParse({ ...request, summary: "x".repeat(1001) }).success, false);
    assert.equal(transferToAnalystInputSchema.safeParse({ ...request, reason: "CRITICAL" }).success, false);
  });
});
