import { describe, expect, it } from "vitest";
import { ticketLookupSchema, ticketSummarySchema } from "./ticket";

const ticket = {
  code: "INC-20311",
  type: "INC",
  category: "HARDWARE",
  priority: "MEDIUM",
  status: "WAITING_ANALYST",
  statusLabel: "Aguardando analista",
  title: "Notebook lento após atualização",
  createdAt: "2026-10-16T17:20:00.000Z",
  dueAt: "2026-10-21T17:20:00.000Z",
  overdue: true,
};

describe("ticketSummarySchema", () => {
  it("aceita prazo nulo", () => {
    const parsed = ticketSummarySchema.parse({ ...ticket, dueAt: null });
    expect(parsed.dueAt).toBeNull();
  });

  it("descarta campo extra", () => {
    const parsed = ticketSummarySchema.parse({ ...ticket, extra: 1 });
    expect(parsed).not.toHaveProperty("extra");
  });

  it("recusa enum desconhecido", () => {
    expect(
      ticketSummarySchema.safeParse({ ...ticket, category: "PRINTER" }).success,
    ).toBe(false);
    expect(
      ticketSummarySchema.safeParse({ ...ticket, status: "CLOSED" }).success,
    ).toBe(false);
  });
});

describe("ticketLookupSchema", () => {
  it.each([
    { outcome: "NO_OPEN_TICKETS", openTicketCount: 0, totalMatches: 0, tickets: [] },
    { outcome: "NO_MATCH", openTicketCount: 3, totalMatches: 0, tickets: [] },
    { outcome: "SINGLE_MATCH", openTicketCount: 3, totalMatches: 1, tickets: [ticket] },
    {
      outcome: "MULTIPLE_MATCHES",
      openTicketCount: 3,
      totalMatches: 2,
      tickets: [ticket, { ...ticket, code: "INC-20298" }],
    },
    { outcome: "UNAVAILABLE", openTicketCount: null, totalMatches: null, tickets: [] },
  ])("aceita o resultado $outcome", (lookup) => {
    expect(ticketLookupSchema.parse(lookup).outcome).toBe(lookup.outcome);
  });

  it("recusa SINGLE_MATCH sem exatamente um chamado", () => {
    const lookup = {
      outcome: "SINGLE_MATCH",
      openTicketCount: 3,
      totalMatches: 1,
      tickets: [ticket, ticket],
    };
    expect(ticketLookupSchema.safeParse(lookup).success).toBe(false);
  });

  it("recusa outcome desconhecido", () => {
    const lookup = {
      outcome: "MAYBE",
      openTicketCount: 3,
      totalMatches: 0,
      tickets: [],
    };
    expect(ticketLookupSchema.safeParse(lookup).success).toBe(false);
  });

  it("recusa UNAVAILABLE com contagem preenchida", () => {
    const lookup = {
      outcome: "UNAVAILABLE",
      openTicketCount: 0,
      totalMatches: null,
      tickets: [],
    };
    expect(ticketLookupSchema.safeParse(lookup).success).toBe(false);
  });
});
