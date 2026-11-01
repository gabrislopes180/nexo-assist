import { describe, expect, it } from "vitest";
import type { TicketPriority, TicketSummary } from "../model/ticket";
import { ticketCardFields } from "./ticket-card-fields";
import { PRIORITY_TONES } from "./ticket-labels";

const ticket: TicketSummary = {
  code: "INC-20311",
  type: "INC",
  category: "NETWORK_VPN",
  priority: "HIGH",
  status: "WAITING_ANALYST",
  statusLabel: "Aguardando analista",
  title: "VPN caiu",
  createdAt: "2026-10-16T14:20:00",
  dueAt: "2026-10-18T09:05:00",
  overdue: false,
};

describe("ticketCardFields", () => {
  it("monta os campos na ordem do cartão", () => {
    expect(ticketCardFields(ticket).map((field) => field.label)).toEqual([
      "Categoria",
      "Prioridade",
      "Aberto em",
      "Prazo",
    ]);
  });

  it("traduz categoria e formata as datas", () => {
    const [category, , openedAt, due] = ticketCardFields(ticket);

    expect(category?.value).toBe("Rede e VPN");
    expect(openedAt?.value).toBe("16 out, 14:20");
    expect(due?.value).toBe("18 out, 09:05");
    expect(due?.tone).toBeUndefined();
    expect(due?.note).toBeUndefined();
  });

  it("destaca o prazo vencido", () => {
    const due = ticketCardFields({ ...ticket, overdue: true }).at(-1);

    expect(due).toMatchObject({
      label: "Prazo",
      tone: "warning",
      note: "· prazo vencido",
    });
  });

  it("omite o prazo quando não há data", () => {
    const labels = ticketCardFields({ ...ticket, dueAt: null }).map(
      (field) => field.label,
    );

    expect(labels).toEqual(["Categoria", "Prioridade", "Aberto em"]);
  });

  it.each<[TicketPriority, string, string]>([
    ["CRITICAL", "Crítica", "danger"],
    ["HIGH", "Alta", "warning"],
    ["MEDIUM", "Média", "medium"],
    ["LOW", "Baixa", "neutral"],
  ])("rotula a prioridade %s", (priority, value, dot) => {
    const field = ticketCardFields({ ...ticket, priority })[1];

    expect(field).toMatchObject({ value, dot });
    expect(PRIORITY_TONES[priority]).toBe(dot);
  });
});
