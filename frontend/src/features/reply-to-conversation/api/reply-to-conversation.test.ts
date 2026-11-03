import { afterEach, describe, expect, it, vi } from "vitest";
import { replyToConversation } from "./reply-to-conversation";

const conversation = {
  id: "c/1",
  status: "WITH_ANALYST",
  owner: { id: "u1", name: "Ana Souza", department: null },
  analyst: { id: "a1", name: "Rafael Lima" },
  assignedToMe: true,
  assignedAt: "2026-11-03T10:12:00.000Z",
  handoffReason: "EMPLOYEE_REQUEST",
  handoffSummary: null,
  handoffAt: "2026-11-03T10:05:00.000Z",
  lastMessageAt: "2026-11-03T10:13:00.000Z",
  closedAt: null,
  messageCount: 2,
  messageLimit: 30,
  lastMessage: null,
  lastAgentConfidence: null,
  ticketCode: null,
};

const message = {
  id: "m9",
  authorType: "ANALYST",
  author: { id: "a1", name: "Rafael Lima" },
  content: "Oi, Ana",
  createdAt: "2026-11-03T10:13:00.000Z",
  trace: null,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("replyToConversation", () => {
  it("faz POST com { content } e devolve mensagem e conversa", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ message, conversation }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await replyToConversation({
      conversationId: "c/1",
      content: "Oi, Ana",
    });

    expect(result.message.id).toBe("m9");
    expect(result.conversation.id).toBe("c/1");
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/console/conversations/c%2F1/messages",
      { method: "POST", body: JSON.stringify({ content: "Oi, Ana" }) },
    ]);
  });
});
