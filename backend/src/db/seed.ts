import "dotenv/config";
import { createDatabaseClient } from "./client.js";
import { requireLocalDatabase } from "./database-config.js";
import { populateDemo } from "./demo-data.js";
import { describeErrorForLog } from "../shared/safe-error.js";

// Checagem antes do cliente: inclusive a invocação direta deste arquivo recusa Turso.
const config = requireLocalDatabase(process.env);
const client = createDatabaseClient(config);
try {
  await client.$transaction(async (tx) => {
    await tx.message.deleteMany();
    await tx.ticketEvent.deleteMany();
    await tx.ticket.deleteMany();
    await tx.conversation.deleteMany();
    await tx.article.deleteMany();
    await tx.ticketCounter.deleteMany();
    await tx.user.deleteMany();
    await populateDemo(tx, new Date());
  }, { timeout: 30_000 });
  console.log("Seed local concluído; dados fictícios e invariantes verificados.");
} catch (error) {
  console.error("Falha no seed local:", describeErrorForLog(error));
  process.exitCode = 1;
} finally {
  await client.$disconnect();
}
