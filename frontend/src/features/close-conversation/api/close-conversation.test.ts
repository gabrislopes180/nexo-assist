import { afterEach, describe, expect, it, vi } from "vitest";
import { closeConversation } from "./close-conversation";

const conversation = {
  id: "c1",
  status: "CLOSED",
  owner: { id: "u1", name: "Ana Souza", department: null },
  analyst: { id: "a1", name: "Rafael Lima" },
  assignedToMe: true,
  assignedAt: "2026-11-03T10:12:00.000Z",
  handoffReason: "EMPLOYEE_REQUEST",
  handoffSummary: null,
  handoffAt: "2026-11-03T10:05:00.000Z",
  lastMessageAt: "2026-11-03T10:30:00.000Z",
  closedAt: "2026-11-03T10:30:00.000Z",
  messageCount: 2,
  messageLimit: 30,
  lastMessage: null,
  lastAgentConfidence: null,
  ticketCode: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("closeConversation", () => {
  it("faz POST sem corpo na rota de encerrar", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ conversation }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await closeConversation("c1");

    expect(result.status).toBe("CLOSED");
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/console/conversations/c1/close",
      { method: "POST", body: undefined },
    ]);
  });
});
