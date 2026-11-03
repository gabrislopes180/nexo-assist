import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { consoleMessagesKey } from "../api/use-console-messages";
import type { TimelineMessage } from "../model/timeline-message";
import { appendConsoleMessage } from "./console-messages-cache";

const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

const message = (id: string, createdAt: string): TimelineMessage => ({
  id,
  authorType: "EMPLOYEE",
  author: { id: "u1", name: "Ana Souza" },
  content: id,
  createdAt,
  trace: null,
});

const m1 = message("m1", "2026-11-03T10:00:00.000Z");
const m2 = message("m2", "2026-11-03T10:01:00.000Z");
const m3 = message("m3", "2026-11-03T10:02:00.000Z");

describe("appendConsoleMessage", () => {
  it("anexa a mensagem na ordem de createdAt", () => {
    const qc = client();
    qc.setQueryData(consoleMessagesKey("c1"), [m1, m3]);

    appendConsoleMessage(qc, "c1", m2);

    expect(qc.getQueryData(consoleMessagesKey("c1"))).toEqual([m1, m2, m3]);
  });

  it("não duplica mensagem que já está no cache", () => {
    const qc = client();
    const cached = [m1, m2];
    qc.setQueryData(consoleMessagesKey("c1"), cached);

    appendConsoleMessage(qc, "c1", { ...m2, content: "outra" });

    expect(qc.getQueryData(consoleMessagesKey("c1"))).toBe(cached);
  });

  it("ignora conversa sem mensagens em cache", () => {
    const qc = client();

    appendConsoleMessage(qc, "c1", m1);

    expect(qc.getQueryData(consoleMessagesKey("c1"))).toBeUndefined();
  });

  it("com busca em andamento, invalida para não perder o evento", async () => {
    const qc = client();
    const queryFn = vi.fn(() => new Promise<TimelineMessage[]>(() => undefined));
    qc.setQueryData(consoleMessagesKey("c1"), [m1]);
    // Observer inscrito: a query fica ativa e o dado velho é rebuscado, como na tela.
    const observer = new QueryObserver(qc, { queryKey: consoleMessagesKey("c1"), queryFn });
    const unsubscribe = observer.subscribe(() => undefined);
    expect(queryFn).toHaveBeenCalledTimes(1);

    appendConsoleMessage(qc, "c1", m2);

    await vi.waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2));
    unsubscribe();
  });
});
