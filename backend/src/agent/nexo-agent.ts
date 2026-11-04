import { Agent } from "@mastra/core/agent";
import type { MastraModelConfig } from "@mastra/core/llm";
import { noopLogger } from "@mastra/core/logger";
import type { RequestContext } from "@mastra/core/request-context";
import type { KnowledgeService } from "../knowledge/knowledge-service.js";
import type { ResolvedTicketReader, SimilarTicketReader, TicketCodeReader, TicketService } from "../tickets/ticket-service.js";
import { buildInstructions } from "./instructions.js";
import { instrumentModel } from "./model-calls.js";
import { createDraftComplementTool } from "./tools/draft-complement.js";
import { createDraftReopenTool } from "./tools/draft-reopen.js";
import { createDraftTicketTool } from "./tools/draft-ticket.js";
import { createSearchHelpCenterTool } from "./tools/search-help-center.js";
import { createTransferToAnalystTool } from "./tools/transfer-to-analyst.js";
import { createSearchMyOpenTicketsTool } from "./tools/search-my-open-tickets.js";
import type { TurnContextValues } from "./tools/turn-recorder.js";

export type NexoAgentDeps = {
  model: MastraModelConfig;
  ticketService: TicketService & TicketCodeReader & SimilarTicketReader & ResolvedTicketReader;
  /** Central de ajuda, para a tool searchHelpCenter. Sem ela, a busca responde UNAVAILABLE. */
  knowledgeService?: Pick<KnowledgeService, "searchArticles">;
};

export function createNexoAgent({ model, ticketService, knowledgeService }: NexoAgentDeps) {
  const agent = new Agent({
    id: "nexo-assist",
    name: "Nexo Assist",
    instructions: ({ requestContext }) => {
      const context = requestContext as RequestContext<TurnContextValues>;
      return buildInstructions(context.get("actorName") ?? "funcionário", context.get("returnedFromAnalyst") === true);
    },
    model: instrumentModel(model),
    tools: {
      searchMyOpenTickets: createSearchMyOpenTicketsTool({ ticketService }),
      searchHelpCenter: createSearchHelpCenterTool(knowledgeService ? { knowledgeService } : {}),
      draftComplement: createDraftComplementTool({ ticketService }),
      draftTicket: createDraftTicketTool({ ticketService }),
      draftReopen: createDraftReopenTool({ ticketService }),
      transferToAnalyst: createTransferToAnalystTool(),
    },
  });
  // O logger padrão imprime o corpo cru da resposta do provedor.
  agent.__setLogger(noopLogger);
  return agent;
}
