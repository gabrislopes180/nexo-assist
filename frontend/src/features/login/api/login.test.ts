import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SESSION_QUERY_KEY } from "@/entities/session";
import { signIn } from "./login";

const user = {
  id: "1",
  name: "Ana Souza",
  email: "ana.souza@nexo.example",
  role: "ANALYST",
  department: "TI",
};
const noSession = '{"error":{"code":"SESSION_MISSING","message":"x"}}';

type Route = [status: number, body: string];

const okUser: Route = [200, JSON.stringify({ user })];

function stubApi(login: Route, me: Route) {
  const fetchMock = vi.fn<typeof fetch>(async (url) => {
    const [status, body] = url === "/api/auth/login" ? login : me;
    return new Response(body, { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("signIn", () => {
  it("envia somente o e-mail no POST", async () => {
    const fetchMock = stubApi(okUser, okUser);

    await signIn(new QueryClient(), user.email);

    const body = fetchMock.mock.calls[0]?.[1]?.body;
    expect(JSON.parse(String(body))).toEqual({ email: user.email });
  });

  it("confirma a sessão e grava o usuário na chave da sessão", async () => {
    stubApi(okUser, okUser);
    const client = new QueryClient();

    await expect(signIn(client, user.email)).resolves.toEqual(user);
    expect(client.getQueryData(SESSION_QUERY_KEY)).toEqual(user);
  });

  it("devolve null quando o login responde 200 e a sessão não existe", async () => {
    stubApi(okUser, [401, noSession]);

    await expect(signIn(new QueryClient(), user.email)).resolves.toBeNull();
  });

  it("ignora um null recente em cache e consulta a sessão de novo", async () => {
    stubApi(okUser, okUser);
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: 30_000 } },
    });
    client.setQueryData(SESSION_QUERY_KEY, null);

    await expect(signIn(client, user.email)).resolves.toEqual(user);
  });

  it("não aproveita uma consulta de sessão anterior ainda em andamento", async () => {
    stubApi(okUser, okUser);
    const client = new QueryClient();
    let finishOldQuery: (value: null) => void = () => {};
    void client
      .fetchQuery({
        queryKey: SESSION_QUERY_KEY,
        queryFn: () =>
          new Promise<null>((resolve) => {
            finishOldQuery = resolve;
          }),
      })
      .catch(() => null);

    const pending = signIn(client, user.email);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    finishOldQuery(null);

    await expect(pending).resolves.toEqual(user);
  });

  it("não repete a confirmação da sessão quando ela falha", async () => {
    const fetchMock = stubApi(okUser, [500, "Internal Server Error"]);
    const client = new QueryClient({
      defaultOptions: { queries: { retry: 2, retryDelay: 0 } },
    });

    await expect(signIn(client, user.email)).rejects.toMatchObject({
      kind: "unavailable",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("propaga o erro do login sem consultar a sessão", async () => {
    const fetchMock = stubApi(
      [401, '{"error":{"code":"EMAIL_NOT_FOUND","message":"x"}}'],
      okUser,
    );

    await expect(signIn(new QueryClient(), "x@y.z")).rejects.toMatchObject({
      code: "EMAIL_NOT_FOUND",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
