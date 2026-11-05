import { createAgentRunner } from "./agent/agent-runner.js";
import { loadAgentConfig, type AgentConfig } from "./agent/config.js";
import { loadApiConfig, type ApiConfig } from "./api/config.js";
import { createApp } from "./app.js";
import { createAuthService } from "./auth/auth-service.js";
import { createChatService } from "./chat/chat-service.js";
import { createConsoleService } from "./console/console-service.js";
import { createConsoleTicketService } from "./console/console-ticket-service.js";
import { createConversationQueries } from "./conversations/conversation-queries.js";
import { createConversationService } from "./conversations/conversation-service.js";
import { checkDatabaseConnection } from "./db/check-connection.js";
import { prisma } from "./db/prisma.js";
import { createKnowledgeService, createPrismaKnowledgeStore } from "./knowledge/knowledge-service.js";
import { createEventBus } from "./realtime/event-bus.js";
import { createFanout } from "./realtime/fanout.js";
import { createTicketServiceFromEnv } from "./tickets/resilient-ticket-service.js";
import { createTicketService, type FullTicketService } from "./tickets/ticket-service.js";
import { createTicketStatusService } from "./tickets/ticket-status-service.js";

const PORT = Number(process.env.PORT) || 8000;

type BootConfig = { api: ApiConfig; agent: AgentConfig; ticketService: FullTicketService };

function readConfig(): BootConfig | null {
  try {
    return {
      api: loadApiConfig(process.env),
      agent: loadAgentConfig(process.env),
      ticketService: createTicketServiceFromEnv(createTicketService(prisma), process.env),
    };
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Configuração inválida");
    return null;
  }
}

const config = readConfig();

if (config && (await checkDatabaseConnection(prisma))) {
  const queries = createConversationQueries(prisma);
  // Tempo real em memória: vale para uma instância da API (veja o README, "Tempo real").
  const eventBus = createEventBus();
  const fanout = createFanout({ bus: eventBus, readConversation: (id) => queries.find(id) });
  const conversations = createConversationService(prisma, { publisher: fanout });
  const consoleService = createConsoleService({ conversations, queries, tickets: config.ticketService });
  const consoleTicketService = createConsoleTicketService({
    statuses: createTicketStatusService(prisma),
    availability: config.ticketService,
    publisher: fanout,
  });
  const knowledgeService = createKnowledgeService(createPrismaKnowledgeStore(prisma));
  const chatService = createChatService({
    conversations,
    queries,
    tickets: config.ticketService,
    agentRunner: createAgentRunner({
      model: config.agent.model,
      timeoutMs: config.agent.timeoutMs,
      ticketService: config.ticketService,
      knowledgeService,
      onTurnMetrics: (metrics) => console.log("Turno do agent:", JSON.stringify(metrics)),
    }),
  });
  const server = createApp({ config: config.api, authService: createAuthService(prisma), chatService, consoleService, consoleTicketService, knowledgeService, eventBus }).listen(
    PORT,
    "0.0.0.0",
    () => {
      console.log(`API rodando em http://localhost:${PORT}`);
    },
  );

  // Os streams SSE nunca terminam sozinhos: sem encerrá-los, o server.close() esperaria para sempre.
  // Espera o fan-out terminar o que já recebeu, para não perder eventos já gravados.
  const shutdown = async () => {
    await fanout.idle();
    eventBus.closeAll();
    server.close(() => {
      void prisma.$disconnect();
    });
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
} else {
  process.exitCode = 1;
}
