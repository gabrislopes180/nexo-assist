import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { logout, signOut } from "./logout";

afterEach(() => vi.unstubAllGlobals());

describe("signOut", () => {
  it("não deixa uma consulta anterior devolver o usuário depois de sair", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const client = new QueryClient();
    const user = { id: "1" };
    let finishOldQuery: (value: typeof user) => void = () => {};
    void client
      .fetchQuery({
        queryKey: SESSION_QUERY_KEY,
        queryFn: () =>
          new Promise<typeof user>((resolve) => {
            finishOldQuery = resolve;
          }),
      })
      .catch(() => null);

    await signOut(client);
    finishOldQuery(user);
    await new Promise((resolve) => setTimeout(resolve));

    expect(client.getQueryData(SESSION_QUERY_KEY)).toBeNull();
  });
});

describe("logout", () => {
  it("aceita 204 sem corpo", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(null, { status: 204 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(logout()).resolves.toBeUndefined();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/auth/logout");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("lança quando a API falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("erro", { status: 500 })),
    );

    await expect(logout()).rejects.toMatchObject({ kind: "unavailable" });
  });
});
