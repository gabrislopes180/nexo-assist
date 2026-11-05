import { z } from "zod";
import type { AgentTurnResult } from "../chat/agent-runner.js";
import { REDIRECT_AREAS, redirectReply, redirectSummary, type RedirectArea } from "../knowledge/redirect-targets.js";
import { normalizeSearchText } from "../knowledge/search-text.js";
import type { ProposedTicketDraft, SimilarTicket, TicketLookupResult } from "../shared/chat.js";
import type { HelpArticle, HelpCenterSearchResult } from "../shared/knowledge.js";
import { AGENT_INTENTS, type AgentAction, type AgentTrace } from "../shared/transparency.js";
import { isOpen, TICKET_PRIORITY_LABEL } from "../tickets/ticket-rules.js";
import { DRAFT_COMPLEMENT_TOOL } from "./tools/draft-complement.js";
import { AFFECTED_QUESTION, AFFECTED_QUICK_REPLIES, DRAFT_TICKET_TOOL } from "./tools/draft-ticket.js";
import { SEARCH_HELP_CENTER_TOOL } from "./tools/search-help-center.js";
import { SEARCH_MY_OPEN_TICKETS_TOOL } from "./tools/search-my-open-tickets.js";
import { DRAFT_REOPEN_TOOL } from "./tools/draft-reopen.js";
import { isBareConfirmation } from "./confirmation.js";
import { declinesPerson } from "./tools/handoff-intent.js";
import { TRANSFER_TO_ANALYST_TOOL } from "./tools/transfer-to-analyst.js";
import type { DraftExecution, HandoffExecution, ReopenBlock } from "./tools/turn-recorder.js";

/** O que a LLM preenche. `trace.actions` e `ticketLookup` ficam de fora: saem das execuções reais. */
export const llmDecisionSchema = z.object({
  content: z.string().min(1),
  understood: z.string().min(1),
  intent: z.enum(AGENT_INTENTS),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  reason: z.string().min(1),
  /** Só com OUT_OF_SCOPE: a área para onde encaminhar. O texto e o contato saem do código. */
  redirectTo: z.enum(REDIRECT_AREAS).nullable().optional(),
  /** Slug do artigo em que a resposta se baseou. O código só aceita slug devolvido por searchHelpCenter neste turno. */
  articleSlug: z.string().nullable().optional(),
  /** Resposta direta sobre aplicabilidade, separada da proposta que o código renderiza. */
  articleAnswer: z.string().max(600).nullable().optional(),
});

/** Campo inválido cai para undefined e recebe fallback; só sem `content` não há decisão. */
const lenientDecisionSchema = z.object({
  content: z.string().min(1),
  understood: z.string().min(1).optional().catch(undefined),
  intent: z.enum(AGENT_INTENTS).optional().catch(undefined),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]).optional().catch(undefined),
  reason: z.string().min(1).optional().catch(undefined),
  redirectTo: z.enum(REDIRECT_AREAS).nullable().optional().catch(undefined),
  // Sem regex aqui: slug fora do formato chega a `withCitation` e é descartado com motivo no trace.
  articleSlug: z.string().max(200).nullable().optional().catch(undefined),
  articleAnswer: z.string().max(600).nullable().optional().catch(undefined),
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
  handoffs?: readonly HandoffExecution[];
  /** Buscas na central de ajuda do turno: a citação só vale para artigo daqui. */
  articleSearches?: readonly HelpCenterSearchResult[];
  /** A última resposta do agent ofereceu analista: "Sim, confirmo" responde à oferta, não a um rascunho. */
  overdueOfferActive?: boolean;
  /** O usuário recusou analista nesta mensagem ou na troca anterior: sem nova oferta. */
  suppressOverdueOffer?: boolean;
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

export { isBareConfirmation };

const DONE = "(?:aberto|aberta|reaberto|reaberta|registrado|registrada|criado|criada|enviado|enviada|gravado|gravada|salvo|salva)";
/**
 * Dado do chamado, não ação do agent: "foi criado em 28/10", "aberto há 3 dias", "reaberto pela analista",
 * "chamado reaberto INC-12 está em andamento".
 */
