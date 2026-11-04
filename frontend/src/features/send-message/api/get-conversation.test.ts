import { afterEach, describe, expect, it, vi } from "vitest";
import { getChatConversation } from "./get-conversation";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getChatConversation", () => {
  it("busca a conversa com as mensagens pelo id", async () => {
    const body = {
      conversation: {
        id: "c/1",
        status: "WITH_ANALYST",
        messageCount: 3,
        messageLimit: 30,
        remainingMessages: 27,
        analyst: { id: "a1", name: "Rafael Lima" },
      },
      messages: [
        {
          id: "s1",
          authorType: "SYSTEM",
          author: null,
          content: "Rafael assumiu a conversa",
          createdAt: "2026-11-03T10:12:00.000Z",
          trace: null,
          systemKind: "TAKEOVER",
        },
      ],
    };
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify(body), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getChatConversation("c/1");

    expect(result.messages).toHaveLength(1);
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/chat/conversations/c%2F1",
      { method: "GET" },
    ]);
  });
});
