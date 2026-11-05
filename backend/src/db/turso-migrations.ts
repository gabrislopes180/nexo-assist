import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Client, Transaction } from "@libsql/client";

export const APPLICATION_TABLES = ["User", "Article", "Ticket", "TicketEvent", "TicketCounter", "Conversation", "Message"] as const;
const LEDGER = "_nexo_migrations";
const MIGRATIONS_DIR = fileURLToPath(new URL("../../prisma/migrations/", import.meta.url));
export type Migration = { name: string; sql: string; checksum: string };

export function readMigrations(directory = MIGRATIONS_DIR): Migration[] {
  return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map(({ name }) => {
    // LF canônico: checkout Windows/Linux produz o mesmo checksum sem alterar o SQL versionado.
    const sql = readFileSync(`${directory}/${name}/migration.sql`, "utf8").replace(/\r\n/g, "\n");
    if (/^\s*(BEGIN|COMMIT|ROLLBACK)\b/im.test(sql)) throw new Error(`Controle de transação não permitido na migration ${name}`);
    return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

type Reader = Pick<Client, "execute">;
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Apenas catálogos e contagens; não devolve endereço, token nem conteúdo de usuários. */
export async function inspectDatabase(reader: Reader) {
  const result = await reader.execute("SELECT type, name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name");
  const objects = result.rows.map((row) => ({ type: String(row.type), name: String(row.name) }));
  const counts: Record<string, number> = {};
  for (const name of APPLICATION_TABLES) {
    if (objects.some((object) => object.type === "table" && object.name === name)) {
      const count = await reader.execute(`SELECT count(*) AS n FROM ${quote(name)}`);
      counts[name] = Number(count.rows[0]?.n);
    }
  }
  return { objects, counts };
}

async function appliedMigrations(reader: Reader) {
  const exists = await reader.execute({ sql: "SELECT name FROM sqlite_schema WHERE type='table' AND name=?", args: [LEDGER] });
  if (!exists.rows.length) return [];
  const rows = await reader.execute(`SELECT name, checksum FROM ${quote(LEDGER)} ORDER BY name`);
  return rows.rows.map((row) => ({ name: String(row.name), checksum: String(row.checksum) }));
}

export async function assertMigrationHistory(reader: Reader, migrations = readMigrations(), requireComplete = false): Promise<number> {
  const applied = await appliedMigrations(reader);
  for (const [i, entry] of applied.entries()) {
    if (migrations[i]?.name !== entry.name || migrations[i]?.checksum !== entry.checksum) {
      throw new Error("Histórico de migrations divergente; inspecione o banco antes de continuar");
    }
  }
  if (requireComplete && applied.length !== migrations.length) throw new Error("Há migrations pendentes; execute db:turso:migrate antes de continuar");
  return applied.length;
}

export async function verifyApplicationSchema(reader: Reader): Promise<void> {
  const { objects } = await inspectDatabase(reader);
  if (APPLICATION_TABLES.some((name) => !objects.some((object) => object.type === "table" && object.name === name))) {
    throw new Error("Schema incompleto: faltam tabelas da aplicação");
  }
  const indexes = new Set(readMigrations().flatMap(({ sql }) => [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)].map((match) => match[1]!)));
  if ([...indexes].some((name) => !objects.some((object) => object.type === "index" && object.name === name))) {
    throw new Error("Schema incompleto: índice do histórico ausente");
  }
  for (const [table, required] of [["Conversation", ["assignedAt", "returnedToAgentAt"]], ["Message", ["systemKind"]]] as const) {
    const columns = await reader.execute(`PRAGMA table_info(${quote(table)})`);
    if (required.some((name) => !columns.rows.some((column) => column.name === name))) throw new Error("Schema incompleto: coluna de continuidade ausente");
  }
  const trigger = await reader.execute("SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='ticket_event_no_update'");
  if (!String(trigger.rows[0]?.sql).includes("RAISE(ABORT, 'TicketEvent is append-only')")) throw new Error("Trigger append-only ausente ou divergente");
  const foreignKeys = await reader.execute('PRAGMA foreign_key_list("TicketEvent")');
  if (foreignKeys.rows.length !== 3 || foreignKeys.rows.some((row) => row.on_delete !== "RESTRICT")) {
    throw new Error("Constraints de TicketEvent divergentes");
  }
  const violations = await reader.execute("PRAGMA foreign_key_check");
  if (violations.rows.length) throw new Error("Banco com violações de chave estrangeira; nenhuma correção automática foi feita");
}

/** Cada arquivo SQL e seu checksum fazem commit juntos. Nunca divide triggers por ponto e vírgula. */
export async function migrateDatabase(client: Client, migrations = readMigrations()): Promise<string[]> {
  const before = await inspectDatabase(client);
  const appliedCount = await assertMigrationHistory(client, migrations);
  const applicationObjects = before.objects.filter(({ name }) => name !== LEDGER && !name.startsWith("_libsql") && !name.startsWith("_sqld"));
  if (appliedCount === 0 && applicationObjects.length) throw new Error("Banco com estrutura existente sem histórico Nexo; migração automática recusada");
  const completed: string[] = [];
  for (let i = appliedCount; i < migrations.length; i++) {
    const migration = migrations[i]!;
    // A reconstrução histórica é segura no banco novo. Com dados, exige revisão incremental explícita.
    if (Object.values(before.counts).some((count) => count > 0) && /\b(DROP\s+TABLE|DELETE\s+FROM)\b/i.test(migration.sql)) {
      throw new Error(`Migration ${migration.name} exige revisão para banco com dados; nenhuma limpeza foi executada`);
    }
    const tx = await client.transaction("write");
    try {
      await tx.execute(`CREATE TABLE IF NOT EXISTS ${quote(LEDGER)} (name TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, appliedAt TEXT NOT NULL)`);
      const current = await assertMigrationHistory(tx, migrations);
      if (current > i) { await tx.rollback(); continue; }
      if (current !== i) throw new Error("Histórico mudou durante a aplicação de migrations");
      const locked = await inspectDatabase(tx);
      if (current === 0 && locked.objects.some(({ name }) => name !== LEDGER && !name.startsWith("_libsql") && !name.startsWith("_sqld"))) {
        throw new Error("Banco com estrutura existente sem histórico Nexo; migração automática recusada");
      }
      if (Object.values(locked.counts).some((count) => count > 0) && /\b(DROP\s+TABLE|DELETE\s+FROM)\b/i.test(migration.sql)) {
        throw new Error(`Migration ${migration.name} exige revisão para banco com dados; nenhuma limpeza foi executada`);
      }
      await tx.executeMultiple(migration.sql);
      if ((await tx.execute("PRAGMA foreign_key_check")).rows.length) throw new Error("Migration produziu violação de chave estrangeira");
      await tx.execute({ sql: `INSERT INTO ${quote(LEDGER)} (name, checksum, appliedAt) VALUES (?, ?, ?)`, args: [migration.name, migration.checksum, new Date().toISOString()] });
      await tx.commit();
      completed.push(migration.name);
    } catch (error) {
      if (!tx.closed) await tx.rollback();
      throw error;
    } finally { tx.close(); }
  }
  await verifyApplicationSchema(client);
  return completed;
}

export async function readOnlyInspection(client: Client) {
  const tx: Transaction = await client.transaction("read");
  try {
    const inspection = await inspectDatabase(tx);
    const applied = await appliedMigrations(tx);
    await tx.rollback();
    return { ...inspection, applied };
  } finally { tx.close(); }
}
