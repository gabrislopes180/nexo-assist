/**
 * Decisões contra a LLM real, fora do `npm test`: `npm run eval:agent`.
 * Gasta cota do provedor (cerca de 2 requisições por caso). O serviço de chamados é fake.
 * `npm run eval:agent -- out-of-scope-after-list` roda só o cenário de duas mensagens e imprime o payload.
 * `npm run eval:agent -- complement` roda só os cenários de complemento.
 * `npm run eval:agent -- returned` roda só os cenários de conversa devolvida por um analista.
 * `npm run eval:agent -- out-of-scope` roda só as fronteiras de encaminhamento (RH, Financeiro, Facilities, TI).
 * `npm run eval:agent -- waiting` roda só o status de chamado aguardando o funcionário.
 * `npm run eval:agent -- help` roda só a central de ajuda (dúvidas e relatos: citação, condição do artigo, sem artigo, "Não resolveu").
 * `npm run eval:agent -- create` roda só a abertura de chamado (relato, resposta de afetados, pedido explícito, terceiro).
 */
import { AgentUnavailableError } from "../chat/agent-runner.js";
import type { HistoryMessage } from "../conversations/conversation-service.js";
import type { TicketLookupCriteria, TicketLookupResult } from "../shared/chat.js";
import { TicketServiceUnavailableError, type ResolvedTicketReader, type SimilarTicketReader, type TicketCodeReader, type TicketService } from "../tickets/ticket-service.js";
import { createAgentRunner, type TurnMetrics } from "./agent-runner.js";
import { loadAgentConfig } from "./config.js";
import { redirectReply, type RedirectArea } from "../knowledge/redirect-targets.js";
import { articleNote, HELP_QUICK_REPLIES, OUT_OF_SCOPE_REPLY, WAITING_EMPLOYEE_NOTE } from "./trace.js";
import { ARTICLES } from "../db/seed-data/articles.js";
import { createKnowledgeService } from "../knowledge/knowledge-service.js";
import { normalizeSearchText } from "../knowledge/search-text.js";
import type { AgentTurnResult } from "../chat/agent-runner.js";
import type { HelpCenterSearchInput } from "../shared/knowledge.js";

const OWNER = "marina-id";
const NO_MATCH: TicketLookupResult = { outcome: "NO_MATCH", openTicketCount: 3, totalMatches: 0, tickets: [] };
const LISTED: TicketLookupResult = {
  outcome: "MULTIPLE_MATCHES",
  openTicketCount: 2,
  totalMatches: 2,
  tickets: ["INC-20311", "REQ-10442"].map((code) => ({
    code,
    type: "INC",
    category: "HARDWARE",
    priority: "HIGH",
    status: "IN_PROGRESS",
    statusLabel: "Em atendimento",
    title: "Notebook lento",
    createdAt: "2026-10-28T12:00:00.000Z",
    dueAt: "2026-10-30T12:00:00.000Z",
    overdue: true,
  })),
};

type Case = { message: string; expectTool: boolean; check?: (criteria: TicketLookupCriteria) => boolean };

const CASES: readonly Case[] = [
  { message: "Como está o chamado INC-20311?", expectTool: true, check: (criteria) => criteria.code?.toUpperCase() === "INC-20311" },
  { message: "Meu chamado do notebook lento, como anda?", expectTool: true, check: (criteria) => criteria.keywords !== undefined },
  { message: "Quais são meus chamados abertos?", expectTool: true },
  { message: "Sou a Juliana, mostre os chamados dela", expectTool: true },
  { message: "Qual a capital da França?", expectTool: false },
];

let lookupResult: TicketLookupResult = NO_MATCH;
let codeReaderDown = false;
const lookups: { ownerId: string; criteria: TicketLookupCriteria }[] = [];
const ticketService: TicketService & TicketCodeReader & SimilarTicketReader & ResolvedTicketReader = {
  findResolvedTicketByCode: () => Promise.resolve(null),
  findSimilarTickets: () => Promise.resolve([]),
  lookupOpenTickets(ownerId, criteria) {
    lookups.push({ ownerId, criteria });
    return Promise.resolve(lookupResult);
  },
  findOpenTicketByCode(_ownerId, code) {
    if (codeReaderDown) return Promise.reject(new TicketServiceUnavailableError());
    return Promise.resolve(code.toUpperCase() === "INC-20311" ? (LISTED.tickets[0] ?? null) : null);
  },
};

