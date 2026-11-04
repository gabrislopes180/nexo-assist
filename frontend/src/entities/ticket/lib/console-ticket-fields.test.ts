import { describe, expect, it } from "vitest";
import type { ConsoleTicket } from "../model/console-ticket";
import {
  currentTicketMeta,
  sortOtherTickets,
  ticketCountsLabel,
  ticketListMeta,
} from "./console-ticket-fields";

const t = (
  code: string,
  status: ConsoleTicket["status"],
  createdAt: string,
  resolvedAt: string | null = null,
): ConsoleTicket => ({
  code,
  type: "INC",
  category: "HARDWARE",
  priority: "MEDIUM",
  status,
  statusLabel: status === "RESOLVED" ? "Resolvido" : "Em andamento",
  title: code,
  createdAt,
  resolvedAt,
  dueAt: null,
  overdue: false,
});

describe("campos de chamado do console", () => {
  it("monta a meta do card atual", () => {
    expect(
      currentTicketMeta(t("INC-1", "IN_PROGRESS", "2026-10-01T10:00:00")),
    ).toBe("Hardware · prioridade média");
  });

  it("monta a meta da lista", () => {
    expect(
      ticketListMeta(t("INC-2", "IN_PROGRESS", "2026-10-01T10:00:00")),
    ).toBe("INC-2 · Em andamento");
    expect(
      ticketListMeta(
        t("INC-3", "RESOLVED", "2026-08-01T10:00:00", "2026-09-02T12:00:00"),
      ),
    ).toBe("INC-3 · Resolvido em 02 set");
  });

  it("ordena abertos primeiro e resolvidos pelo mais recente", () => {
    const sorted = sortOtherTickets([
      t("R-old", "RESOLVED", "2026-06-01T10:00:00", "2026-07-11T10:00:00"),
      t("A-old", "IN_PROGRESS", "2026-09-01T10:00:00"),
      t("R-new", "RESOLVED", "2026-08-01T10:00:00", "2026-09-02T10:00:00"),
      t("A-new", "APPROVED", "2026-10-01T10:00:00"),
    ]);
    expect(sorted.map((x) => x.code)).toEqual([
      "A-new",
      "A-old",
      "R-new",
      "R-old",
    ]);
  });

  it("conta abertos e encerrados com plural", () => {
    const open = t("A", "IN_PROGRESS", "2026-10-01T10:00:00");
    const closed = t(
      "R",
      "RESOLVED",
      "2026-10-01T10:00:00",
      "2026-10-02T10:00:00",
    );
    expect(ticketCountsLabel([open, open, open, closed, closed])).toBe(
      "3 abertos · 2 encerrados",
    );
    expect(ticketCountsLabel([open, closed])).toBe("1 aberto · 1 encerrado");
    expect(ticketCountsLabel([open, open])).toBe("2 abertos");
    expect(ticketCountsLabel([])).toBe("Nenhum chamado");
  });
});
