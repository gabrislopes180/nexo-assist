import "dotenv/config";
import { createClient } from "@libsql/client";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createDatabaseClient } from "./client.js";
import { databaseFingerprint, loadDatabaseConfig } from "./database-config.js";
import { initializeDemo } from "./demo-data.js";
import { assertMigrationHistory, migrateDatabase, readOnlyInspection, verifyApplicationSchema } from "./turso-migrations.js";
import { runDatabaseSmoke } from "./turso-smoke.js";
import { describeErrorForLog } from "../shared/safe-error.js";

async function main() {
  const config = loadDatabaseConfig(process.env);
  if (config.mode !== "remote") throw new Error("Comando Turso requer DATABASE_URL=libsql:// e TURSO_AUTH_TOKEN");
  const command = process.argv[2];
  if (!["inspect", "migrate", "init", "smoke"].includes(command ?? "")) throw new Error("Comando Turso inválido");
  const fingerprint = databaseFingerprint(config);
  if (command !== "inspect" && process.argv[3] !== fingerprint && !process.argv.includes(`--target=${fingerprint}`)) {
    throw new Error("Escrita recusada: consulte db:turso:inspect e passe o targetFingerprint como argumento");
  }
  const raw = createClient(config);
  try {
    // A inspeção inicial é uma transação read-only, inclusive nos comandos de escrita.
    console.log(JSON.stringify({ targetFingerprint: fingerprint, ...(await readOnlyInspection(raw)) }));
    if (command === "inspect") return;
    if (command === "migrate") {
      const local = createClient({ url: pathToFileURL(path.join(tmpdir(), `nexo-test-${randomUUID()}.db`)).href });
      try { await migrateDatabase(local); } finally { local.close(); }
      console.log("Migrations validadas em SQLite temporário.");
      console.log(JSON.stringify({ applied: await migrateDatabase(raw) }));
      return;
    }
    await assertMigrationHistory(raw, undefined, true);
    await verifyApplicationSchema(raw);
    const client = createDatabaseClient(config);
    try {
      if (command === "init") {
        await initializeDemo(client);
        console.log(JSON.stringify({ initialized: true, ...(await readOnlyInspection(raw)) }));
      } else {
        await runDatabaseSmoke(client, (result) => console.log(JSON.stringify(result)));
      }
    } finally { await client.$disconnect(); }
  } finally { raw.close(); }
}

main().catch((error: unknown) => {
  // Erros de configuração/regras acima não contêm valores de ambiente. Do provedor só metadados seguros.
  const safe = error instanceof Error && error.constructor === Error && /^(DATABASE_URL|TURSO_AUTH_TOKEN|Comando Turso|Escrita recusada|Banco com|Histórico|Há migrations|Schema incompleto|Trigger|Constraints|Migration |Inicialização recusada|Controle de transação)/.test(error.message);
  console.error(safe ? error.message : `Operação Turso falhou: ${describeErrorForLog(error)}`);
  process.exitCode = 1;
});
