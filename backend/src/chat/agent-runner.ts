import type { HistoryMessage } from "../conversations/conversation-service.js";
import type { ProposedTicketDraft, TicketLookupResult } from "../shared/chat.js";
import type { AgentTrace } from "../shared/transparency.js";

/** Fronteira entre o chat e o agent: a API não conhece o Mastra. */
export type AgentTurnInput = {
  conversationId: string;
  actor: { id: string; name: string };
  history: HistoryMessage[];
  message: string;
};

export type AgentTurnResult = {
  content: string;
  trace: AgentTrace;
  /** Resultado do serviço de chamados, nunca extraído do texto da LLM. */
  ticketLookup: TicketLookupResult | null;
  /** Proposta da tool, que não grava nada. O ChatService revalida o chamado, e o `completeTurn` persiste. */
  ticketDraft?: ProposedTicketDraft | null;
};

export type AgentRunner = {
  /** Falha da LLM: lança AgentUnavailableError. */
  runTurn(input: AgentTurnInput): Promise<AgentTurnResult>;
};

/** Mensagem fixa: nunca carrega o erro do provedor. */
export class AgentUnavailableError extends Error {
  constructor() {
    super("Agent indisponível");
    this.name = "AgentUnavailableError";
  }
}

/** Provisório: responde indisponível até o runner com Mastra entrar no lugar. */
export function createProvisionalAgentRunner(): AgentRunner {
  return { runTurn: () => Promise.reject(new AgentUnavailableError()) };
}
