import { describe, expect, it } from "vitest";
import { ticketDueNote, ticketDueState } from "./console-ticket-sla";
import { buildConsoleTicket } from "./test-fixtures";

// Datas locais, sem "Z": o texto sai no fuso de quem está na tela.
const now = new Date("2026-11-03T10:00:00");

describe("ticketDueState", () => {
  it("no prazo quando dueAt é futuro e não vencido", () => {
    const ticket = buildConsoleTicket({ dueAt: "2026-11-03T13:43:00" });
    expect(ticketDueState(ticket, now)).toEqual({
      kind: "due",
      dueAt: "2026-11-03T13:43:00",
    });
  });

  it("vencido quando o backend marca overdue", () => {
    const ticket = buildConsoleTicket({
      dueAt: "2026-11-03T13:43:00",
      overdue: true,
    });
    expect(ticketDueState(ticket, now).kind).toBe("overdue");
  });

  it("vencido quando o prazo passou desde a última leitura", () => {
    const ticket = buildConsoleTicket({ dueAt: "2026-11-03T09:59:00" });
    expect(ticketDueState(ticket, now).kind).toBe("overdue");
  });

  it("pausado aguardando o funcionário", () => {
    const ticket = buildConsoleTicket({
      status: "WAITING_EMPLOYEE",
      dueAt: null,
      overdue: false,
    });
    expect(ticketDueState(ticket, now)).toEqual({ kind: "paused" });
  });

  it("resolvido não tem prazo", () => {
    const ticket = buildConsoleTicket({
      status: "RESOLVED",
      dueAt: null,
      resolvedAt: "2026-11-03T09:00:00",
    });
    expect(ticketDueState(ticket, now)).toEqual({ kind: "resolved" });
  });

  it("sem dueAt fora da pausa não mostra prazo", () => {
    const ticket = buildConsoleTicket({ dueAt: null });
    expect(ticketDueState(ticket, now)).toEqual({ kind: "none" });
  });
});

describe("ticketDueNote", () => {
  it("mostra só a hora quando vence hoje", () => {
    const ticket = buildConsoleTicket({ dueAt: "2026-11-03T13:43:00" });
    expect(ticketDueNote(ticket, now)).toEqual({
      text: "resposta até 13:43",
      tone: null,
    });
  });

  it("mostra dia e hora quando vence em outro dia", () => {
    const ticket = buildConsoleTicket({ dueAt: "2026-11-05T09:00:00" });
    expect(ticketDueNote(ticket, now)?.text).toBe("resposta até 05 nov, 09:00");
  });

  it("vencido em warning", () => {
    const ticket = buildConsoleTicket({
      dueAt: "2026-11-03T08:00:00",
      overdue: true,
    });
    expect(ticketDueNote(ticket, now)).toEqual({
      text: "prazo vencido",
      tone: "warning",
    });
  });

  it("pausado", () => {
    const ticket = buildConsoleTicket({
      status: "WAITING_EMPLOYEE",
      dueAt: null,
    });
    expect(ticketDueNote(ticket, now)).toEqual({
      text: "prazo pausado",
      tone: null,
    });
  });

  it("nada em resolvido", () => {
    const ticket = buildConsoleTicket({ status: "RESOLVED", dueAt: null });
    expect(ticketDueNote(ticket, now)).toBeNull();
  });
});
