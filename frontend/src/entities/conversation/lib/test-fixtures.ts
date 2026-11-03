// Só para *.test.ts: nunca importe em código de produção.
import type { ConsoleConversation } from "../model/console-conversation";

export function buildConsoleConversation(
  overrides: Partial<ConsoleConversation> = {},
): ConsoleConversation {
  return {
    id: "c-ana",
    status: "WAITING_ANALYST",
    owner: { id: "u-ana", name: "Ana Souza", department: "Financeiro" },
    analyst: null,
    assignedToMe: false,
    assignedAt: null,
    handoffReason: "OVERDUE",
    handoffSummary: "Pediu um analista.",
    handoffAt: "2026-10-20T13:05:00.001Z",
    lastMessageAt: "2026-10-20T13:05:00.001Z",
    closedAt: null,
    messageCount: 7,
    messageLimit: 30,
    lastMessage: {
      authorType: "AGENT",
      content:
        "Encaminhei para o Suporte N2. Um analista vai falar com você em até 2 h úteis.",
      createdAt: "2026-10-20T13:05:00.000Z",
    },
    lastAgentConfidence: "HIGH",
    ticketCode: "INC-20311",
    ...overrides,
  };
}
