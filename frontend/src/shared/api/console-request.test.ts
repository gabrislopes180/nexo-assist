import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { consoleApiMode, consoleRequest } from "./console-request";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("consoleRequest", () => {
  it("usa o mock por padrão", () => {
    vi.stubEnv("NEXT_PUBLIC_CONSOLE_API", "");
    expect(consoleApiMode()).toBe("mock");
  });

  it("no modo real, chama /api/console sem repassar o mockContext", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONSOLE_API", "real");
    const fetchMock = vi.fn(async () => new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await consoleRequest("/console/conversations/x/takeover", {
      method: "POST",
      schema: z.object({ ok: z.boolean() }),
      mockContext: { viewer: { id: "a", name: "A" } },
    });

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/console/conversations/x/takeover",
      { method: "POST", body: undefined },
    ]);
  });
});
