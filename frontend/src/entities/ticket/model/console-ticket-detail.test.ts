import { describe, expect, it } from "vitest";
import {
  buildConsoleTicket,
  buildTicketDetail,
  buildTicketEvent,
} from "../lib/test-fixtures";
import { conversationTicketsResponseSchema } from "./console-ticket";
import {
  changeTicketStatusResponseSchema,
  consoleTicketDetailResponseSchema,
} from "./console-ticket-detail";

describe("schemas dos chamados do console", () => {
  it("aceita a lista com dueAt e overdue", () => {
    const parsed = conversationTicketsResponseSchema.safeParse({
      conversationTicket: buildConsoleTicket(),
      otherTickets: [
        buildConsoleTicket({ code: "INC-1", dueAt: null, overdue: true }),
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita item da lista sem overdue", () => {
    const ticket: Partial<ReturnType<typeof buildConsoleTicket>> =
      buildConsoleTicket();
    delete ticket.overdue;
    const parsed = conversationTicketsResponseSchema.safeParse({
      conversationTicket: ticket,
      otherTickets: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("aceita o detalhe com actor e content nulos e sem transições", () => {
    const parsed = consoleTicketDetailResponseSchema.safeParse({
      ticket: buildTicketDetail({
        status: "RESOLVED",
        allowedStatuses: [],
        events: [
          buildTicketEvent({ actorType: "SYSTEM", actor: null, content: null }),
        ],
      }),
    });
    expect(parsed.success).toBe(true);
  });

  it("rejeita status desconhecido no detalhe", () => {
    const parsed = consoleTicketDetailResponseSchema.safeParse({
      ticket: { ...buildTicketDetail(), status: "ARCHIVED" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejeita tipo de evento desconhecido", () => {
    const parsed = consoleTicketDetailResponseSchema.safeParse({
      ticket: buildTicketDetail({
        events: [{ ...buildTicketEvent(), type: "MERGED" } as never],
      }),
    });
    expect(parsed.success).toBe(false);
  });

  it("lê a resposta da mudança de status com changed", () => {
    const parsed = changeTicketStatusResponseSchema.safeParse({
      ticket: buildTicketDetail(),
      changed: false,
    });
    expect(parsed.success && parsed.data.changed).toBe(false);
  });
});