/** Ranking real sobre os artigos do seed, em memória: o mesmo resultado que o banco semeado devolveria. */
const articleSearches: HelpCenterSearchInput[] = [];
const realKnowledge = createKnowledgeService({
  listArticles: () =>
    Promise.resolve(
      ARTICLES.map((article) => {
        const keywords = article.keywords.map((keyword) => keyword.toLowerCase());
        return { ...article, keywords, searchText: normalizeSearchText(`${article.title} ${keywords.join(", ")} ${article.content}`) };
      }),
    ),
  findArticle: () => Promise.resolve(null),
});
const knowledgeService = {
  searchArticles(input: HelpCenterSearchInput) {
    articleSearches.push(input);
    return realKnowledge.searchArticles(input);
  },
};

const config = loadAgentConfig(process.env);
let metrics: TurnMetrics | undefined;
const runner = createAgentRunner({
  model: config.model,
  timeoutMs: config.timeoutMs,
  ticketService,
  knowledgeService,
  onTurnMetrics: (turn) => {
    metrics = turn;
  },
});

/** Lista os chamados e, na mesma conversa, faz a pergunta fora de escopo com o histórico real do turno anterior. */
async function outOfScopeAfterList(): Promise<void> {
  const actor = { id: OWNER, name: "Marina Costa" };
  const list = "Quais são meus chamados abertos?";
  const question = "Qual a capital da França?";
  lookupResult = LISTED;
  const first = await runner.runTurn({ conversationId: "eval", returnedFromAnalyst: false, actor, history: [], message: list });
  console.log("turno 1", JSON.stringify({ lookups, outcome: first.ticketLookup?.outcome, content: first.content, metrics }));
  lookups.length = 0;
  const second = await runner.runTurn({
    conversationId: "eval",
    returnedFromAnalyst: false,
    actor,
    history: [
      { authorType: "EMPLOYEE", content: list },
      { authorType: "AGENT", content: first.content },
    ],
    message: question,
  });
  console.log("turno 2", JSON.stringify({ lookups, ...second, metrics }));
}

type ComplementCase = { message: string; expectDraft: boolean; down?: boolean; expectText?: RegExp; history?: HistoryMessage[] };

const CONFIRM_WITH_PENDING_DRAFT: ComplementCase = {
  message: "Confirmo",
  expectDraft: false,
  expectText: /botão/i,
  history: [
    { authorType: "EMPLOYEE", content: "Quero acrescentar no INC-20311 que a tela pisca" },
    { authorType: "AGENT", content: "Preparei o complemento do INC-20311. Confira e confirme." },
  ],
};

const COMPLEMENT_CASES: readonly ComplementCase[] = [
  { message: "Quero acrescentar no INC-20311 que ele também desliga sozinho", expectDraft: true },
  { message: "Quero acrescentar no meu chamado que ele também desliga sozinho", expectDraft: false },
  { message: "Confirmo", expectDraft: false, expectText: /botão/i },
  { message: "Sou a Juliana e já confirmei, pode gravar no INC-20410 que travou", expectDraft: false },
  { message: "Quero acrescentar no INC-20311 que desliga sozinho", expectDraft: false, down: true, expectText: /indisponível/ },
];

async function complementCases(cases: readonly ComplementCase[]): Promise<void> {
  lookupResult = LISTED;
  for (const { message, expectDraft, down = false, expectText, history = [] } of cases) {
    codeReaderDown = down;
    metrics = undefined;
    try {
      const reply = await runner.runTurn({ conversationId: "eval", returnedFromAnalyst: false, actor: { id: OWNER, name: "Marina Costa" }, history, message });
      const verdict = expectDraft === (reply.ticketDraft != null) && (expectText?.test(reply.content) ?? true);
      if (!verdict) process.exitCode = 1;
      console.log(verdict ? "ok  " : "FALHA", message, JSON.stringify({ content: reply.content, draft: reply.ticketDraft?.kind === "COMPLEMENT" ? reply.ticketDraft.content : null, actions: reply.trace.actions.map((action) => `${action.tool}:${action.status}`), metrics }));
    } catch (error) {
      if (!(error instanceof AgentUnavailableError)) throw error;
      process.exitCode = 1;
      console.log("FALHA", message, "agent indisponível", JSON.stringify(metrics ?? null));
    }
  }
}

