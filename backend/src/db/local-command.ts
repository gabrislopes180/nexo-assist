import "dotenv/config";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { requireLocalDatabase } from "./database-config.js";

try {
  requireLocalDatabase(process.env);
  const args = process.argv.slice(2);
  const allowed = ["migrate", "db", "studio"];
  if (!args[0] || !allowed.includes(args[0])) throw new Error("Comando Prisma local inválido");
  const cli = fileURLToPath(import.meta.resolve("prisma/build/index.js"));
  const result = spawnSync(process.execPath, [cli, ...args], { stdio: "inherit", env: process.env });
  if (result.error) throw new Error("Não foi possível iniciar o Prisma local");
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : "Comando local recusado");
  process.exitCode = 1;
}
