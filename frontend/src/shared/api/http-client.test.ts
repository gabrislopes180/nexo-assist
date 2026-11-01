import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError } from "./api-error";
import { apiRequest } from "./http-client";

const schema = z.object({ ok: z.boolean() });

function stubFetch(status: number, body: string) {
  const fetchMock = vi.fn(async () => new Response(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function captureError(promise: Promise<unknown>): Promise<ApiError> {
  const error = await promise.catch((reason: unknown) => reason);
  if (!(error instanceof ApiError)) throw new Error("esperava ApiError");
  return error;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("apiRequest", () => {
  it("prefixa /api, envia JSON e devolve o corpo validado", async () => {
    const fetchMock = stubFetch(200, '{"ok":true}');

    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: { email: "a@b.c" },
      schema,
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "/api/auth/login",
      {
        method: "POST",
        body: '{"email":"a@b.c"}',
        headers: { "Content-Type": "application/json" },
      },
    ]);
  });

  it("classifica erro no formato do backend como http, com status e code", async () => {
    stubFetch(401, '{"error":{"code":"EMAIL_NOT_FOUND","message":"x"}}');

    const error = await captureError(apiRequest("/x", { schema }));

    expect(error).toMatchObject({
      kind: "http",
      status: 401,
      code: "EMAIL_NOT_FOUND",
    });
  });

  it("classifica 500 em texto puro do rewrite como unavailable", async () => {
    stubFetch(500, "Internal Server Error");

    const error = await captureError(apiRequest("/x", { schema }));

    expect(error.kind).toBe("unavailable");
    expect(error.code).toBeUndefined();
  });

  it("classifica erro em JSON fora do formato como unavailable", async () => {
    stubFetch(502, '{"message":"bad gateway"}');

    const error = await captureError(apiRequest("/x", { schema }));

    expect(error.kind).toBe("unavailable");
  });

  it("classifica falha do fetch como unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));

    const error = await captureError(apiRequest("/x", { schema }));

    expect(error.kind).toBe("unavailable");
  });

  it("cancela em 15 s e classifica como unavailable", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );

    const pending = captureError(apiRequest("/x", { schema }));
    controller.abort(new DOMException("timeout", "TimeoutError"));

    expect((await pending).kind).toBe("unavailable");
    expect(timeout).toHaveBeenCalledWith(15_000);
  });

  it("usa o timeoutMs informado no lugar do padrão", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    stubFetch(200, '{"ok":true}');

    await apiRequest("/x", { schema, timeoutMs: 125_000 });

    expect(timeout).toHaveBeenCalledWith(125_000);
  });

  it("classifica 200 fora do schema como invalid-response", async () => {
    stubFetch(200, '{"ok":"sim"}');

    const error = await captureError(apiRequest("/x", { schema }));

    expect(error.kind).toBe("invalid-response");
  });

  it("classifica 200 que não é JSON como invalid-response", async () => {
    stubFetch(200, "<html></html>");

    const error = await captureError(apiRequest("/x", { schema }));

    expect(error.kind).toBe("invalid-response");
  });
});
