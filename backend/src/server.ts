import { createAgentRunner } from "./agent/agent-runner.js";
import { loadAgentConfig, type AgentConfig } from "./agent/config.js";
import { loadApiConfig, type ApiConfig } from "./api/config.js";
import { createApp } from "./app.js";
import { createAuthService } from "./auth/auth-service.js";
import { createChatService } from "./chat/chat-service.js";
import { createConversationService } from "./conversations/conversation-service.js";
import { checkDatabaseConnection } from "./db/check-connection.js";
import { prisma } from "./db/prisma.js";
import { createTicketServiceFromEnv } from "./tickets/resilient-ticket-service.js";
import { createTicketService, type TicketCodeReader, type TicketService } from "./tickets/ticket-service.js";

const PORT = Number(process.env.PORT) || 8000;

type BootConfig = { api: ApiConfig; agent: AgentConfig; ticketService: TicketService & TicketCodeReader };

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
  const chatService = createChatService({
    conversations: createConversationService(prisma),
    tickets: config.ticketService,
    agentRunner: createAgentRunner({
      model: config.agent.model,
      timeoutMs: config.agent.timeoutMs,
      ticketService: config.ticketService,
      onTurnMetrics: (metrics) => console.log("Turno do agent:", JSON.stringify(metrics)),
    }),
  });
  createApp({ config: config.api, authService: createAuthService(prisma), chatService }).listen(PORT, () => {
    console.log(`API rodando em http://localhost:${PORT}`);
  });
} else {
  process.exitCode = 1;
}
