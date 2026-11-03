import { afterEach, describe, expect, it, vi } from "vitest";
import { returnToAgent } from "./return-to-agent";

const conversation = {
  id: "c1",
  status: "WITH_AGENT",
  owner: { id: "u1", name: "Ana Souza", department: null },
  analyst: null,
  assignedToMe: false,
  assignedAt: null,
  handoffReason: null,
  handoffSummary: null,
  handoffAt: null,
  lastMessageAt: "2026-11-03T10:20:00.000Z",
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

describe("returnToAgent", () => {
  it("faz POST sem corpo na rota de devolver", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ conversation }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await returnToAgent("c1");

    expect(result.status).toBe("WITH_AGENT");
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/console/conversations/c1/return",
      { method: "POST", body: undefined },
    ]);
  });
});
