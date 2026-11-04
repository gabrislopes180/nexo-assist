import { describe, expect, it } from "vitest";
import { trailSteps } from "./trail-steps";

const action = (
  tool: string,
  status: "SUCCESS" | "ERROR" | "SKIPPED",
  summary = "Consulta encontrou um chamado aberto.",
) => ({ tool, status, summary });

describe("trailSteps", () => {
  it("mapeia a consulta bem-sucedida", () => {
    expect(trailSteps([action("searchMyOpenTickets", "SUCCESS")])).toEqual([
      { label: "consultou seus chamados", failed: false },
    ]);
  });

  it("mapeia a consulta com erro como falha", () => {
    expect(trailSteps([action("searchMyOpenTickets", "ERROR")])).toEqual([
      { label: "não conseguiu consultar seus chamados", failed: true },
    ]);
  });

  it("mapeia a busca na central de ajuda e a falha dela", () => {
    expect(trailSteps([action("searchHelpCenter", "SUCCESS")])).toEqual([
      { label: "buscou na central de ajuda", failed: false },
    ]);
    expect(trailSteps([action("searchHelpCenter", "ERROR")])).toEqual([
      { label: "não conseguiu buscar na central de ajuda", failed: true },
    ]);
  });

  it("oculta a citação descartada", () => {
    expect(trailSteps([action("citeArticle", "SKIPPED")])).toEqual([]);
  });

  it("oculta ação pulada", () => {
    expect(trailSteps([action("searchMyOpenTickets", "SKIPPED")])).toEqual([]);
  });

  it("oculta tool desconhecida e nunca usa o summary", () => {
    expect(trailSteps([action("deleteEverything", "SUCCESS", "x")])).toEqual(
      [],
    );
  });

  it("mostra os três passos do rascunho de chamado", () => {
    expect(
      trailSteps([action("draftTicket", "SUCCESS")]).map((s) => s.label),
    ).toEqual([
      "classificou a prioridade",
      "consultou o SLA",
      "montou o rascunho",
    ]);
  });

  it("mapeia rascunho de complemento e falhas de rascunho", () => {
    expect(trailSteps([action("draftComplement", "SUCCESS")])).toEqual([
      { label: "montou o rascunho", failed: false },
    ]);
    expect(trailSteps([action("draftTicket", "ERROR")])).toEqual([
      { label: "não conseguiu montar o rascunho", failed: true },
    ]);
    expect(trailSteps([action("draftComplement", "SKIPPED")])).toEqual([]);
  });

  it("mapeia confirmação, cancelamento e validação", () => {
    expect(trailSteps([action("createTicket", "SUCCESS")])).toEqual([
      { label: "criou o chamado", failed: false },
    ]);
    expect(trailSteps([action("addTicketComplement", "SUCCESS")])).toEqual([
      { label: "registrou o complemento", failed: false },
    ]);
    expect(trailSteps([action("createTicket", "SKIPPED")])).toEqual([]);
    expect(trailSteps([action("addTicketComplement", "SKIPPED")])).toEqual([]);
    expect(trailSteps([action("validateTicketDraft", "SKIPPED")])).toEqual([
      { label: "não encontrou o chamado", failed: true },
    ]);
    expect(trailSteps([action("validateTicketDraft", "ERROR")])).toEqual([
      { label: "não conseguiu verificar o chamado", failed: true },
    ]);
  });

  it("mapeia a reabertura", () => {
    expect(
      trailSteps([action("draftReopen", "SUCCESS")]).map((s) => s.label),
    ).toEqual(["consultou seus chamados", "montou o rascunho"]);
    expect(trailSteps([action("draftReopen", "ERROR")])).toEqual([
      { label: "não conseguiu montar o rascunho", failed: true },
    ]);
    expect(trailSteps([action("draftReopen", "SKIPPED")])).toEqual([]);
    expect(trailSteps([action("reopenTicket", "SUCCESS")])).toEqual([
      { label: "reabriu o chamado", failed: false },
    ]);
    expect(trailSteps([action("reopenTicket", "SKIPPED")])).toEqual([]);
  });

  it("deduplica passos iguais do mesmo turno", () => {
    const steps = trailSteps([
      action("searchMyOpenTickets", "SUCCESS", "a"),
      action("searchMyOpenTickets", "SUCCESS", "b"),
    ]);

    expect(steps).toHaveLength(1);
  });

  it("mantém sucesso e falha da mesma tool, na ordem do turno", () => {
    const steps = trailSteps([
      action("searchMyOpenTickets", "ERROR"),
      action("searchMyOpenTickets", "SUCCESS"),
      action("searchMyOpenTickets", "ERROR"),
    ]);

    expect(steps.map((step) => step.failed)).toEqual([true, false]);
  });
});