const NOT_A_DATE = "(?!\\s+(?:em|há|pel[oa]s?|ontem|hoje|no\\s+dia|está|que|(?:INC|REQ)-\\d+)(?![\\p{L}\\d]))";
const FALSE_ACTION = new RegExp(
  [
    "complementei|adicionei|acrescentei|incluí|registrei|atualizei|gravei|anotei|salvei|alterei|editei|criei|enviei|encaminhei|reabri|transferi",
    "vou\\s+(?:te\\s+|lhe\\s+)?(?:transferir|encaminhar|chamar\\s+(?:um|o|a|uma)\\s+analista)",
    // Só a conversa ou a própria pessoa: "o INC-7 foi transferido para a fila de Redes" é dado do chamado.
    "conversa\\s+(?:já\\s+)?(?:foi\\s+)?transferida",
    "(?:te|você|voce)\\s+(?:já\\s+)?(?:foi\\s+)?transferid[oa]",
    "^\\s*transferid[oa]",
    "chamei\\s+(?:um|o|a|uma)\\s+analista",
    "conversa\\s+(?:já\\s+)?foi\\s+transferida",
    "analista\\s+(?:já\\s+)?(?:foi|está\\s+sendo)\\s+(?:acionad|chamad|avisad)[oa]",
    "preparei\\s+o\\s+(?:complemento|rascunho)",
    "abri\\s+(?:o|um|seu|novo)\\s+(?:novo\\s+)?chamado",
    "complemento\\s+(?:já\\s+)?(?:foi|está)\\s+\\p{L}+",
    `(?:chamado|pedido)\\s+(?:já\\s+)?(?:foi|ficou)\\s+${DONE}${NOT_A_DATE}`,
    `(?:chamado|pedido)\\s+(?:registrado|registrada|criado|criada|gravado|gravada|reaberto|reaberta)${NOT_A_DATE}`,
    "(?:já\\s+)?está\\s+(?:registrado|registrada|gravado|gravada|salvo|salva)",
    `(?:já\\s+)?foi\\s+(?:reaberto|reaberta)${NOT_A_DATE}`,
    // Pedir confirmação por texto: a confirmação só existe no botão.
    "confira\\s+e\\s+confirme",
    "confirm(?:e|a)\\s+(?:o\\s+|a\\s+|esse\\s+|este\\s+|essa\\s+|esta\\s+)?(?:complemento|rascunho|abertura|criação|novo\\s+chamado)",
    "confirma\\s*\\?",
    "posso\\s+(?:criar|abrir|gravar|registrar|salvar)[^.!?\\n]*\\?",
  ]
    .map((pattern) => `(?:${pattern})`)
    .join("|")
    .replace(/^/, "(?<!\\p{L})(?:")
    .concat(")(?!\\p{L})"),
  "giu",
);
/** Negação colada à afirmação: "não atualizei", "ainda não o registrei". Uma negação distante não protege. */
const NEGATION_BEFORE = /(?<!\p{L})(?:não|nao|nunca|nem)\s+(?:\p{L}+\s+)?$/iu;

function isNegated(text: string, index: number): boolean {
  return NEGATION_BEFORE.test(text.slice(0, index));
}

/** O agent nunca grava; sem proposta no turno, não pode dizer que agiu nem pedir confirmação. */
export function claimsFalseAction(content: string): boolean {
  return [...content.matchAll(FALSE_ACTION)].some((match) => !isNegated(content, match.index));
}

/** Chamado em WAITING_EMPLOYEE: o prazo está pausado, então nenhum prazo é citado. */
export const WAITING_EMPLOYEE_NOTE = "O analista está aguardando a sua resposta, e o prazo fica pausado até lá.";
const PAUSE_NOTE = "O prazo fica pausado até lá.";
/** "pausado", "em pausa", "suspenso". "Parado" não conta: pode ser só o chamado parado. */
const MENTIONS_PAUSE = /(?<!\p{L})(?:paus(?:a|ad[oa])|suspens\p{L}*)(?!\p{L})/iu;
/** "aguarda a sua resposta", "aguardando seu retorno", "aguardando você": o modelo já disse metade do aviso. */
const MENTIONS_WAITING = /aguard\p{L}*\s+(?:(?:a\s+|o\s+)?(?:sua\s+|seu\s+)?(?:resposta|retorno)|voc[eê])(?!\p{L})/iu;
/** Com o prazo pausado não há prazo a citar: data ou "vence" no texto do modelo é invenção. */
const CITES_DEADLINE = /\d{1,2}\/\d{1,2}|(?<!\p{L})venc\p{L}*/iu;

function waitingOnEmployee(lookup: TicketLookupResult | null): boolean {
  return lookup?.outcome === "SINGLE_MATCH" && lookup.tickets[0].status === "WAITING_EMPLOYEE";
}

