import { afterEach, describe, expect, it, vi } from "vitest";
import { buildConsoleFixtures } from "@/shared/api/console-mock";
import { returnToAgent } from "./return-to-agent";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("returnToAgent", () => {
  it("no modo real, faz POST sem corpo na rota de devolver", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONSOLE_API", "real");
    const conversation = buildConsoleFixtures(new Date(), "default").conversations[3];
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ conversation }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await returnToAgent({
      conversationId: "c1",
      viewer: { id: "a1", name: "Rafael Lima" },
    });

    expect(result.status).toBe("WITH_AGENT");
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/console/conversations/c1/return",
      { method: "POST" },
    ]);
  });
});
