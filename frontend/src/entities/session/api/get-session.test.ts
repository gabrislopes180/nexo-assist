import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/api-error";
import { getSession } from "./get-session";

const user = {
  id: "1",
  name: "Ana Souza",
  email: "ana.souza@nexo.example",
  role: "ANALYST",
  department: null,
};

function stubResponse(status: number, body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(body, { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("getSession", () => {
  it("devolve o usuário da sessão", async () => {
    stubResponse(200, JSON.stringify({ user }));

    await expect(getSession()).resolves.toEqual(user);
  });

  it.each(["SESSION_MISSING", "SESSION_INVALID"])(
    "devolve null em 401 %s",
    async (code) => {
      stubResponse(401, JSON.stringify({ error: { code, message: "x" } }));

      await expect(getSession()).resolves.toBeNull();
    },
  );

  it("lança em 500 no formato do backend", async () => {
    stubResponse(500, '{"error":{"code":"INTERNAL_ERROR","message":"x"}}');

    await expect(getSession()).rejects.toMatchObject({
      kind: "http",
      status: 500,
    });
  });

  it("lança quando a API está indisponível", async () => {
    stubResponse(500, "Internal Server Error");

    await expect(getSession()).rejects.toBeInstanceOf(ApiError);
  });
});