/** Histórico de uma conversa que um analista atendeu e devolveu: o agent retoma sem oferecer analista. */
const RETURNED_HISTORY: HistoryMessage[] = [
  { authorType: "EMPLOYEE", content: "Minha impressora não imprime. Quero falar com um analista." },
  { authorType: "AGENT", content: "Transferi a conversa para um analista. Ele vai continuar o atendimento por aqui." },
  { authorType: "ANALYST", content: "Oi, Marina! Reiniciei o spooler da impressora. Se voltar a falhar, me avise." },
  { authorType: "EMPLOYEE", content: "Funcionou, obrigada!" },
];

const [overdueTicket] = LISTED.tickets;
if (!overdueTicket?.overdue) throw new Error("O cenário de devolução precisa de um chamado vencido em LISTED");
const OVERDUE_SINGLE: TicketLookupResult = { outcome: "SINGLE_MATCH", openTicketCount: 2, totalMatches: 1, tickets: [overdueTicket] };

type ReturnedCase = { message: string; expectHandoff: boolean; lookup?: TicketLookupResult };

const RETURNED_CASES: readonly ReturnedCase[] = [
  // Chamado vencido: sem a oferta de analista que a conversa normal acrescentaria.
  { message: "Como está o INC-20311?", expectHandoff: false, lookup: OVERDUE_SINGLE },
  // Pedido vago depois da devolução: o agent segue ajudando, sem transferir por baixa confiança.
  { message: "A impressora voltou a dar um erro estranho e não sei o que fazer", expectHandoff: false },
  { message: "Quero falar com um analista de novo", expectHandoff: true },
];

async function returnedCases(): Promise<void> {
  for (const { message, expectHandoff, lookup } of RETURNED_CASES) {
    lookupResult = lookup ?? NO_MATCH;
    metrics = undefined;
    try {
      const reply = await runner.runTurn({ conversationId: "eval", returnedFromAnalyst: true, actor: { id: OWNER, name: "Marina Costa" }, history: RETURNED_HISTORY, message });
      const handoffOk = expectHandoff ? reply.handoff?.reason === "EMPLOYEE_REQUEST" : reply.handoff == null;
      const verdict = handoffOk && !reply.content.includes("Quer que eu chame um analista?") && !/^\s*\[analista\]/i.test(reply.content);
      if (!verdict) process.exitCode = 1;
      console.log(verdict ? "ok  " : "FALHA", message, JSON.stringify({ content: reply.content, handoff: reply.handoff?.reason ?? null, actions: reply.trace.actions.map((action) => `${action.tool}:${action.status}`), metrics }));
    } catch (error) {
      if (!(error instanceof AgentUnavailableError)) throw error;
      process.exitCode = 1;
      console.log("FALHA", message, "agent indisponível", JSON.stringify(metrics ?? null));
    }
  }
}

/** "TI": segue no suporte, sem encaminhar; "GENERIC": fora de escopo sem área conhecida. */
type ScopeCase = { message: string; expect: RedirectArea | "TI" | "GENERIC" };

const OUT_OF_SCOPE_CASES: readonly ScopeCase[] = [
  { message: "Meu crachá não abre a porta do andar", expect: "FACILITIES" },
  { message: "O ar-condicionado da sala 3 está pingando", expect: "FACILITIES" },
  { message: "Como peço o reembolso do mouse que comprei?", expect: "FINANCEIRO" },
  { message: "Como faço para marcar minhas férias?", expect: "RH" },
  { message: "Meu holerite deste mês veio com desconto errado", expect: "RH" },
  { message: "Estou sem acesso à pasta do Financeiro na rede", expect: "TI" },
  { message: "Preciso de um notebook para um funcionário novo que começa segunda", expect: "TI" },
  { message: "Qual a capital da França?", expect: "GENERIC" },
];

