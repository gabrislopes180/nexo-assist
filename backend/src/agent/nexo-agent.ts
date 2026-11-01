import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { noopLogger } from "@mastra/core/logger";
import type { RequestContext } from "@mastra/core/request-context";
import type { TicketService } from "../tickets/ticket-service.js";
import { buildInstructions } from "./instructions.js";
import { createSearchMyOpenTicketsTool, type TurnContextValues } from "./tools/search-my-open-tickets.js";

export type NexoAgentDeps = { model: MastraModelConfig; ticketService: TicketService };

export function createNexoAgent({ model, ticketService }: NexoAgentDeps) {
  const agent = new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: ({ requestContext }) => buildInstructions((requestContext as RequestContext<TurnContextValues>).get("actorName") ?? "funcionário"),
    model,
    tools: { searchMyOpenTickets: createSearchMyOpenTicketsTool({ ticketService }) },
  });
  // O logger padrão imprime o corpo cru da resposta do provedor.
  agent.__setLogger(noopLogger);
  return agent;
}
