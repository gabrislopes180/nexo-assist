import { z } from "zod";
import type { AgentTurnResult } from "../chat/agent-runner.js";
import { normalizeSearchText } from "../knowledge/search-text.js";
import type { ProposedTicketDraft, SimilarTicket, TicketLookupResult } from "../shared/chat.js";
import { AGENT_INTENTS, type AgentAction, type AgentTrace } from "../shared/transparency.js";
import { isOpen, TICKET_PRIORITY_LABEL } from "../tickets/ticket-rules.js";
import { DRAFT_COMPLEMENT_TOOL } from "./tools/draft-complement.js";
import { AFFECTED_QUESTION, AFFECTED_QUICK_REPLIES, DRAFT_TICKET_TOOL } from "./tools/draft-ticket.js";
import { SEARCH_MY_OPEN_TICKETS_TOOL } from "./tools/search-my-open-tickets.js";
import type { DraftExecution } from "./tools/turn-recorder.js";

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
  /** Mensagem atual do usuário: decide a regra de confirmação, sem depender da LLM. */
  message: string;
  decision: LlmDecision | null;
  /** Texto cru do modelo, usado só quando não veio decisão válida. */
  fallbackText: string;
  executions: readonly TicketLookupResult[];
  drafts: readonly DraftExecution[];
};

