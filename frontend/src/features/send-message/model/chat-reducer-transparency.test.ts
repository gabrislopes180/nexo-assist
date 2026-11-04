import { describe, expect, it } from "vitest";
import { agentMessageSchema, messageCreatedEventSchema, type AgentTrace } from "@/entities/message";
import { chatReducer, createInitialChatState, type ChatState } from "./chat-reducer";
import { chatConversationDetailSchema, chatResponseSchema } from "./chat-schema";

const at = "2026-11-04T13:00:00.000Z";
const conversation = { id: "c1", status: "WITH_AGENT", messageCount: 1, messageLimit: 30, remainingMessages: 29, analyst: null };
const trace: AgentTrace = {
  understood: "Você quer consultar seus chamados.", intent: "CHECK_TICKET",
  actions: [{ tool: "searchMyOpenTickets", status: "SUCCESS", summary: "Consultou seus chamados abertos." }],
  confidence: "HIGH", reason: "A consulta usou o usuário da sessão.",
};
const message = { id: "m1", authorType: "AGENT", author: null, systemKind: null, content: "Encontrei seu chamado.", createdAt: at, trace };
const response = chatResponseSchema.parse({
  conversation, message, ticketLookup: null,
  employeeMessage: { id: "e1", authorType: "EMPLOYEE", content: "Meus chamados", createdAt: at },
});
function active() {
  const pending = chatReducer(createInitialChatState(), { type: "sent", id: "local-1", text: "Meus chamados" });
  return chatReducer(pending, { type: "succeeded", result: response });
}
const agentTraces = (state: ChatState) => state.items.filter((item) => item.kind === "agent").map((item) => [item.id, item.trace]);

describe("chatReducer: preservação da transparência", () => {
  it("preserva a decisão do POST, incluindo a confiança sem conversão", () => {
    expect(agentTraces(active())).toEqual([["m1", trace]]);
  });

  it("preserva decisões distintas de mensagens recebidas por SSE e histórico", () => {
    const second = { ...trace, reason: "Outra decisão", confidence: "LOW" };
    const event = messageCreatedEventSchema.parse({ conversationId: "c1", message: { ...message, id: "m2", trace: second } });
    const streamed = chatReducer(active(), { type: "streamMessage", ...event });
    const history = chatConversationDetailSchema.parse({ conversation, messages: [message, { ...message, id: "m2", trace: second }] });
    const resynced = chatReducer(streamed, { type: "resynced", ...history });
    expect(agentTraces(resynced)).toEqual([["m1", trace], ["m2", second]]);

    // Mensagem ainda ausente da tela: reconstrução pelo GET usa a mesma decisão.
    const restored = chatReducer(active(), { type: "resynced", ...history });
    expect(agentTraces(restored)).toEqual(agentTraces(resynced));
  });

  it("preserva a decisão da confirmação separada da proposta original", () => {
    // A ação em andamento referencia o item; a resposta é outra mensagem persistida.
    const before = { ...active(), draftOp: { itemId: "m1", action: "confirm" as const } };
    const confirmed = { ...trace, understood: "Confirmação da abertura", intent: "OPEN_TICKET", actions: [{ tool: "createTicket", summary: "Abriu o INC-1 após a confirmação.", status: "SUCCESS" }], reason: "Confirmação explícita do rascunho." };
    const state = chatReducer(before, {
      type: "draftConfirmed",
      result: {
        message: agentMessageSchema.parse({ ...message, id: "m3", trace: confirmed }),
        ticket: { code: "INC-1", type: "INC", category: "NETWORK_VPN", priority: "HIGH", status: "WAITING_ANALYST", statusLabel: "Aguardando analista", title: "VPN", createdAt: at, dueAt: null, overdue: false },
      },
    });
    expect(agentTraces(state)).toEqual([["m1", trace], ["m3", confirmed]]);
  });
});
