import { describe, expect, it } from "vitest";
import { chatReducer, createInitialChatState, type ChatState } from "./chat-reducer";
import { activeChatConversationSchema, type ActiveChatConversation } from "./chat-schema";

const at = "2026-11-04T13:00:00.000Z";
const draft = { id: "d1", kind: "CREATE", type: "INC", category: "NETWORK_VPN", priority: "HIGH", title: "VPN", description: "Erro 809", affectedScope: "INDIVIDUAL", dueAtPreview: "2026-11-04T17:00:00.000Z" };
const trace = { understood: "VPN com erro", intent: "OPEN_TICKET", actions: [{ tool: "draftTicket", summary: "Preparou proposta", status: "SUCCESS" }], confidence: "HIGH", reason: "Impacto individual", attachments: { ticketDraft: draft } };
const raw = {
  conversation: { id: "c1", status: "WITH_AGENT", messageCount: 12, messageLimit: 30, remainingMessages: 18, analyst: null },
  messages: [
    { id: "e1", authorType: "EMPLOYEE", author: { id: "u1", name: "Marina" }, content: "VPN com erro", createdAt: at },
    { id: "m1", authorType: "AGENT", author: null, content: "Confira a proposta", createdAt: at, trace },
  ],
  pendingDraft: { messageId: "m1", draft },
};
const snapshot = () => activeChatConversationSchema.parse(raw);
const hydrate = (data: ActiveChatConversation = snapshot(), state = createInitialChatState()) => chatReducer(state, { type: "hydrated", snapshot: data });
const lastAgent = (state: ChatState) => state.items.find((item) => item.id === "m1" && item.kind === "agent");

describe("retomada do chat", () => {
  it("só libera a inicialização após ausência confirmada e não cria conversa", () => {
    const initial = createInitialChatState();
    expect(initial.initialized).toBe(false);
    const state = hydrate({ conversation: null, messages: [], pendingDraft: null });
    expect(state.initialized).toBe(true);
    expect(state.items).toEqual([]);
    expect(state.conversationId).toBeUndefined();
  });

  it("restaura histórico, transparência, cota e proposta pelo ID persistido", () => {
    const state = hydrate();
    expect(state).toMatchObject({ initialized: true, conversationId: "c1", status: "WITH_AGENT", count: 12, limit: 30 });
    expect(state.items.map((item) => item.id)).toEqual(["e1", "m1"]);
    expect(lastAgent(state)).toMatchObject({ trace, draft: { data: draft, status: "pending" } });
  });

  it.each(["WAITING_ANALYST", "WITH_ANALYST"] as const)("mantém %s, sem reativar propostas", (status) => {
    const state = hydrate({ ...snapshot(), conversation: { ...snapshot().conversation!, status, analyst: { id: "a1", name: "Bruno" }, messageCount: 30, remainingMessages: 0 } });
    expect(state).toMatchObject({ status, count: 30, analyst: { id: "a1", name: "Bruno" }, lock: null });
    expect(lastAgent(state)).toMatchObject({ draft: { status: "unavailable" } });
  });

  it("preserva cota esgotada e ainda permite confirmar o rascunho", () => {
    const state = hydrate({ ...snapshot(), conversation: { ...snapshot().conversation!, messageCount: 30, remainingMessages: 0 } });
    expect(state.lock?.allowsDrafts).toBe(true);
    expect(state.count).toBe(30);
    expect(lastAgent(state)).toMatchObject({ draft: { status: "pending" } });
  });

  it("anexo antigo não reativa proposta consumida; snapshot atual é a autoridade", () => {
    const state = hydrate({ ...snapshot(), pendingDraft: null });
    expect(lastAgent(state)).toMatchObject({ draft: { status: "unavailable" } });
    const active = hydrate();
    const updated = chatReducer(active, { type: "resynced", conversation: snapshot().conversation!, messages: snapshot().messages, pendingDraft: null });
    expect(lastAgent(updated)).toMatchObject({ draft: { status: "unavailable" } });
  });

  it("snapshot repetido não duplica mensagens nem apaga edição local da proposta", () => {
    const initial = hydrate();
    const edited = chatReducer(initial, { type: "draftEdited", id: "m1", values: { kind: "CREATE", title: "Título editado", description: "Erro", affectedScope: "INDIVIDUAL" } });
    const state = chatReducer(edited, { type: "resynced", conversation: snapshot().conversation!, messages: snapshot().messages, pendingDraft: snapshot().pendingDraft });
    expect(state.items).toHaveLength(2);
    expect(lastAgent(state)).toMatchObject({ draft: { values: { title: "Título editado" } } });
  });

  it("hidratação tardia não sobrescreve envio, estado já restaurado ou escolha de nova conversa", () => {
    const initial = hydrate();
    expect(hydrate({ ...snapshot(), conversation: { ...snapshot().conversation!, status: "CLOSED" } }, initial)).toBe(initial);
    const pending = chatReducer(createInitialChatState(), { type: "sent", id: "local", text: "Nova mensagem" });
    expect(hydrate(snapshot(), pending)).toBe(pending);
    const fresh = chatReducer(initial, { type: "reset" });
    expect(hydrate(snapshot(), fresh)).toBe(fresh);
    expect(fresh.items).toEqual([]);
    expect(fresh.initialized).toBe(true);
  });

  it("limpeza por troca de sessão volta a aguardar recuperação, sem mensagens anteriores", () => {
    const cleared = chatReducer(hydrate(), { type: "reset", recover: true });
    expect(cleared).toEqual(createInitialChatState());
    expect(hydrate({ conversation: null, messages: [], pendingDraft: null }, cleared).items).toEqual([]);
  });

  it("recupera cards de consulta e opções rápidas do snapshot, sem usar chamados atuais", () => {
    const data = activeChatConversationSchema.parse({ ...raw, pendingDraft: null, messages: [{ ...raw.messages[1], trace: {
      ...trace, attachments: { quickReplies: ["Só eu", "Minha equipe"], ticketLookup: {
        outcome: "SINGLE_MATCH", openTicketCount: 1, totalMatches: 1, tickets: [{ code: "INC-1", type: "INC", category: "NETWORK_VPN", priority: "HIGH", status: "IN_PROGRESS", statusLabel: "Em andamento", title: "Título histórico", createdAt: at, dueAt: null, overdue: false }],
      } },
    } }] });
    expect(lastAgent(hydrate(data))).toMatchObject({ quickReplies: ["Só eu", "Minha equipe"], lookup: { tickets: [{ title: "Título histórico" }] } });
  });
});
