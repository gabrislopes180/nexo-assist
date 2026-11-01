import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../generated/prisma/client.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../prisma/migrations", import.meta.url));
const TEST_DATABASE_PREFIX = "nexo-test-";
const STALE_TEST_DATABASE_MS = 60 * 60 * 1000;

/** Divide no fim de linha para não quebrar triggers, que têm `;` dentro do `BEGIN ... END`. */
function statementsOf(sql: string): string[] {
  return sql
    .split(/;\s*\r?\n/)
    .map((chunk) => chunk.replace(/^\s*--.*$/gm, "").trim())
    .filter((statement) => statement !== "");
}

/**
 * Banco em arquivo temporário, um por chamada. Não dá para usar `:memory:`: o libsql abre uma
 * conexão nova a cada transação, e ela veria um banco vazio. Com `?cache=shared` funciona, mas
 * o processo morre ao encerrar no Windows (0xC0000005), mesmo com os testes passando.
 */
function createTestDatabaseFile(): string {
  removeStaleTestDatabases();
  return path.join(tmpdir(), `${TEST_DATABASE_PREFIX}${randomUUID()}.db`);
}

/**
 * O libsql mantém o arquivo aberto depois do `$disconnect`, e no Windows ele não sai até o
 * processo terminar. Por isso a limpeza é dos arquivos antigos, na execução seguinte.
 */
function removeStaleTestDatabases(): void {
  for (const name of readdirSync(tmpdir())) {
    if (!name.startsWith(TEST_DATABASE_PREFIX)) continue;
    const file = path.join(tmpdir(), name);
    try {
      if (Date.now() - statSync(file).mtimeMs > STALE_TEST_DATABASE_MS) rmSync(file, { force: true });
    } catch {
      // Em uso por outro processo de teste.
    }
  }
}

/**
 * Utilitário de teste: cliente em banco temporário com as migrations aplicadas.
 * Quem chama faz `$disconnect` em `after`.
 */
export async function createTestDatabase(): Promise<PrismaClient> {
  const url = pathToFileURL(createTestDatabaseFile()).href;
  const client = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
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
