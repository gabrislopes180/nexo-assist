import { describe, expect, it } from "vitest";
import { buildTicketEvent } from "./test-fixtures";
import { ticketEventText } from "./ticket-event-text";

const now = new Date("2026-11-03T10:00:00");
const rafael = { id: "a-rafael", name: "Rafael Lima" };

describe("ticketEventText", () => {
  it("abertura com o autor", () => {
    expect(ticketEventText(buildTicketEvent(), now)).toEqual({
      icon: "created",
      text: "Chamado aberto por Ana Souza",
      contentLabel: null,
      dueNote: null,
    });
  });

  it("mudança de status com o rótulo do destino e a nota interna", () => {
    const event = buildTicketEvent({
      type: "STATUS_CHANGED",
      actorType: "ANALYST",
      actor: rafael,
      fromStatus: "WAITING_ANALYST",
      toStatus: "IN_PROGRESS",
      content: "Verificando o concentrador.",
      dueAt: "2026-11-03T13:43:00",
    });
    expect(ticketEventText(event, now)).toEqual({
      icon: "status",
      text: "Rafael Lima mudou para Em andamento",
      contentLabel: "Nota interna",
      dueNote: "novo prazo 13:43",
    });
  });

  it("prioridade com origem e destino", () => {
    const event = buildTicketEvent({
      type: "PRIORITY_CHANGED",
      actorType: "AGENT",
      actor: null,
      fromPriority: "HIGH",
      toPriority: "CRITICAL",
    });
    expect(ticketEventText(event, now).text).toBe("Prioridade: Alta → Crítica");
  });

  it("prioridade sem origem", () => {
    const event = buildTicketEvent({
      type: "PRIORITY_CHANGED",
      fromPriority: null,
      toPriority: "LOW",
    });
    expect(ticketEventText(event, now).text).toBe("Prioridade: Baixa");
  });

  it("complemento do funcionário", () => {
    const event = buildTicketEvent({
      type: "COMMENT",
      content: "Aconteceu de novo agora.",
    });
    expect(ticketEventText(event, now)).toMatchObject({
      icon: "comment",
      text: "Complemento de Ana Souza",
      contentLabel: "Complemento",
    });
  });

  it("transferência", () => {
    const event = buildTicketEvent({
      type: "TRANSFERRED",
      actorType: "AGENT",
      actor: null,
    });
    expect(ticketEventText(event, now)).toMatchObject({
      icon: "transfer",
      text: "Transferido para um analista",
    });
  });

  it("reabertura com motivo", () => {
    const event = buildTicketEvent({
      type: "REOPENED",
      content: "Voltou a cair.",
    });
    expect(ticketEventText(event, now)).toMatchObject({
      icon: "reopen",
      text: "Reaberto por Ana Souza",
      contentLabel: "Motivo",
    });
  });

  it("autor nulo vira Nexo Assist para o agent e Sistema para o sistema", () => {
    const agent = buildTicketEvent({ actorType: "AGENT", actor: null });
    const system = buildTicketEvent({
      type: "STATUS_CHANGED",
      actorType: "SYSTEM",
      actor: null,
      toStatus: "WAITING_ANALYST",
    });
    expect(ticketEventText(agent, now).text).toBe(
      "Chamado aberto por Nexo Assist",
    );
    expect(ticketEventText(system, now).text).toBe(
      "Sistema mudou para Aguardando analista",
    );
  });

  it("sem conteúdo não tem rótulo de conteúdo", () => {
    const event = buildTicketEvent({
      type: "STATUS_CHANGED",
      toStatus: "IN_PROGRESS",
      content: null,
    });
    expect(ticketEventText(event, now).contentLabel).toBeNull();
  });

  it("novo prazo em outro dia leva a data", () => {
    const event = buildTicketEvent({
      type: "STATUS_CHANGED",
      toStatus: "IN_PROGRESS",
      dueAt: "2026-11-05T09:00:00",
    });
    expect(ticketEventText(event, now).dueNote).toBe(
      "novo prazo 05 nov, 09:00",
    );
  });
});
