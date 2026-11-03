import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConsoleFixtures } from "@/shared/api/console-mock";
import { takeoverConversation } from "./takeover-conversation";

const viewer = { id: "a1", name: "Rafael Lima" };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("takeoverConversation", () => {
  it("no mock, assume com o analista da sessão", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONSOLE_API", "mock");
    vi.useFakeTimers();
    const pending = takeoverConversation({ conversationId: "mock-conv-carla", viewer });
    await vi.runAllTimersAsync();

    expect(await pending).toMatchObject({ status: "WITH_ANALYST", analyst: viewer });
  });

  it("no modo real, faz POST sem corpo", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONSOLE_API", "real");
    const conversation = buildConsoleFixtures(new Date(), "default").conversations[1];
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ conversation }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await takeoverConversation({ conversationId: "x/1", viewer });

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/console/conversations/x%2F1/takeover",
      { method: "POST", body: undefined },
    ]);
  });
});
