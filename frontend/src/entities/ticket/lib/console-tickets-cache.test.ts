import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { consoleTicketKeys } from "../api/console-ticket-keys";
import type { ConversationTickets } from "../model/console-ticket";
import { applyTicketDetail, toConsoleTicket } from "./console-tickets-cache";
import { buildConsoleTicket, buildTicketDetail } from "./test-fixtures";

const changed = buildTicketDetail({
  status: "IN_PROGRESS",
  statusLabel: "Em andamento",
  dueAt: "2026-11-03T17:00:00.000Z",
  overdue: false,
});

describe("toConsoleTicket", () => {
  it("fica só com os campos da lista", () => {
    expect(toConsoleTicket(changed)).toEqual(
      buildConsoleTicket({
        status: "IN_PROGRESS",
        statusLabel: "Em andamento",
        dueAt: "2026-11-03T17:00:00.000Z",
      }),
    );
  });
});

describe("applyTicketDetail", () => {
  it("grava o detalhe na chave com o código em maiúsculas", () => {
    const qc = new QueryClient();

    applyTicketDetail(qc, { ...changed, code: "inc-20405" });

    expect(
      qc.getQueryData(consoleTicketKeys.detail("INC-20405")),
    ).toMatchObject({ status: "IN_PROGRESS" });
  });

  it("troca o chamado em todas as conversas que o mostram", () => {
    const qc = new QueryClient();
    const other = buildConsoleTicket({ code: "INC-1", title: "Outro" });
    qc.setQueryData<ConversationTickets>(
      consoleTicketKeys.byConversation("c1"),
      {
        conversationTicket: buildConsoleTicket(),
        otherTickets: [other],
      },
    );
    qc.setQueryData<ConversationTickets>(
      consoleTicketKeys.byConversation("c2"),
      {
        conversationTicket: null,
        otherTickets: [other, buildConsoleTicket()],
      },
    );

    applyTicketDetail(qc, changed);

    const c1 = qc.getQueryData<ConversationTickets>(
      consoleTicketKeys.byConversation("c1"),
    );
    const c2 = qc.getQueryData<ConversationTickets>(
      consoleTicketKeys.byConversation("c2"),
    );
    expect(c1?.conversationTicket?.status).toBe("IN_PROGRESS");
    expect(c1?.otherTickets).toEqual([other]);
    expect(c2?.otherTickets.map((t) => t.status)).toEqual([
      "WAITING_ANALYST",
      "IN_PROGRESS",
    ]);
  });

  it("não troca a referência da conversa que não tem o chamado", () => {
    const qc = new QueryClient();
    const data: ConversationTickets = {
      conversationTicket: null,
      otherTickets: [buildConsoleTicket({ code: "INC-1" })],
    };
    qc.setQueryData(consoleTicketKeys.byConversation("c3"), data);

    applyTicketDetail(qc, changed);

    expect(qc.getQueryData(consoleTicketKeys.byConversation("c3"))).toBe(data);
  });
});