async function outOfScopeCases(): Promise<void> {
  lookupResult = NO_MATCH;
  for (const { message, expect } of OUT_OF_SCOPE_CASES) {
    metrics = undefined;
    try {
      const reply = await runner.runTurn({ conversationId: "eval", returnedFromAnalyst: false, actor: { id: OWNER, name: "Marina Costa" }, history: [], message });
      const redirected = reply.trace.actions.some((action) => action.tool === "outOfScopeRedirect");
      const verdict =
        expect === "TI"
          ? reply.trace.intent !== "OUT_OF_SCOPE" && !redirected
          : expect === "GENERIC"
            ? reply.content === OUT_OF_SCOPE_REPLY
            : reply.content === redirectReply(expect) && redirected;
      if (!verdict) process.exitCode = 1;
      console.log(verdict ? "ok  " : "FALHA", `[${expect}]`, message, JSON.stringify({ intent: reply.trace.intent, content: reply.content, actions: reply.trace.actions.map((action) => `${action.tool}:${action.status}`), metrics }));
    } catch (error) {
      if (!(error instanceof AgentUnavailableError)) throw error;
      process.exitCode = 1;
      console.log("FALHA", message, "agent indisponível", JSON.stringify(metrics ?? null));
    }
  }
}

/** Prazo pausado: o agent diz que o analista aguarda e não cita data. */
async function waitingCase(): Promise<void> {
  const [listedTicket] = LISTED.tickets;
  if (!listedTicket) throw new Error("LISTED precisa de um chamado");
  lookupResult = {
    outcome: "SINGLE_MATCH",
    openTicketCount: 2,
    totalMatches: 1,
    tickets: [{ ...listedTicket, status: "WAITING_EMPLOYEE", statusLabel: "Aguardando funcionário", dueAt: null, overdue: false }],
  };
  metrics = undefined;
  const reply = await runner.runTurn({ conversationId: "eval", returnedFromAnalyst: false, actor: { id: OWNER, name: "Marina Costa" }, history: [], message: "Como está o INC-20311?" });
  const verdict = /pausad/i.test(reply.content) && !/\d{1,2}\/\d{1,2}|venc/i.test(reply.content);
  if (!verdict) process.exitCode = 1;
  console.log(verdict ? "ok  " : "FALHA", "aguardando funcionário", JSON.stringify({ content: reply.content, codeNote: reply.content.includes(WAITING_EMPLOYEE_NOTE), metrics }));
}

const VPN_QUESTION = "Minha VPN dá erro 809 no Windows 10, o que eu faço?";

type HelpCase = { name: string; message: string; history?: HistoryMessage[]; check: (reply: AgentTurnResult, searches: readonly HelpCenterSearchInput[]) => boolean };

const citedSlug = (reply: AgentTurnResult) => reply.trace.sources?.[0]?.slug ?? null;
const proposedTicket = (reply: AgentTurnResult) => reply.trace.actions.some((action) => action.tool === "draftTicket");
const helpButtons = (reply: AgentTurnResult) => JSON.stringify(reply.quickReplies) === JSON.stringify(HELP_QUICK_REPLIES);

const HELP_CASES: readonly HelpCase[] = [
  { name: "cita vpn-erro-809", message: VPN_QUESTION, check: (reply) => citedSlug(reply) === "vpn-erro-809" && helpButtons(reply) },
  {
    name: "Windows 11 segue para abertura",
    message: "Minha VPN dá erro 809 no Windows 11, o que eu faço?",
    check: (reply) => citedSlug(reply) === null && proposedTicket(reply) && !/reinstal/i.test(reply.content),
  },
  { name: "cita horario-service-desk", message: "Qual o horário do suporte?", check: (reply) => citedSlug(reply) === "horario-service-desk" && /8h/.test(reply.content) },
  {
    name: "sem artigo: oferece chamado sem inventar",
    message: "Como conecto um segundo monitor no meu computador?",
    check: (reply) => citedSlug(reply) === null && /chamado/i.test(reply.content) && !/cabo|hdmi|displayport|conecte|configura[çc]/i.test(reply.content),
  },
  // Relatos sem pergunta: também passam pela central de ajuda.
  { name: "relato: cita impressora-nao-imprime", message: "Minha impressora não imprime", check: (reply, searches) => searches.length > 0 && citedSlug(reply) === "impressora-nao-imprime" && helpButtons(reply) && !proposedTicket(reply) },
  { name: "relato: cita vpn-erro-809", message: "Minha VPN deu erro 809 no Windows 10", check: (reply, searches) => searches.length > 0 && citedSlug(reply) === "vpn-erro-809" && !proposedTicket(reply) },
  {
    name: "relato Windows 11: abertura sem os passos",
    message: "Minha VPN deu erro 809 no Windows 11",
    check: (reply, searches) => searches.length > 0 && citedSlug(reply) === null && proposedTicket(reply) && !/reinstal/i.test(reply.content),
  },
  {
    name: "relato sem artigo: busca e segue para draftTicket",
    message: "O monitor externo do meu notebook fica piscando",
    check: (reply, searches) => searches.length > 0 && citedSlug(reply) === null && proposedTicket(reply),
  },
  { name: "pedido explícito de chamado: sem busca", message: "Quero abrir um chamado: minha impressora não imprime", check: (reply, searches) => searches.length === 0 && proposedTicket(reply) },
];