export function templateFor(lookup: TicketLookupResult | null): string {
  switch (lookup?.outcome) {
    case "SINGLE_MATCH": {
      const [ticket] = lookup.tickets;
      const overdue = ticket.overdue ? ", com o prazo vencido" : "";
      const found = `Encontrei o chamado ${ticket.code} (${ticket.title}): status ${ticket.statusLabel}${overdue}.`;
      return waitingOnEmployee(lookup) ? `${found} ${WAITING_EMPLOYEE_NOTE}` : found;
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

const REOPEN_BLOCK_SUMMARY: Record<ReopenBlock["kind"], string> = {
  STILL_OPEN: "Chamado ainda aberto; nenhum rascunho de reabertura criado.",
  WINDOW_EXPIRED: "Chamado resolvido há mais de 7 dias; nenhum rascunho de reabertura criado.",
  MULTIPLE: "Mais de um chamado reabrível; nenhum rascunho criado.",
  NEEDS_REASON: "Falta o que voltou a falhar; nenhum rascunho criado.",
  NOT_FOUND: "Nenhum chamado reabrível encontrado; nenhum rascunho criado.",
  UNAVAILABLE: "Serviço de chamados indisponível; nenhum rascunho criado.",
};

function draftAction(execution: DraftExecution): AgentAction {
  switch (execution.outcome) {
    case "DRAFTED":
      if (execution.proposal.kind === "CREATE") return { tool: DRAFT_TICKET_TOOL, summary: "Rascunho de chamado preparado; nada foi criado.", status: "SUCCESS" };
      if (execution.proposal.kind === "REOPEN") return { tool: DRAFT_REOPEN_TOOL, summary: "Rascunho de reabertura preparado; nada foi reaberto.", status: "SUCCESS" };
      return { tool: DRAFT_COMPLEMENT_TOOL, summary: "Rascunho de complemento preparado; nada foi gravado.", status: "SUCCESS" };
    case "REOPEN_BLOCKED":
      return {
        tool: DRAFT_REOPEN_TOOL,
        summary: REOPEN_BLOCK_SUMMARY[execution.block.kind],
        status: execution.block.kind === "UNAVAILABLE" ? "ERROR" : "SKIPPED",
      };
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

const HANDOFF_ACCEPTED_SUMMARY = "Transferência para analista proposta; o backend move a conversa ao gravar.";
const HANDOFF_DROPPED_SUMMARY = "Transferência descartada: mensagem fora de escopo; a conversa continua com o agent.";

/** `dropped`: a proposta era válida, mas o turno a descartou (fora de escopo). Nunca aparece como SUCCESS. */
function handoffAction(execution: HandoffExecution, dropped: boolean): AgentAction {
  if (execution.outcome === "REJECTED") return { tool: TRANSFER_TO_ANALYST_TOOL, summary: HANDOFF_REJECTION_REASON[execution.problem], status: "SKIPPED" };
  return dropped
    ? { tool: TRANSFER_TO_ANALYST_TOOL, summary: HANDOFF_DROPPED_SUMMARY, status: "SKIPPED" }
    : { tool: TRANSFER_TO_ANALYST_TOOL, summary: HANDOFF_ACCEPTED_SUMMARY, status: "SUCCESS" };
}

export function actionsFrom(
  executions: readonly TicketLookupResult[],
  drafts: readonly DraftExecution[] = [],
  handoffs: readonly HandoffExecution[] = [],
  handoffDropped = false,
): AgentAction[] {
  return [
    ...executions.map(({ outcome }): AgentAction => ({
      tool: SEARCH_MY_OPEN_TICKETS_TOOL,
      summary: ACTION_SUMMARY[outcome],
      status: outcome === "UNAVAILABLE" ? "ERROR" : "SUCCESS",
    })),
    ...drafts.map(draftAction),
    ...handoffs.map((execution) => handoffAction(execution, handoffDropped)),
  ];
}

function articleSearchAction(result: HelpCenterSearchResult): AgentAction {
  switch (result.outcome) {
    case "FOUND": {
      const count = result.articles.length;
      const titles = result.articles.map(({ title }) => title).join("; ");
      const found = count === 1 ? "1 artigo encontrado" : `${count} artigos encontrados`;
      return { tool: SEARCH_HELP_CENTER_TOOL, summary: `Central de ajuda: ${found} (${titles}).`, status: "SUCCESS" };
    }
    case "NO_MATCH":
      return { tool: SEARCH_HELP_CENTER_TOOL, summary: "Central de ajuda: nenhum artigo.", status: "SUCCESS" };
    case "UNAVAILABLE":
      return { tool: SEARCH_HELP_CENTER_TOOL, summary: "Central de ajuda indisponível.", status: "ERROR" };
  }
}

/** Buscas na central primeiro (vêm antes de abrir chamado), depois as demais execuções. */
function turnActions({ executions, drafts, handoffs = [], articleSearches = [] }: ReplyInput, handoffDropped = false): AgentAction[] {
  return [...articleSearches.map(articleSearchAction), ...actionsFrom(executions, drafts, handoffs, handoffDropped)];
}

export const HELP_QUICK_REPLIES = ["Resolveu, obrigado", "Não resolveu, abrir chamado"];
export const CITE_ARTICLE_TOOL = "citeArticle";
const CITATION_DROPPED_SUMMARY = "Citação descartada: o artigo não veio da busca deste turno.";
const CITATION_CONFLICT_SUMMARY = "Citação descartada: a resposta já tem outra pergunta com respostas rápidas.";

/**
 * Nota de fonte que o código acrescenta à resposta citada. Fica no texto porque o histórico do turno
 * seguinte só tem o texto: é por ela que "Não resolveu" sabe qual artigo foi tentado.
 */
export function articleNote(title: string): string {
  return `Fonte: ${title} (central de ajuda).`;
}

const ARTICLE_NOTE = /(?:^|\s)Fonte: (.{1,200}?) \(central de ajuda\)\.$/u;
const ANY_ARTICLE_NOTE = /\s*Fonte:[^\n]*?\(central de ajuda\)\.?/giu;

/** Título da nota de fonte no fim de uma resposta do agent, ou null. */
export function citedArticleIn(content: string): string | null {
  return ARTICLE_NOTE.exec(content.trim())?.[1] ?? null;
}

function withoutArticleNote(content: string): string {
  return content.replace(ANY_ARTICLE_NOTE, "").trim();
}

const NOT_RESOLVED = /(?<!\p{L})nao\s+(?:resolveu|funcionou|deu\s+certo|ajudou|adiantou)(?!\p{L})/u;

/**
 * Título do artigo que o usuário disse não ter resolvido, enquanto a abertura do chamado segue
 * (pergunta de afetados, aviso de parecido). Some com outra resposta ou depois da proposta.
 */
export function triedArticleFrom(history: readonly { authorType: string; content: string }[], message: string): string | null {
  let cited: string | null = null;
  let tried: string | null = null;
  for (const { authorType, content } of [...history, { authorType: "EMPLOYEE", content: message }]) {
    if (authorType === "EMPLOYEE") {
      if (cited && NOT_RESOLVED.test(normalizeSearchText(content))) tried = cited;
      cited = null;
    } else if (authorType === "AGENT") {
      cited = citedArticleIn(content);
      const isCreationStep = content === AFFECTED_QUESTION || codesShownAsDuplicates([content]).length > 0;
      if (cited || !isCreationStep || content.includes(CREATE_PROPOSAL_NOTICE)) tried = null;
    } else {
      cited = null;
      tried = null;
    }
  }
  return tried;
}

function foundArticles(searches: readonly HelpCenterSearchResult[]): HelpArticle[] {
  return searches.flatMap((result) => (result.outcome === "FOUND" ? result.articles : []));
}

/** Só no texto livre aceito: slug devolvido pela busca do turno vira fonte, nota e respostas rápidas. */
function withCitation(reply: AgentTurnResult, slug: string | null | undefined, searches: readonly HelpCenterSearchResult[]): AgentTurnResult {
  const content = withoutArticleNote(reply.content);
  // Só a nota forjada, sem resposta: nada do modelo vai para a tela.
  if (content === "") {
    return { ...reply, content: templateFor(reply.ticketLookup), trace: { ...reply.trace, confidence: "LOW", reason: "O modelo respondeu só com uma nota de fonte; resposta padrão usada." }, quickReplies: null };
  }
  if (!slug) return { ...reply, content };
  const skip = (summary: string): AgentTurnResult => ({
    ...reply,
    content,
    trace: { ...reply.trace, actions: [...reply.trace.actions, { tool: CITE_ARTICLE_TOOL, summary, status: "SKIPPED" }] },
  });
  const article = foundArticles(searches).find((candidate) => candidate.slug === slug);
  if (!article) return skip(CITATION_DROPPED_SUMMARY);
  if (reply.quickReplies) return skip(CITATION_CONFLICT_SUMMARY);
  return {
    ...reply,
    content: `${content} ${articleNote(article.title)}`,
    trace: { ...reply.trace, sources: [{ kind: "ARTICLE", slug: article.slug, title: article.title }] },
    quickReplies: HELP_QUICK_REPLIES,
  };
}

/** JSON cortado ou em bloco de código não é resposta para o usuário. */
function usablePlainText(text: string): string {
  const trimmed = text.trim();
  return /^[{[`]/.test(trimmed) ? "" : trimmed;
}

const FALLBACK_UNDERSTOOD = "Mensagem não classificada pelo modelo.";
export const OUT_OF_SCOPE_REPLY = "Só consigo ajudar com suporte de TI e chamados.";
export const OUT_OF_SCOPE_REDIRECT_TOOL = "outOfScopeRedirect";

/**
 * Fora de escopo, a resposta nunca é do modelo: ele só escolhe a área, e o código escreve o canal.
 * Consulta, rascunho e transferência do turno ficam só no trace.
 */
function outOfScopeReply(decision: LlmDecision, input: ReplyInput): AgentTurnResult {
  const area: RedirectArea | null = decision.redirectTo ?? null;
  const actions = turnActions(input, true);
  if (area) actions.push({ tool: OUT_OF_SCOPE_REDIRECT_TOOL, summary: redirectSummary(area), status: "SUCCESS" });
  const trace = traceOf(decision, null, actions);
  // `understood` e `reason` são do modelo e aparecem na tela: se o texto dele seria barrado, eles também não servem.
  const rejection = rejectionOf(decision.content, null);
  return {
    content: area ? redirectReply(area) : OUT_OF_SCOPE_REPLY,
    trace: rejection ? { ...trace, understood: FALLBACK_UNDERSTOOD, confidence: "LOW", reason: rejection.reason } : trace,
    ticketLookup: null,
    ticketDraft: null,
    quickReplies: null,
  };
}

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
  "Nada foi alterado, criado nem transferido. Para abrir um chamado, conte o que aconteceu; para complementar, diga o código e o que quer acrescentar. A confirmação é feita pelo botão na tela.";
const DRAFT_FAILURE: Record<"TICKET_NOT_AVAILABLE" | "SERVICE_UNAVAILABLE", { content: string; reason: string }> = {
  TICKET_NOT_AVAILABLE: {
    content: "Não consegui preparar o complemento: esse chamado não está entre os seus chamados abertos. Se o problema voltou num chamado encerrado, me diga o código que eu vejo se dá para reabrir.",
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

/** Motivo longo tende a trazer fato novo; curto e sem citação ou falsa ação, vai na tela. */
const MAX_SHOWN_REASON = 120;

function proposalText(proposal: ProposedTicketDraft): string {
  if (proposal.kind === "COMPLEMENT") return `Preparei o complemento do ${proposal.ticket.code}. Confira e confirme.`;
  if (proposal.kind === "REOPEN") return `Preparei a reabertura do ${proposal.ticket.code}. Confira e confirme.`;
  const label = TICKET_PRIORITY_LABEL[proposal.priority];
  const reason = proposal.priorityReason.trim().replace(/[.!\s]+$/, "");
  const safe = reason !== "" && reason.length <= MAX_SHOWN_REASON && citesOnlyKnownTickets(reason, null) && !claimsFalseAction(reason);
  return safe ? `Coloquei prioridade ${label}: ${reason}. Confira antes de eu criar:` : `Coloquei prioridade ${label}. Confira antes de eu criar:`;
}

function similarLine({ code, title, statusLabel }: SimilarTicket): string {
  return `${code} (${title}, ${statusLabel})`;
}

/** Os avisos de parecido sempre têm esta palavra: o runner usa isso para saber quais códigos foram mostrados como parecidos. */
export const DUPLICATE_NOTICE_MARKER = "parecido";

export function codesShownAsDuplicates(agentMessages: readonly string[]): string[] {
  return agentMessages.filter((content) => content.includes(`chamado aberto ${DUPLICATE_NOTICE_MARKER}:`) || content.includes(`chamado ${DUPLICATE_NOTICE_MARKER} já resolvido:`)).flatMap(ticketCodesIn);
}

function duplicateText(similar: readonly SimilarTicket[]): string {
  const open = similar.filter(isOpen);
  const closed = similar.filter((ticket) => !isOpen(ticket));
  // `findSimilarTickets` só devolve resolvidos ainda dentro da janela de reabertura.
  const closedText = closed.length > 0 ? `Encontrei chamado ${DUPLICATE_NOTICE_MARKER} já resolvido: ${closed.map(similarLine).join(", ")}.` : "";
  const options = [open.length > 0 ? "complementar o aberto" : "", closed.length > 0 ? "reabrir o resolvido" : "", "abrir um novo"].filter(Boolean);
  const question = `Quer ${options.slice(0, -1).join(", ")} ou ${options.at(-1) ?? "abrir um novo"}?`;
  const openText = open.length > 0 ? `Já existe chamado aberto ${DUPLICATE_NOTICE_MARKER}: ${open.map(similarLine).join(", ")}.` : "";
  return [openText, closedText, question].filter(Boolean).join(" ");
}

export function windowExpiredText(code: string): string {
  return `O ${code} foi resolvido há mais de 7 dias e não pode mais ser reaberto. Quer que eu prepare um chamado novo relacionado a ele?`;
}

const WINDOW_EXPIRED_NOTICE = /^O ((?:INC|REQ)-\d+) foi resolvido há mais de 7 dias e não pode mais ser reaberto\./;
const CREATE_PROPOSAL_NOTICE = "Confira antes de eu criar:";

/**
 * Código do último aviso de reabertura fora da janela, se nenhuma proposta de criação veio depois.
 * A relação é garantida em código: o chamado novo leva "Relacionado ao <código>" mesmo se o modelo esquecer.
 */
export function relatedCodeFrom(agentMessages: readonly string[]): string | null {
  let related: string | null = null;
  for (const content of agentMessages) {
    const expired = WINDOW_EXPIRED_NOTICE.exec(content);
    // Só as etapas da própria abertura mantêm a relação; qualquer outra resposta encerra o assunto.
    const isCreationStep = content === AFFECTED_QUESTION || codesShownAsDuplicates([content]).length > 0;
    if (expired?.[1]) related = content.includes(CREATE_PROPOSAL_NOTICE) ? null : expired[1];
    else if (!isCreationStep || content.includes(CREATE_PROPOSAL_NOTICE)) related = null;
  }
  return related;
}

function reopenBlockText(block: ReopenBlock): string {
  switch (block.kind) {
    case "STILL_OPEN":
      return `O ${block.ticket.code} ainda está aberto (${block.ticket.statusLabel}), então não precisa reabrir. Quer complementar esse chamado com o que voltou a acontecer?`;
    case "WINDOW_EXPIRED":
      return windowExpiredText(block.ticket.code);
    case "MULTIPLE":
      return `Encontrei mais de um chamado resolvido que pode ser reaberto: ${block.tickets.map(({ code, title }) => `${code} (${title})`).join(", ")}. Qual deles voltou a dar problema?`;
    case "NEEDS_REASON":
      return `O que voltou a falhar no ${block.ticket.code}?`;
    case "NOT_FOUND":
      return "Não encontrei um chamado seu resolvido que possa ser reaberto com esses dados. Se quiser, conte o que está acontecendo e eu preparo um chamado novo.";
    case "UNAVAILABLE":
      return "Não consegui preparar a reabertura agora porque o serviço de chamados está indisponível. Tente novamente em instantes.";
  }
}

/** Bloqueios de `draftTicket` e `draftReopen`: a resposta vem do código, com os dados do serviço. */
function createBlock(execution: DraftExecution | undefined): { content: string; reason: string; quickReplies: string[] | null; intent: AgentTrace["intent"] } | null {
  if (execution?.outcome === "REOPEN_BLOCKED") {
    return { content: reopenBlockText(execution.block), reason: REOPEN_BLOCK_SUMMARY[execution.block.kind], quickReplies: null, intent: "REOPEN" };
  }
  const block = createTicketBlock(execution);
  return block && { ...block, intent: "OPEN_TICKET" };
}

function createTicketBlock(execution: DraftExecution | undefined): { content: string; reason: string; quickReplies: string[] | null } | null {
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

const HANDOFF_REPLY = "Transferi a conversa para um analista. Ele vai continuar o atendimento por aqui.";
const HANDOFF_REJECTED_REPLY = "Não transferi a conversa. Posso continuar te ajudando por aqui; se quiser falar com um analista, é só pedir.";
const HANDOFF_REJECTION_REASON: Record<Extract<HandoffExecution, { outcome: "REJECTED" }>["problem"], string> = {
  OVERDUE_NOT_ACCEPTED: "Transferência por prazo vencido sem oferta aceita; a conversa continua com o agent.",
  OFFER_DECLINED: "O usuário recusou a oferta de analista; a conversa continua com o agent.",
  DECLINED: "O usuário disse que não quer falar com analista; a conversa continua com o agent.",
  NOT_REQUESTED: "Transferência recusada: o usuário não pediu analista; a conversa continua com o agent.",
  UNKNOWN_TICKET_CODE: "Resumo citou chamado não devolvido pelas ferramentas; a conversa continua com o agent.",
  UNAVAILABLE: "Transferência inválida; a conversa continua com o agent.",
};

export const OVERDUE_QUICK_REPLIES = ["Falar com um analista", "Não, obrigado"];
const OVERDUE_QUESTION = "Quer que eu chame um analista?";

/** Oferta da tela 03. O código vai no texto quando o modelo não o citou: é por ele que a aceitação é validada. */
export function overdueOfferText(code: string, alreadyCited = false): string {
  return alreadyCited ? OVERDUE_QUESTION : `O prazo do ${code} venceu. ${OVERDUE_QUESTION}`;
}

/** Códigos que o agent ou o analista trouxeram na conversa. Um código que o usuário escreveu antes e eles só repetiram não conta. */
export function knownCodesFrom(history: readonly { authorType: string; content: string }[]): string[] {
  const fromEmployee = new Set<string>();
  const known = new Set<string>();
  for (const { authorType, content } of history) {
    for (const code of ticketCodesIn(content)) {
      if (authorType === "EMPLOYEE") {
        if (!known.has(code)) fromEmployee.add(code);
      } else if ((authorType === "AGENT" || authorType === "ANALYST") && !fromEmployee.has(code)) {
        known.add(code);
      }
    }
  }
  return [...known];
}

/** Código oferecido na última resposta do agent, se ela terminou com a oferta e cita um único chamado. */
export function overdueOfferCodeFrom(agentMessages: readonly string[]): string | null {
  const last = agentMessages.at(-1) ?? "";
  if (!last.endsWith(OVERDUE_QUESTION)) return null;
  const codes = new Set(ticketCodesIn(last));
  return codes.size === 1 ? ([...codes][0] ?? null) : null;
}

/** Aguardando o funcionário: o aviso da pausa vem do código, quando o modelo não falou dela. */
function withWaitingNote(reply: AgentTurnResult): AgentTurnResult {
  if (!waitingOnEmployee(reply.ticketLookup)) return reply;
  if (CITES_DEADLINE.test(reply.content)) return { ...reply, content: templateFor(reply.ticketLookup) };
  if (MENTIONS_PAUSE.test(reply.content)) return reply;
  const note = MENTIONS_WAITING.test(reply.content) ? PAUSE_NOTE : WAITING_EMPLOYEE_NOTE;
  return { ...reply, content: `${reply.content} ${note}` };
}

/** Chamado vencido num único resultado: o agent oferece o analista, não transfere sozinho. */
function withOverdueOffer(base: AgentTurnResult, suppress: boolean): AgentTurnResult {
  const reply = withWaitingNote(base);
  // A pergunta só pode vir do código: escrita pelo modelo, ela viraria uma oferta falsa no turno seguinte.
  const stripped = reply.content.split(OVERDUE_QUESTION).join("").replace(/\s+/g, " ").trim();
  const lookup = reply.ticketLookup;
  const content = stripped === "" && lookup ? templateFor(lookup) : stripped;
  // Depois de uma recusa, não oferecer de novo.
  if (suppress || lookup?.outcome !== "SINGLE_MATCH" || !lookup.tickets[0].overdue) return { ...reply, content };
  const { code } = lookup.tickets[0];
  const cited = ticketCodesIn(content).includes(code.toUpperCase());
  return { ...reply, content: `${content} ${overdueOfferText(code, cited)}`, quickReplies: OVERDUE_QUICK_REPLIES };
}

/** Na troca anterior, o agent ofereceu analista e o usuário recusou. */
export function offerDeclinedIn(history: readonly { authorType: string; content: string }[]): boolean {
  const [offer, answer, reply] = history.slice(-3);
  return (
    offer?.authorType === "AGENT" &&
    offer.content.endsWith(OVERDUE_QUESTION) &&
    answer?.authorType === "EMPLOYEE" &&
    declinesPerson(answer.content) &&
    reply?.authorType === "AGENT"
  );
}

/** O histórico mostra o analista como "[Analista] ...": o modelo às vezes copia o prefixo e fala como se fosse ele. */
const ANALYST_PREFIX = /^(?:\s*\[\s*analista\s*\]\s*:?\s*)+/i;

function withoutAnalystPrefix(text: string): string {
  return text.replace(ANALYST_PREFIX, "").trim();
}

/** Preserva informação essencial anterior à última proposta, sem concatenar resultados ou texto de ações da LLM. */
function withEssentialContext(reply: AgentTurnResult, input: ReplyInput): AgentTurnResult {
  const lastDraft = input.drafts.at(-1);
  const expired = input.drafts.findLast((execution) => execution.outcome === "REOPEN_BLOCKED" && execution.block.kind === "WINDOW_EXPIRED");
  let result = reply;
  if (expired?.outcome === "REOPEN_BLOCKED" && expired.block.kind === "WINDOW_EXPIRED" && expired !== lastDraft) {
    const notice = `O ${expired.block.ticket.code} foi resolvido há mais de 7 dias e não pode mais ser reaberto.`;
    result = { ...result, content: `${notice} ${result.content}`, trace: { ...result.trace, reason: `${REOPEN_BLOCK_SUMMARY.WINDOW_EXPIRED} ${result.trace.reason}` } };
  }
  const answer = withoutAnalystPrefix(input.decision?.articleAnswer ?? "");
  const article = foundArticles(input.articleSearches ?? []).find(({ slug }) => slug === input.decision?.articleSlug);
  // Só uma resposta informativa com fonte deste turno. Não aceitar códigos ou afirmações de escrita/transferência nesse canal.
  if (!article || !answer || claimsFalseAction(answer) || ticketCodesIn(answer).length > 0 || answer.includes("Fonte:")) return result;
  return {
    ...result,
    content: `${answer} ${result.content} Referência de aplicabilidade: ${article.title} (central de ajuda).`,
    trace: { ...result.trace, sources: [{ kind: "ARTICLE", slug: article.slug, title: article.title }] },
    // A proposta conserva seus controles; informar uma restrição não oferece "Resolveu"/"Não resolveu".
  };
}

/** Null: não há resposta aproveitável, e o runner trata como agent indisponível. */
export function composeReply(input: ReplyInput): AgentTurnResult | null {
  const { message, decision, fallbackText, executions, drafts, handoffs = [], articleSearches = [], overdueOfferActive = false, suppressOverdueOffer = false } = input;
  const lastExecution = executions.at(-1) ?? null;
  // Com a oferta como última pergunta, a confirmação é a resposta a ela; um rascunho anterior segue pendente.
  if (isBareConfirmation(message) && !overdueOfferActive) {
    // A instrução não impede o modelo de chamar a tool: o que rodou fica no trace, mas não vira seletor nem proposta.
    return {
      content: CONFIRMATION_REPLY,
      trace: {
        understood: "O usuário tentou confirmar por mensagem.",
        // Pode ser complemento ou abertura: o turno não sabe qual rascunho está na tela.
        intent: "OTHER",
        actions: turnActions(input, true),
        confidence: "HIGH",
        reason: "Confirmação só vale pelo botão; resultados de tools do turno não foram usados.",
      },
      ticketLookup: null,
      ticketDraft: null,
    };
  }

  // Fora de escopo, a consulta fica só no trace: o modelo às vezes chama a tool e a tela mostraria o seletor.
  if (decision?.intent === "OUT_OF_SCOPE") return outOfScopeReply(decision, input);

  const ticketLookup = lastExecution;
  const trace = traceOf(decision, lastExecution, turnActions(input));

  // Transferência vale mais que rascunho: o backend descarta o rascunho e move a conversa.
  const lastHandoff = handoffs.at(-1);
  if (lastHandoff?.outcome === "ACCEPTED") {
    return {
      content: HANDOFF_REPLY,
      trace: { ...trace, intent: "TALK_TO_ANALYST" },
      ticketLookup: null,
      ticketDraft: null,
      quickReplies: null,
      handoff: lastHandoff.proposal,
    };
  }

  // Vale a última execução: um bloqueio depois de uma proposta a cancela.
  const block = createBlock(drafts.at(-1));
  if (block) {
    const blockTrace: AgentTrace = { ...trace, intent: block.intent, reason: block.reason };
    return withEssentialContext({ content: block.content, trace: blockTrace, ticketLookup, ticketDraft: null, quickReplies: block.quickReplies }, input);
  }

  // A proposta é real: o texto vem do código, para nunca prometer mais do que ela.
  const lastDraft = drafts.at(-1);
  if (lastDraft?.outcome === "DRAFTED") {
    const { proposal } = lastDraft;
    const intent = proposal.kind === "CREATE" ? "OPEN_TICKET" : proposal.kind === "REOPEN" ? "REOPEN" : "COMPLEMENT";
    return withEssentialContext({ content: proposalText(proposal), trace: { ...trace, intent }, ticketLookup, ticketDraft: proposal }, input);
  }
  if (lastDraft?.outcome === "TICKET_NOT_AVAILABLE" || lastDraft?.outcome === "SERVICE_UNAVAILABLE") {
    const { content, reason } = DRAFT_FAILURE[lastDraft.outcome];
    return withEssentialContext({ content, trace: { ...trace, confidence: "LOW", reason }, ticketLookup, ticketDraft: null }, input);
  }

  const raw = withoutAnalystPrefix(decision ? decision.content : fallbackText);
  // Transferência recusada fica só no trace; a resposta do turno segue. Sem resposta, explica que não transferiu.
  if (raw === "") {
    if (lastHandoff?.outcome !== "REJECTED") return null;
    return { content: HANDOFF_REJECTED_REPLY, trace: { ...trace, confidence: "LOW" }, ticketLookup, ticketDraft: null, quickReplies: null };
  }

  const draft = decision ? raw : usablePlainText(raw);
  if (draft === "") {
    if (!ticketLookup) return null;
    return withOverdueOffer({ content: templateFor(ticketLookup), trace, ticketLookup, ticketDraft: null }, suppressOverdueOffer);
  }

  const rejection = rejectionOf(draft, ticketLookup);
  if (rejection === null) {
    const reply = withOverdueOffer({ content: draft, trace, ticketLookup, ticketDraft: null }, suppressOverdueOffer);
    return withCitation(reply, decision?.articleSlug, articleSearches);
  }
  return {
    content: rejection.content,
    // `understood` pode repetir o que foi rejeitado, como um chamado inventado.
    trace: { ...trace, understood: FALLBACK_UNDERSTOOD, confidence: "LOW", reason: rejection.reason },
    ticketLookup,
    ticketDraft: null,
  };
}
