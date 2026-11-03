import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { consoleConversationKeys } from "../api/console-conversation-keys";
import type { ConsoleConversation } from "../model/console-conversation";
import { upsertConsoleConversation } from "./console-conversations-cache";
import { buildConsoleConversation as build } from "./test-fixtures";

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });
const list = consoleConversationKeys.list();
const detail = (id: string) => consoleConversationKeys.detail(id);

describe("upsertConsoleConversation", () => {
  it("troca a conversa na lista e no detalhe pelo id", () => {
    const qc = client();
    const ana = build();
    const other = build({ id: "c-carla" });
    qc.setQueryData(list, [other, ana]);
    qc.setQueryData(detail(ana.id), ana);
    const updated = build({ status: "WITH_ANALYST", assignedToMe: true });

    upsertConsoleConversation(qc, updated);

    expect(qc.getQueryData(list)).toEqual([other, updated]);
    expect(qc.getQueryData(detail(ana.id))).toEqual(updated);
  });

  it("insere conversa nova na lista em cache", () => {
    const qc = client();
    const ana = build();
    qc.setQueryData(list, [ana]);
    const fresh = build({ id: "c-new" });

    upsertConsoleConversation(qc, fresh);

    expect(qc.getQueryData(list)).toEqual([ana, fresh]);
  });

  it("sem lista nem detalhe em cache, não cria nada", () => {
    const qc = client();

    upsertConsoleConversation(qc, build());

    expect(qc.getQueryData(list)).toBeUndefined();
    expect(qc.getQueryData(detail("c-ana"))).toBeUndefined();
  });

  it("com busca em andamento, invalida para não perder o evento", async () => {
    const qc = client();
    const queryFn = vi.fn(() => new Promise<ConsoleConversation[]>(() => undefined));
    qc.setQueryData(list, [build()]);
    // Observer inscrito: a query fica ativa e o dado velho é rebuscado, como na tela.
    const observer = new QueryObserver(qc, { queryKey: list, queryFn });
    const unsubscribe = observer.subscribe(() => undefined);
    expect(queryFn).toHaveBeenCalledTimes(1);

    upsertConsoleConversation(qc, build({ status: "CLOSED" }));

    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    unsubscribe();
  });
});