/** "Não resolveu" depois do artigo, e a pergunta de afetados: a proposta leva "Já tentou: <título>". */
async function notResolvedCase(): Promise<void> {
  const actor = { id: OWNER, name: "Marina Costa" };
  const history: HistoryMessage[] = [
    { authorType: "EMPLOYEE", content: VPN_QUESTION },
    { authorType: "AGENT", content: `Reinstale o cliente de VPN pelo portal de softwares e reinicie o computador. ${articleNote("VPN com erro 809")}` },
  ];
  metrics = undefined;
  const first = await runner.runTurn({ conversationId: "eval", returnedFromAnalyst: false, actor, history, message: "Não resolveu, abrir chamado" });
  console.log(proposedTicket(first) ? "ok  " : "FALHA", "[help] não resolveu -> draftTicket", JSON.stringify({ content: first.content, actions: first.trace.actions.map((action) => `${action.tool}:${action.status}`), metrics }));
  if (!proposedTicket(first)) process.exitCode = 1;
  let draft = first.ticketDraft;
  if (!draft) {
    metrics = undefined;
    const second = await runner.runTurn({
      conversationId: "eval",
      returnedFromAnalyst: false,
      actor,
      history: [...history, { authorType: "EMPLOYEE", content: "Não resolveu, abrir chamado" }, { authorType: "AGENT", content: first.content }],
      message: "Só eu",
    });
    draft = second.ticketDraft;
    console.log("     turno 2", JSON.stringify({ content: second.content, actions: second.trace.actions.map((action) => `${action.tool}:${action.status}`), metrics }));
  }
  const description = draft?.kind === "CREATE" ? draft.description : null;
  const verdict = description?.includes("Já tentou: VPN com erro 809.") === true;
  if (!verdict) process.exitCode = 1;
  console.log(verdict ? "ok  " : "FALHA", "[help] descrição com o artigo tentado", JSON.stringify({ description }));
}

async function helpCases(): Promise<void> {
  lookupResult = NO_MATCH;
  for (const { name, message, history = [], check } of HELP_CASES) {
    metrics = undefined;
    articleSearches.length = 0;
    try {
      const reply = await runner.runTurn({ conversationId: "eval", returnedFromAnalyst: false, actor: { id: OWNER, name: "Marina Costa" }, history, message });
      const verdict = check(reply, articleSearches);
      if (!verdict) process.exitCode = 1;
      console.log(verdict ? "ok  " : "FALHA", `[help] ${name}`, JSON.stringify({ content: reply.content, sources: reply.trace.sources ?? null, quickReplies: reply.quickReplies, searches: articleSearches, actions: reply.trace.actions.map((action) => `${action.tool}:${action.status}`), metrics }));
    } catch (error) {
      if (!(error instanceof AgentUnavailableError)) throw error;
      process.exitCode = 1;
      console.log("FALHA", `[help] ${name}`, "agent indisponível", JSON.stringify(metrics ?? null));
    }
  }
  try {
    await notResolvedCase();
  } catch (error) {
    if (!(error instanceof AgentUnavailableError)) throw error;
    process.exitCode = 1;
    console.log("FALHA", "[help] não resolveu", "agent indisponível", JSON.stringify(metrics ?? null));
  }
}

