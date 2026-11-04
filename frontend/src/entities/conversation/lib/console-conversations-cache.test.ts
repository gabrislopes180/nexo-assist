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

  it("primeira busca em andamento, sem cache: ainda marca como inválida", () => {
    const qc = client();
    const queryFn = vi.fn(() => new Promise<ConsoleConversation[]>(() => undefined));
    const observer = new QueryObserver(qc, { queryKey: list, queryFn });
    const unsubscribe = observer.subscribe(() => undefined);

    upsertConsoleConversation(qc, build());

    // Sem dado, o TanStack junta a nova busca com a em voo; quem cobre esse
    // caso é o RESYNC do primeiro sync (apply-console-event).
    expect(qc.getQueryState(list)?.isInvalidated).toBe(true);
    unsubscribe();
  });

  describe("com uma versão mais nova em cache (lastMessageAt)", () => {
    const newer = () =>
      build({
        status: "CLOSED",
        lastMessageAt: "2026-10-20T13:20:00.000Z",
      });
    const older = () =>
      build({
        status: "WITH_ANALYST",
        assignedToMe: true,
        lastMessageAt: "2026-10-20T13:12:00.000Z",
      });

    it("não troca a conversa da lista nem do detalhe por uma mais velha", () => {
      const qc = client();
      const cached = newer();
      qc.setQueryData(list, [cached]);
      qc.setQueryData(detail(cached.id), cached);

      upsertConsoleConversation(qc, older());

      expect(qc.getQueryData(list)).toEqual([cached]);
      expect(qc.getQueryData(detail(cached.id))).toEqual(cached);
    });

    it("compara a lista e o detalhe cada um com o seu valor", () => {
      const qc = client();
      qc.setQueryData(list, [newer()]);
      qc.setQueryData(detail("c-ana"), build({ lastMessageAt: "2026-10-20T13:00:00.000Z" }));
      const incoming = older();

      upsertConsoleConversation(qc, incoming);

      expect(qc.getQueryData(list)).toEqual([newer()]);
      expect(qc.getQueryData(detail("c-ana"))).toEqual(incoming);
    });

    it("no mesmo instante, a que chega vence", () => {
      const qc = client();
      qc.setQueryData(list, [older()]);
      const incoming = build({
        ...older(),
        ticketCode: "INC-20311",
      });

      upsertConsoleConversation(qc, incoming);

      expect(qc.getQueryData(list)).toEqual([incoming]);
    });

    it("descartada, não rebusca a lista em andamento", () => {
      const qc = client();
      const queryFn = vi.fn(() => new Promise<ConsoleConversation[]>(() => undefined));
      qc.setQueryData(list, [newer()]);
      const observer = new QueryObserver(qc, { queryKey: list, queryFn });
      const unsubscribe = observer.subscribe(() => undefined);

      upsertConsoleConversation(qc, older());

      expect(qc.getQueryState(list)?.isInvalidated).toBe(false);
      unsubscribe();
    });
  });
});
