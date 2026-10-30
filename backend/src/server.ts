import { app } from "./app.js";
import { checkDatabaseConnection } from "./db/check-connection.js";
import { prisma } from "./db/prisma.js";

const PORT = Number(process.env.PORT) || 8000;

if (await checkDatabaseConnection(prisma)) {
  app.listen(PORT, () => {
    console.log(`API rodando em http://localhost:${PORT}`);
  });
} else {
  process.exitCode = 1;
}
