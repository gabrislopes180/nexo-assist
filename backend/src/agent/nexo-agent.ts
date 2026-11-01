import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { noopLogger } from "@mastra/core/logger";
import type { RequestContext } from "@mastra/core/request-context";
import type { TicketCodeReader, TicketService } from "../tickets/ticket-service.js";
import { buildInstructions } from "./instructions.js";
import { createDraftComplementTool } from "./tools/draft-complement.js";
import { createSearchMyOpenTicketsTool } from "./tools/search-my-open-tickets.js";
import type { TurnContextValues } from "./tools/turn-recorder.js";

export type NexoAgentDeps = { model: MastraModelConfig; ticketService: TicketService & TicketCodeReader };

export function createNexoAgent({ model, ticketService }: NexoAgentDeps) {
  const agent = new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: ({ requestContext }) => buildInstructions((requestContext as RequestContext<TurnContextValues>).get("actorName") ?? "funcionário"),
    model,
    tools: {
      searchMyOpenTickets: createSearchMyOpenTicketsTool({ ticketService }),
      draftComplement: createDraftComplementTool({ ticketService }),
    },
  });
  // O logger padrão imprime o corpo cru da resposta do provedor.
  agent.__setLogger(noopLogger);
  return agent;
}
