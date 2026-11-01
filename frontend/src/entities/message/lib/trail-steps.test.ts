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

  it("oculta ação pulada", () => {
    expect(trailSteps([action("searchMyOpenTickets", "SKIPPED")])).toEqual([]);
  });

  it("oculta tool desconhecida e nunca usa o summary", () => {
    expect(trailSteps([action("deleteEverything", "SUCCESS", "x")])).toEqual([]);
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