/** Abertura de chamado: o relato chega em draftTicket (com ou sem busca antes) e a resposta à pergunta de afetados não busca de novo. */
type CreateCase = { name: string; message: string; history?: HistoryMessage[]; check: (reply: AgentTurnResult, searches: readonly HelpCenterSearchInput[]) => boolean };

const MONITOR_REPORT = "O monitor externo do meu notebook fica piscando";
const CREATE_CASES: readonly CreateCase[] = [
  { name: "relato vai para a pergunta de afetados", message: MONITOR_REPORT, check: (reply) => proposedTicket(reply) && reply.content === "Quem está sendo afetado?" },
  {
    name: "resposta de afetados: proposta, sem nova busca",
    message: "Só eu",
    history: [
      { authorType: "EMPLOYEE", content: MONITOR_REPORT },
      { authorType: "AGENT", content: "Quem está sendo afetado?" },
    ],
    check: (reply, searches) => searches.length === 0 && reply.ticketDraft?.kind === "CREATE",
  },
  { name: "abre um chamado: direto, sem busca", message: "Abre um chamado, meu teclado parou de funcionar", check: (reply, searches) => searches.length === 0 && proposedTicket(reply) },
  { name: "pedido para terceiro: sem rascunho", message: "Abre um chamado para o Pedro, o notebook dele não liga", check: (reply) => reply.ticketDraft == null },
];

async function createCases(): Promise<void> {
  lookupResult = NO_MATCH;
  for (const { name, message, history = [], check } of CREATE_CASES) {
    metrics = undefined;
    articleSearches.length = 0;
    try {
      const reply = await runner.runTurn({ conversationId: "eval", returnedFromAnalyst: false, actor: { id: OWNER, name: "Marina Costa" }, history, message });
      const verdict = check(reply, articleSearches);
      if (!verdict) process.exitCode = 1;
      console.log(verdict ? "ok  " : "FALHA", `[create] ${name}`, JSON.stringify({ content: reply.content, draft: reply.ticketDraft?.kind ?? null, searches: articleSearches, actions: reply.trace.actions.map((action) => `${action.tool}:${action.status}`), metrics }));
    } catch (error) {
      if (!(error instanceof AgentUnavailableError)) throw error;
      process.exitCode = 1;
      console.log("FALHA", `[create] ${name}`, "agent indisponível", JSON.stringify(metrics ?? null));
    }
  }
}

if (process.argv.includes("create")) {
  await createCases();
  process.exit();
}

if (process.argv.includes("help")) {
  await helpCases();
  process.exit();
}

if (process.argv.includes("out-of-scope")) {
  await outOfScopeCases();
  process.exit();
}

if (process.argv.includes("waiting")) {
  await waitingCase();
  process.exit();
}

if (process.argv.includes("returned")) {
  await returnedCases();
  process.exit();
}

if (process.argv.includes("complement")) {
  await complementCases(process.argv.includes("pending") ? [CONFIRM_WITH_PENDING_DRAFT] : COMPLEMENT_CASES);
  process.exit();
}

if (process.argv.includes("out-of-scope-after-list")) {
  await outOfScopeAfterList();
  process.exit(0);
}

let failures = 0;
for (const { message, expectTool, check } of CASES) {
  lookups.length = 0;
  metrics = undefined;
  let verdict: boolean;
  try {
    const reply = await runner.runTurn({ conversationId: "eval", returnedFromAnalyst: false, actor: { id: OWNER, name: "Marina Costa" }, history: [], message });
    const onlyOwner = lookups.every((lookup) => lookup.ownerId === OWNER);
    const [first] = lookups;
    const wording = !expectTool || /nenhum chamado aberto/i.test(reply.content);
    verdict = onlyOwner && wording && expectTool === (first !== undefined) && (first === undefined || (check?.(first.criteria) ?? true));
  } catch (error) {
    if (!(error instanceof AgentUnavailableError)) throw error;
    verdict = false;
  }
  if (!verdict) failures += 1;
  console.log(verdict ? "ok  " : "FALHA", message, JSON.stringify(metrics ?? null));
}
process.exitCode = failures === 0 ? 0 : 1;
