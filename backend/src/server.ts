import { loadApiConfig, type ApiConfig } from "./api/config.js";
import { createApp } from "./app.js";
import { createAuthService } from "./auth/auth-service.js";
import { checkDatabaseConnection } from "./db/check-connection.js";
import { prisma } from "./db/prisma.js";

const PORT = Number(process.env.PORT) || 8000;

function readConfig(): ApiConfig | null {
  try {
    return loadApiConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Configuração inválida");
    return null;
  }
}

const config = readConfig();

if (config && (await checkDatabaseConnection(prisma))) {
  createApp({ config, authService: createAuthService(prisma) }).listen(PORT, () => {
    console.log(`API rodando em http://localhost:${PORT}`);
  });
} else {
  process.exitCode = 1;
}
