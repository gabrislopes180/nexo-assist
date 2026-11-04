import { afterEach, describe, expect, it, vi } from "vitest";
import { buildTicketDetail } from "@/entities/ticket/lib/test-fixtures";
import { changeTicketStatus } from "./change-ticket-status";

afterEach(() => {
  vi.unstubAllGlobals();
});

const body = {
  toStatus: "IN_PROGRESS",
  expectedStatus: "WAITING_ANALYST",
  conversationId: "c1",
} as const;

function stubFetch(changed = true) {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      new Response(
        JSON.stringify({
          ticket: buildTicketDetail({ status: "IN_PROGRESS" }),
          changed,
        }),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("changeTicketStatus", () => {
  it("faz POST com o corpo na rota de status do chamado", async () => {
    const fetchMock = stubFetch();

    const result = await changeTicketStatus({ code: "INC-20405", body });

    expect(result.changed).toBe(true);
    expect(result.ticket.status).toBe("IN_PROGRESS");
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/console/tickets/INC-20405/status",
      { method: "POST", body: JSON.stringify(body) },
    ]);
  });

  it("codifica o código na URL", async () => {
    const fetchMock = stubFetch(false);

    await changeTicketStatus({ code: "INC 1/2", body });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "/api/console/tickets/INC%201%2F2/status",
    );
  });
});
