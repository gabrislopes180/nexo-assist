import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { activeConversationKey, activeConversationOptions } from "./get-active-conversation";

const absent = { conversation: null, messages: [], pendingDraft: null };
afterEach(() => vi.unstubAllGlobals());

describe("descoberta da conversa ativa", () => {
  it("isola a consulta por usuário e confirma no servidor em vez de usar cache antigo", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(absent)));
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient();
    client.setQueryData(activeConversationKey("u1"), { ...absent, conversation: { id: "conversa de u1" } });
    client.setQueryData(activeConversationKey("u2"), { ...absent, conversation: { id: "cache antigo" } });
    expect(await client.fetchQuery(activeConversationOptions("u2"))).toEqual(absent);
    expect(client.getQueryData(activeConversationKey("u1"))).toMatchObject({ conversation: { id: "conversa de u1" } });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/chat/conversations/active");
    client.clear();
  });

  it("distingue carregamento, erro e ausência confirmada; retry é explícito", async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
    const client = new QueryClient();
    const observer = new QueryObserver(client, activeConversationOptions("u1"));
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().isPending).toBe(true);
    finish(new Response(JSON.stringify({ error: { code: "INTERNAL_ERROR", message: "Falha ao ler" } }), { status: 500 }));
    await vi.waitFor(() => expect(observer.getCurrentResult().isError).toBe(true));
    expect(observer.getCurrentResult().data).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(absent))));
    await observer.refetch();
    expect(observer.getCurrentResult().data).toEqual(absent);
    expect(observer.getCurrentResult().isSuccess).toBe(true);
    unsubscribe(); observer.destroy(); client.clear();
  });

  it("cancela a requisição e não preenche o cache quando a resposta antiga termina", async () => {
    let finish!: (response: Response) => void;
    let signal: AbortSignal | null | undefined;
    vi.stubGlobal("fetch", vi.fn((_url, init?: RequestInit) => {
      signal = init?.signal;
      return new Promise<Response>((resolve) => { finish = resolve; });
    }));
    const client = new QueryClient();
    const old = client.fetchQuery(activeConversationOptions("u1")).catch(() => undefined);
    await client.cancelQueries({ queryKey: activeConversationKey("u1") });
    client.removeQueries({ queryKey: activeConversationKey("u1") });
    expect(signal?.aborted).toBe(true);
    finish(new Response(JSON.stringify(absent)));
    await old;
    expect(client.getQueryData(activeConversationKey("u1"))).toBeUndefined();
    client.clear();
  });
});
