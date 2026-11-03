import { afterEach, describe, expect, it, vi } from "vitest";
import { takeoverConversation } from "./takeover-conversation";

const conversation = {
  id: "x/1",
  status: "WITH_ANALYST",
  owner: { id: "u1", name: "Ana Souza", department: null },
  analyst: { id: "a1", name: "Rafael Lima" },
  assignedToMe: true,
  assignedAt: "2026-11-03T10:12:00.000Z",
  handoffReason: "EMPLOYEE_REQUEST",
  handoffSummary: null,
  handoffAt: "2026-11-03T10:05:00.000Z",
  lastMessageAt: "2026-11-03T10:12:00.000Z",
  closedAt: null,
  messageCount: 2,
  messageLimit: 30,
  lastMessage: null,
  lastAgentConfidence: null,
  ticketCode: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("takeoverConversation", () => {
  it("faz POST sem corpo e devolve a conversa", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ conversation }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await takeoverConversation("x/1");

    expect(result.assignedToMe).toBe(true);
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/console/conversations/x%2F1/takeover",
      { method: "POST", body: undefined },
    ]);
  });
});
