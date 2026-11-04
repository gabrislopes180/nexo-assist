import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { CHAT_QUERY_ROOT, CONSOLE_QUERY_ROOT } from "@/shared/api/query-keys";
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

describe("signOut e o console", () => {
  it("remove também as conversas do funcionário antes de anular a sessão", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })));
    const client = new QueryClient();
    client.setQueryData([...CHAT_QUERY_ROOT, "u1", "active"], { conversation: { id: "c1" } });
    await signOut(client);
    expect(client.getQueryCache().findAll({ queryKey: CHAT_QUERY_ROOT })).toEqual([]);
    expect(client.getQueryData(SESSION_QUERY_KEY)).toBeNull();
    client.clear();
  });

  it("remove os dados do console antes de anular a sessão", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );
    const client = new QueryClient();
    client.setQueryData([...CONSOLE_QUERY_ROOT, "conversations", "list"], [1]);

    await signOut(client);

    expect(client.getQueryCache().findAll({ queryKey: CONSOLE_QUERY_ROOT })).toEqual([]);
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
