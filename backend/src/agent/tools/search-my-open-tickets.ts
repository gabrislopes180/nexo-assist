import type { RequestContext } from "@mastra/core/request-context";
import { createTool } from "@mastra/core/tools";
import { ticketLookupCriteriaSchema, ticketLookupResultSchema, type TicketLookupCriteria, type TicketLookupResult } from "../../shared/chat.js";
import { TicketServiceUnavailableError, type TicketService } from "../../tickets/ticket-service.js";
import type { TurnContextValues } from "./turn-recorder.js";

export const SEARCH_MY_OPEN_TICKETS_TOOL = "searchMyOpenTickets";

const UNAVAILABLE: TicketLookupResult = { outcome: "UNAVAILABLE", openTicketCount: null, totalMatches: null, tickets: [] };

type ToolDeps = { ticketService: TicketService; now?: () => Date };

async function lookup({ ticketService, now = () => new Date() }: ToolDeps, ownerId: string, criteria: TicketLookupCriteria): Promise<TicketLookupResult> {
  try {
    return await ticketService.lookupOpenTickets(ownerId, criteria, now());
  } catch (error) {
    if (error instanceof TicketServiceUnavailableError) return UNAVAILABLE;
    throw error;
  }
}

export async function searchTickets(
  deps: ToolDeps,
  criteria: TicketLookupCriteria,
  context: RequestContext<TurnContextValues> | undefined,
): Promise<TicketLookupResult> {
  const ownerId = context?.get("actorId");
  const result = ownerId ? await lookup(deps, ownerId, criteria) : UNAVAILABLE;
  context?.get("recorder")?.record(result);
  return result;
}

export function createSearchMyOpenTicketsTool(deps: ToolDeps) {
  return createTool({
    id: SEARCH_MY_OPEN_TICKETS_TOOL,
    description:
      "Consulta os chamados abertos do usuário autenticado (nunca os de outra pessoa). " +
      "Use `code` quando ele citar um código como INC-20311 ou REQ-1234. " +
      "Use `keywords` para assunto ou características, com palavras curtas da própria mensagem (ex.: notebook, lento, vpn). " +
      "Sem critérios, lista os chamados abertos dele. " +
      "Só preencha `type`, `category`, `priority` ou `status` se ele pedir esse filtro explicitamente.",
    inputSchema: ticketLookupCriteriaSchema,
    outputSchema: ticketLookupResultSchema,
    execute: (criteria, context) => searchTickets(deps, criteria, context.requestContext as RequestContext<TurnContextValues> | undefined),
  });
}
