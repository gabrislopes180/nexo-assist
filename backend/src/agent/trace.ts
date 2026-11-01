import { z } from "zod";
import type { AgentTurnResult } from "../chat/agent-runner.js";
import type { TicketLookupResult } from "../shared/chat.js";
import { AGENT_INTENTS, type AgentAction, type AgentTrace } from "../shared/transparency.js";
import { SEARCH_MY_OPEN_TICKETS_TOOL } from "./tools/search-my-open-tickets.js";

/** O que a LLM preenche. `trace.actions` e `ticketLookup` ficam de fora: saem das execuções reais. */
export const llmDecisionSchema = z.object({
  content: z.string().min(1),
  understood: z.string().min(1),
  intent: z.enum(AGENT_INTENTS),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reason: z.string().min(1),
});

/** Campo inválido cai para undefined e recebe fallback; só sem `content` não há decisão. */
const lenientDecisionSchema = z.object({
  content: z.string().min(1),
  understood: z.string().min(1).optional().catch(undefined),
  intent: z.enum(AGENT_INTENTS).optional().catch(undefined),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().catch(undefined),
  reason: z.string().min(1).optional().catch(undefined),
});

export type LlmDecision = z.infer<typeof lenientDecisionSchema>;

export type ReplyInput = {
  decision: LlmDecision | null;
  /** Texto cru do modelo, usado só quando não veio decisão válida. */
  fallbackText: string;
  executions: readonly TicketLookupResult[];
};

function jsonFrom(text: string): unknown {
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?s*|s*```$/g, ""));
  } catch {
    return undefined;
  }
}

/** Sem o objeto validado (um campo ruim já o descarta), tenta o JSON do texto. */
export function parseDecision(object: unknown, text: string): LlmDecision | null {
  const parsed = lenientDecisionSchema.safeParse(object ?? jsonFrom(text));
  return parsed.success ? parsed.data : null;
}

const TICKET_CODE = /\b(?:INC|REQ)-\d+\b/gi;

export function citesOnlyKnownTickets(content: string, lookup: TicketLookupResult | null): boolean {
  const known = new Set(lookup?.tickets.map((ticket) => ticket.code.toUpperCase()));
  return (content.match(TICKET_CODE) ?? []).every((code) => known.has(code.toUpperCase()));
}

export function templateFor(lookup: TicketLookupResult | null): string {
  switch (lookup?.outcome) {
    case "SINGLE_MATCH": {
      const [ticket] = lookup.tickets;
      const overdue = ticket.overdue ? ", com o prazo vencido" : "";
      return `Encontrei o chamado ${ticket.code} (${ticket.title}): status ${ticket.statusLabel}${overdue}.`;
    }
    case "MULTIPLE_MATCHES":
      return `Encontrei ${lookup.totalMatches} chamados abertos${lookup.tickets.length < lookup.totalMatches ? `; estes são os ${lookup.tickets.length} mais urgentes` : ""}: ${lookup.tickets.map((ticket) => `${ticket.code} (${ticket.statusLabel})`).join(", ")}. Sobre qual deles você quer saber?`;
    case "NO_MATCH":
      return "Não encontrei nenhum chamado aberto seu com esses dados.";
    case "NO_OPEN_TICKETS":
      return "Você não tem nenhum chamado aberto no momento.";
    case "UNAVAILABLE":
      return "Não consegui consultar seus chamados agora porque o serviço está indisponível. Tente novamente em instantes.";
    default:
      return "Não consegui confirmar os dados desse chamado agora. Pode repetir a pergunta?";
  }
}

const ACTION_SUMMARY: Record<TicketLookupResult["outcome"], string> = {
  SINGLE_MATCH: "Consulta encontrou um chamado aberto.",
  MULTIPLE_MATCHES: "Consulta encontrou mais de um chamado aberto.",
  NO_MATCH: "Consulta não encontrou chamado aberto com esses critérios.",
  NO_OPEN_TICKETS: "O usuário não tem chamados abertos.",
  UNAVAILABLE: "Serviço de chamados indisponível.",
};

export function actionsFrom(executions: readonly TicketLookupResult[]): AgentAction[] {
  return executions.map(({ outcome }) => ({
    tool: SEARCH_MY_OPEN_TICKETS_TOOL,
    summary: ACTION_SUMMARY[outcome],
    status: outcome === "UNAVAILABLE" ? "ERROR" : "SUCCESS",
  }));
}

/** JSON cortado ou em bloco de código não é resposta para o usuário. */
function usablePlainText(text: string): string {
  const trimmed = text.trim();
  return /^[{[`]/.test(trimmed) ? "" : trimmed;
}

const FALLBACK_UNDERSTOOD = "Mensagem não classificada pelo modelo.";

function traceOf(decision: LlmDecision | null, lookup: TicketLookupResult | null, actions: AgentAction[]): AgentTrace {
  return {
    understood: decision?.understood ?? FALLBACK_UNDERSTOOD,
    intent: decision?.intent ?? (lookup ? "CHECK_TICKET" : "OTHER"),
    actions,
    confidence: decision?.confidence ?? "LOW",
    reason: decision?.reason ?? "O modelo não devolveu a decisão estruturada.",
  };
}

const NO_TICKET_OUTCOMES: ReadonlySet<string> = new Set(["NO_MATCH", "NO_OPEN_TICKETS"]);

/** Regras que dá para checar em código. Devolve o motivo da troca pelo template, ou null se o rascunho serve. */
function rejectionOf(draft: string, lookup: TicketLookupResult | null): string | null {
  if (lookup?.outcome === "UNAVAILABLE") return "Serviço de chamados indisponível; resposta padrão usada.";
  if (!citesOnlyKnownTickets(draft, lookup)) return "O modelo citou chamado não retornado pela consulta; resposta padrão usada.";
  if (lookup && NO_TICKET_OUTCOMES.has(lookup.outcome) && !/nenhum chamado aberto/i.test(draft)) {
    return "O modelo não confirmou a ausência de chamado aberto; resposta padrão usada.";
  }
  return null;
}

/** Null: não há resposta aproveitável, e o runner trata como agent indisponível. */
export function composeReply({ decision, fallbackText, executions }: ReplyInput): AgentTurnResult | null {
  const raw = decision ? decision.content.trim() : fallbackText.trim();
  if (raw === "") return null;

  const ticketLookup = executions.at(-1) ?? null;
  const trace = traceOf(decision, ticketLookup, actionsFrom(executions));
  const draft = decision ? raw : usablePlainText(raw);
  if (draft === "") {
    if (!ticketLookup) return null;
    return { content: templateFor(ticketLookup), trace, ticketLookup };
  }

  const rejection = rejectionOf(draft, ticketLookup);
  if (rejection === null) return { content: draft, trace, ticketLookup };
  return {
    content: templateFor(ticketLookup),
    // `understood` pode repetir o que foi rejeitado, como um chamado inventado.
    trace: { ...trace, understood: FALLBACK_UNDERSTOOD, confidence: "LOW", reason: rejection },
    ticketLookup,
  };
}
