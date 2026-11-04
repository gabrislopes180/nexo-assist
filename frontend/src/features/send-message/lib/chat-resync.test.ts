import { describe, expect, it, vi } from "vitest";
import type { ChatConversationDetail } from "../model/chat-schema";
import { createChatResync } from "./chat-resync";

const snapshot = (status: "WITH_AGENT" | "WITH_ANALYST" = "WITH_AGENT"): ChatConversationDetail => ({
  conversation: { id: "c1", status, messageCount: 1, messageLimit: 30, remainingMessages: 29, analyst: null },
  messages: [], pendingDraft: null,
});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function setup() {
  const context = { conversationId: "c1" as string | undefined, generation: 1, busy: false };
  const pending: Array<{ resolve: (data: ChatConversationDetail) => void; reject: (error: unknown) => void }> = [];
  const read = vi.fn(() => new Promise<ChatConversationDetail>((resolve, reject) => pending.push({ resolve, reject })));
  const onSnapshot = vi.fn();
  const onError = vi.fn();
  return { context, pending, read, onSnapshot, onError, sync: createChatResync({ current: () => context, read, onSnapshot, onError }) };
}

describe("ressincronização do chat", () => {
  it("evento do analista durante o GET descarta snapshot antigo e lê o estado novo", async () => {
    const s = setup();
    s.sync.run();
    s.sync.invalidate(); // conversation.updated chegou com WITH_ANALYST.
    s.pending[0]!.resolve(snapshot("WITH_AGENT"));
    await flush();
    expect(s.onSnapshot).not.toHaveBeenCalled();
    expect(s.read).toHaveBeenCalledTimes(2);
    s.pending[1]!.resolve(snapshot("WITH_ANALYST"));
    await flush();
    expect(s.onSnapshot).toHaveBeenCalledExactlyOnceWith(snapshot("WITH_ANALYST"));
  });

  it("confirmação em andamento adia a leitura; o GET anterior não reativa a proposta", async () => {
    const s = setup();
    s.sync.run();
    s.context.busy = true;
    s.sync.invalidate();
    s.pending[0]!.resolve(snapshot());
    await flush();
    expect(s.onSnapshot).not.toHaveBeenCalled();
    expect(s.read).toHaveBeenCalledTimes(1);
    s.context.busy = false;
    s.sync.invalidate();
    s.sync.resume();
    s.pending[1]!.resolve(snapshot());
    await flush();
    expect(s.onSnapshot).toHaveBeenCalledTimes(1);
  });

  it("troca de sessão ou conversa descarta respostas e pedidos antigos", async () => {
    const s = setup();
    s.sync.run();
    s.sync.run();
    s.context.generation += 1;
    s.context.conversationId = undefined;
    s.pending[0]!.resolve(snapshot());
    await flush();
    expect(s.onSnapshot).not.toHaveBeenCalled();
    expect(s.read).toHaveBeenCalledTimes(1);
  });

  it("404 atrasado também não apaga a conversa de outra geração", async () => {
    const s = setup();
    s.sync.run();
    s.context.generation += 1;
    s.pending[0]!.reject(new Error("404 da conversa antiga"));
    await flush();
    expect(s.onError).not.toHaveBeenCalled();
  });

  it("só permite um GET por vez e mantém um único pedido de atualização", async () => {
    const s = setup();
    s.sync.run(); s.sync.run(); s.sync.run();
    expect(s.read).toHaveBeenCalledTimes(1);
    s.pending[0]!.resolve(snapshot());
    await flush();
    expect(s.read).toHaveBeenCalledTimes(2);
    s.pending[1]!.resolve(snapshot());
    await flush();
    expect(s.read).toHaveBeenCalledTimes(2);
  });
});
