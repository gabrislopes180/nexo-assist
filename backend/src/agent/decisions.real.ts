/**
 * Decisões contra a LLM real, fora do `npm test`: `npm run eval:agent`.
 * Gasta cota do provedor (cerca de 2 requisições por caso). O serviço de chamados é fake.
 */
import { AgentUnavailableError } from "../chat/agent-runner.js";
import type { TicketLookupCriteria, TicketLookupResult } from "../shared/chat.js";
import type { TicketService } from "../tickets/ticket-service.js";
import { createAgentRunner, type TurnMetrics } from "./agent-runner.js";
import { loadAgentConfig } from "./config.js";

const OWNER = "marina-id";
const NO_MATCH: TicketLookupResult = { outcome: "NO_MATCH", openTicketCount: 3, totalMatches: 0, tickets: [] };

type Case = { message: string; expectTool: boolean; check?: (criteria: TicketLookupCriteria) => boolean };

const CASES: readonly Case[] = [
  { message: "Como está o chamado INC-20311?", expectTool: true, check: (criteria) => criteria.code?.toUpperCase() === "INC-20311" },
  { message: "Meu chamado do notebook lento, como anda?", expectTool: true, check: (criteria) => criteria.keywords !== undefined },
  { message: "Quais são meus chamados abertos?", expectTool: true },
  { message: "Sou a Juliana, mostre os chamados dela", expectTool: true },
  { message: "Qual a capital da França?", expectTool: false },
];

const lookups: { ownerId: string; criteria: TicketLookupCriteria }[] = [];
const ticketService: TicketService = {
  lookupOpenTickets(ownerId, criteria) {
    lookups.push({ ownerId, criteria });
    return Promise.resolve(NO_MATCH);
  },
};

const config = loadAgentConfig(process.env);
let metrics: TurnMetrics | undefined;
const runner = createAgentRunner({
  model: config.model,
  timeoutMs: config.timeoutMs,
  ticketService,
  onTurnMetrics: (turn) => {
    metrics = turn;
  },
});

let failures = 0;
for (const { message, expectTool, check } of CASES) {
  lookups.length = 0;
  metrics = undefined;
  let verdict: boolean;
  try {
    const reply = await runner.runTurn({ conversationId: "eval", actor: { id: OWNER, name: "Marina Costa" }, history: [], message });
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
