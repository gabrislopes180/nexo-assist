import { afterEach, describe, expect, it, vi } from "vitest";
import { sendChatMessage } from "./send-message";

const response = {
  conversation: {
    id: "c1",
    status: "WITH_AGENT",
    messageCount: 1,
    messageLimit: 30,
    remainingMessages: 29,
  },
  message: {
    id: "m1",
    content: "Olá",
    createdAt: "2026-10-16T17:20:00.000Z",
    trace: { actions: [] },
  },
  ticketLookup: null,
};

function stubFetch() {
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify(response), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("sendChatMessage", () => {
  it("omite conversationId na primeira mensagem, pois o backend é estrito", async () => {
    const fetchMock = stubFetch();

    await sendChatMessage({ message: "oi" });

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/chat",
      { method: "POST", body: '{"message":"oi"}' },
    ]);
  });

  it("envia conversationId nas mensagens seguintes", async () => {
    const fetchMock = stubFetch();

    await sendChatMessage({ message: "oi", conversationId: "c1" });

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/chat",
      { body: '{"message":"oi","conversationId":"c1"}' },
    ]);
  });

  it("espera 125 s, acima do limite de 120 s do agent", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    stubFetch();

    await sendChatMessage({ message: "oi" });

    expect(timeout).toHaveBeenCalledWith(125_000);
  });
});