function jsonFrom(text: string): unknown {
  try {
    return JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
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

export function ticketCodesIn(text: string): string[] {
  return (text.match(TICKET_CODE) ?? []).map((code) => code.toUpperCase());
}

export function citesOnlyKnownTickets(content: string, lookup: TicketLookupResult | null): boolean {
  const known = new Set(lookup?.tickets.map((ticket) => ticket.code.toUpperCase()));
  return (content.match(TICKET_CODE) ?? []).every((code) => known.has(code.toUpperCase()));
}

export const CONFIRMATION_REPLY =
  "Mensagem de texto não confirma nada, e nada foi gravado. Se há um rascunho na tela, use o botão dele; se não, diga o código do chamado e o que quer acrescentar.";

const CONFIRMATION_WORDS: ReadonlySet<string> = new Set([
  "confirmo",
  "confirma",
  "confirmar",
  "confirme",
  "confirmado",
  "confirmada",
  "confirmei",
  "gravar",
  "grava",
  "grave",
  "salvar",
  "salva",
  "salve",
]);
const CONFIRMATION_FILLERS: ReadonlySet<string> = new Set(
  "ok okay sim certo beleza blz pode por favor pf eu ja entao isso tudo ai o a esse este complemento rascunho".split(" "),
);

/** Lista fechada de palavras: qualquer conteúdo a mais ("confirmo que o problema continua") segue o fluxo normal. */
export function isBareConfirmation(message: string): boolean {
  const words = normalizeSearchText(message).match(/[\p{L}\p{N}]+/gu) ?? [];
  return words.some((word) => CONFIRMATION_WORDS.has(word)) && words.every((word) => CONFIRMATION_WORDS.has(word) || CONFIRMATION_FILLERS.has(word));
}

const FALSE_ACTION =
  /(?<!\p{L})(?:complementei|adicionei|acrescentei|incluí|registrei|atualizei|gravei|anotei|salvei|alterei|editei|preparei\s+o\s+(?:complemento|rascunho)|complemento\s+(?:já\s+)?(?:foi|está)\s+\p{L}+|criei|abri\s+(?:o|um|seu|novo)\s+(?:novo\s+)?chamado|chamado\s+(?:já\s+)?foi\s+criado(?!\s+em(?!\p{L}))|confirme|confirma(?!\p{L})[^.!?\n]*\?)(?!\p{L})/giu;
const NEGATION = /(?<!\p{L})(?:não|nao|nunca|nem)(?!\p{L})/iu;

/** Só a oração da afirmação conta: "não atualizei o título, mas adicionei" ainda afirma uma ação. */
function isNegated(text: string, index: number): boolean {
  const clause = text.slice(0, index).split(/[.!?;:,\n]/).at(-1) ?? "";
  return NEGATION.test(clause);
}

/** O agent nunca grava; sem proposta no turno, não pode dizer que agiu nem pedir confirmação. */
export function claimsFalseAction(content: string): boolean {
  return [...content.matchAll(FALSE_ACTION)].some((match) => !isNegated(content, match.index));
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

function draftAction(execution: DraftExecution): AgentAction {
  switch (execution.outcome) {
    case "DRAFTED":
      return execution.proposal.kind === "CREATE"
        ? { tool: DRAFT_TICKET_TOOL, summary: "Rascunho de chamado preparado; nada foi criado.", status: "SUCCESS" }
        : { tool: DRAFT_COMPLEMENT_TOOL, summary: "Rascunho de complemento preparado; nada foi gravado.", status: "SUCCESS" };
    case "TICKET_NOT_AVAILABLE":
      return { tool: DRAFT_COMPLEMENT_TOOL, summary: "Chamado indisponível para complemento; nenhum rascunho criado.", status: "SKIPPED" };
    case "SERVICE_UNAVAILABLE":
      return { tool: DRAFT_COMPLEMENT_TOOL, summary: "Serviço de chamados indisponível; nenhum rascunho criado.", status: "ERROR" };
    case "NEEDS_AFFECTED_SCOPE":
      return { tool: DRAFT_TICKET_TOOL, summary: "Falta saber quem é afetado; nenhum rascunho criado.", status: "SKIPPED" };
    case "POSSIBLE_DUPLICATE":
      return { tool: DRAFT_TICKET_TOOL, summary: "Há chamado parecido; nenhum rascunho criado.", status: "SKIPPED" };
    case "UNAVAILABLE":
      return { tool: DRAFT_TICKET_TOOL, summary: "Serviço de chamados indisponível; nenhum rascunho criado.", status: "ERROR" };
  }
}

export function actionsFrom(executions: readonly TicketLookupResult[], drafts: readonly DraftExecution[] = []): AgentAction[] {
  return [
    ...executions.map(({ outcome }): AgentAction => ({
      tool: SEARCH_MY_OPEN_TICKETS_TOOL,
      summary: ACTION_SUMMARY[outcome],
      status: outcome === "UNAVAILABLE" ? "ERROR" : "SUCCESS",
    })),
    ...drafts.map(draftAction),
  ];
}

/** JSON cortado ou em bloco de código não é resposta para o usuário. */
function usablePlainText(text: string): string {
  const trimmed = text.trim();
  return /^[{[`]/.test(trimmed) ? "" : trimmed;
}

const FALLBACK_UNDERSTOOD = "Mensagem não classificada pelo modelo.";
const OUT_OF_SCOPE_REPLY = "Só consigo ajudar com suporte de TI e chamados.";

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

const FALSE_ACTION_REPLY =
  "Nada foi alterado nem criado. Para abrir um chamado, conte o que aconteceu; para complementar, diga o código e o que quer acrescentar. A confirmação é feita pelo botão na tela.";
const DRAFT_FAILURE: Record<"TICKET_NOT_AVAILABLE" | "SERVICE_UNAVAILABLE", { content: string; reason: string }> = {
  TICKET_NOT_AVAILABLE: {
    content: "Não consegui preparar o complemento: esse chamado não está entre os seus chamados abertos. Reabrir chamado ainda não é possível por aqui.",
    reason: "Chamado indisponível para complemento; resposta padrão usada.",
  },
  SERVICE_UNAVAILABLE: {
    content: "Não consegui preparar o complemento agora porque o serviço de chamados está indisponível. Tente novamente em instantes.",
    reason: "Serviço de chamados indisponível; resposta padrão usada.",
  },
};

type Rejection = { reason: string; content: string };

/** Regras que dá para checar em código. Devolve a troca a fazer, ou null se o rascunho serve. */
function rejectionOf(draft: string, lookup: TicketLookupResult | null): Rejection | null {
  const withTemplate = (reason: string): Rejection => ({ reason, content: templateFor(lookup) });
  if (lookup?.outcome === "UNAVAILABLE") return withTemplate("Serviço de chamados indisponível; resposta padrão usada.");
  if (!citesOnlyKnownTickets(draft, lookup)) return withTemplate("O modelo citou chamado não retornado pela consulta; resposta padrão usada.");
  if (claimsFalseAction(draft)) return { reason: "O modelo afirmou uma ação que não aconteceu; resposta padrão usada.", content: FALSE_ACTION_REPLY };
  if (lookup && NO_TICKET_OUTCOMES.has(lookup.outcome) && !/nenhum chamado aberto/i.test(draft)) {
    return withTemplate("O modelo não confirmou a ausência de chamado aberto; resposta padrão usada.");
  }
  return null;
}

function lastProposal(drafts: readonly DraftExecution[]): ProposedTicketDraft | null {
  return drafts.flatMap((execution) => (execution.outcome === "DRAFTED" ? [execution.proposal] : [])).at(-1) ?? null;
}

function proposalText(proposal: ProposedTicketDraft): string {
  if (proposal.kind === "COMPLEMENT") return `Preparei o complemento do ${proposal.ticket.code}. Confira e confirme.`;
  const label = TICKET_PRIORITY_LABEL[proposal.priority];
  const reason = proposal.priorityReason.trim().replace(/[.!\s]+$/, "");
  const safe = reason !== "" && citesOnlyKnownTickets(reason, null) && !claimsFalseAction(reason);
  return safe ? `Coloquei prioridade ${label}: ${reason}. Confira antes de eu criar:` : `Coloquei prioridade ${label}. Confira antes de eu criar:`;
}

function similarLine({ code, title, statusLabel }: SimilarTicket): string {
  return `${code} (${title}, ${statusLabel})`;
}

function duplicateText(similar: readonly SimilarTicket[]): string {
  const open = similar.filter(isOpen);
  const closed = similar.filter((ticket) => !isOpen(ticket));
  const closedText = closed.length > 0 ? `Encontrei chamado parecido já resolvido: ${closed.map(similarLine).join(", ")}. Reabrir ainda não é possível por aqui.` : "";
  if (open.length === 0) return `${closedText} Quer abrir um novo chamado?`;
  const openText = `Já existe chamado aberto parecido: ${open.map(similarLine).join(", ")}.`;
  return [openText, closedText, "Quer complementar esse chamado ou abrir um novo?"].filter(Boolean).join(" ");
}

/** Bloqueios do `draftTicket`: a resposta vem do código, com os dados do serviço. */
function createBlock(execution: DraftExecution | undefined): { content: string; reason: string; quickReplies: string[] | null } | null {
  switch (execution?.outcome) {
    case "NEEDS_AFFECTED_SCOPE":
      return { content: AFFECTED_QUESTION, reason: "Falta saber quem é afetado para preparar o rascunho.", quickReplies: AFFECTED_QUICK_REPLIES };
    case "POSSIBLE_DUPLICATE":
      return { content: duplicateText(execution.similar), reason: "Há chamado parecido; o usuário decide antes de abrir outro.", quickReplies: null };
    case "UNAVAILABLE":
      return {
        content: "Não consegui preparar o chamado agora porque o serviço de chamados está indisponível. Tente novamente em instantes.",
        reason: "Serviço de chamados indisponível; resposta padrão usada.",
        quickReplies: null,
      };
    default:
      return null;
  }
}

/** Null: não há resposta aproveitável, e o runner trata como agent indisponível. */
export function composeReply({ message, decision, fallbackText, executions, drafts }: ReplyInput): AgentTurnResult | null {
  const lastExecution = executions.at(-1) ?? null;
  if (isBareConfirmation(message)) {
    // A instrução não impede o modelo de chamar a tool: o que rodou fica no trace, mas não vira seletor nem proposta.
    return {
      content: CONFIRMATION_REPLY,
      trace: {
        understood: "O usuário tentou confirmar por mensagem.",
        intent: "COMPLEMENT",
        actions: actionsFrom(executions, drafts),
        confidence: "HIGH",
        reason: "Confirmação só vale pelo botão; resultados de tools do turno não foram usados.",
      },
      ticketLookup: null,
      ticketDraft: null,
    };
  }

  const outOfScope = decision?.intent === "OUT_OF_SCOPE";
  // Fora de escopo, a consulta fica só no trace: o modelo às vezes chama a tool e a tela mostraria o seletor.
  const ticketLookup = outOfScope ? null : lastExecution;
  const trace = traceOf(decision, lastExecution, actionsFrom(executions, drafts));

  // Vale a última execução: um bloqueio depois de uma proposta a cancela.
  const block = outOfScope ? null : createBlock(drafts.at(-1));
  if (block) {
    const blockTrace: AgentTrace = { ...trace, intent: "OPEN_TICKET", reason: block.reason };
    return { content: block.content, trace: blockTrace, ticketLookup, ticketDraft: null, quickReplies: block.quickReplies };
  }

  // A proposta é real: o texto vem do código, para nunca prometer mais do que ela.
  const proposal = outOfScope ? null : lastProposal(drafts);
  if (proposal) {
    const intent = proposal.kind === "CREATE" ? "OPEN_TICKET" : "COMPLEMENT";
    return { content: proposalText(proposal), trace: { ...trace, intent }, ticketLookup, ticketDraft: proposal };
  }

  const raw = decision ? decision.content.trim() : fallbackText.trim();
  if (raw === "") return null;

  const failedDraft = outOfScope ? undefined : drafts.at(-1);
  if (failedDraft?.outcome === "TICKET_NOT_AVAILABLE" || failedDraft?.outcome === "SERVICE_UNAVAILABLE") {
    const { content, reason } = DRAFT_FAILURE[failedDraft.outcome];
    return { content, trace: { ...trace, confidence: "LOW", reason }, ticketLookup, ticketDraft: null };
  }

  const draft = decision ? raw : usablePlainText(raw);
  if (draft === "") {
    if (!ticketLookup) return null;
    return { content: templateFor(ticketLookup), trace, ticketLookup, ticketDraft: null };
  }

  const rejection = rejectionOf(draft, ticketLookup);
  if (rejection === null) return { content: draft, trace, ticketLookup, ticketDraft: null };
  return {
    content: outOfScope ? OUT_OF_SCOPE_REPLY : rejection.content,
    // `understood` pode repetir o que foi rejeitado, como um chamado inventado.
    trace: { ...trace, understood: FALLBACK_UNDERSTOOD, confidence: "LOW", reason: rejection.reason },
    ticketLookup,
    ticketDraft: null,
  };
}
