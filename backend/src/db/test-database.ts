import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../generated/prisma/client.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../prisma/migrations", import.meta.url));

/** Divide no fim de linha para não quebrar triggers, que têm `;` dentro do `BEGIN ... END`. */
function statementsOf(sql: string): string[] {
  return sql
    .split(/;\s*\r?\n/)
    .map((chunk) => chunk.replace(/^\s*--.*$/gm, "").trim())
    .filter((statement) => statement !== "");
}

/**
 * Utilitário de teste: cliente em banco `:memory:` com as migrations aplicadas.
 * Quem chama faz `$disconnect` em `after`.
 */
export async function createTestDatabase(): Promise<PrismaClient> {
  const client = new PrismaClient({ adapter: new PrismaLibSql({ url: ":memory:" }) });
  const migrations = readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const migration of migrations) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, migration, "migration.sql"), "utf8");
    for (const statement of statementsOf(sql)) {
      await client.$executeRawUnsafe(statement);
    }
  }
  return client;
}
