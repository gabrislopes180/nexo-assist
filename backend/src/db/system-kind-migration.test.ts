import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, describe, it } from "node:test";
import { closeSystemMessage, RETURN_SYSTEM_MESSAGE, takeoverSystemMessage } from "../conversations/attendance.js";
import { HANDOFF_SYSTEM_MESSAGE } from "../conversations/handoff.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createTestDatabase } from "./test-database.js";

const MIGRATIONS_DIR = fileURLToPath(new URL("../../prisma/migrations", import.meta.url));

/** Os UPDATE do backfill de `systemKind`, para rodar de novo sobre linhas gravadas sem o tipo. */
function backfillStatements(): string[] {
  const dir = readdirSync(MIGRATIONS_DIR).find((name) => name.endsWith("_message_system_kind"));
  assert.ok(dir, "migração message_system_kind ausente");
  const sql = readFileSync(path.join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
  return sql
    .split(/;\s*\r?\n/)
    .map((chunk) => chunk.replace(/^\s*--.*$/gm, "").trim())
    .filter((statement) => statement.startsWith("UPDATE"));
}

describe("migração message_system_kind", () => {
  let client: PrismaClient;

  before(async () => {
    client = await createTestDatabase();
  });

  after(async () => {
    await client.$disconnect();
  });

  it("preenche systemKind das SYSTEM antigas pelos textos fixos e não toca nas demais", async () => {
    const owner = await client.user.create({ data: { name: "Ana Souza", email: "ana@teste.example", role: "EMPLOYEE" } });
    const { id: conversationId } = await client.conversation.create({ data: { ownerId: owner.id } });
    const rows = [
      ["SYSTEM", HANDOFF_SYSTEM_MESSAGE, "HANDOFF"],
      ["SYSTEM", takeoverSystemMessage("Bruno Martins"), "TAKEOVER"],
      ["SYSTEM", RETURN_SYSTEM_MESSAGE, "RETURNED"],
      ["SYSTEM", closeSystemMessage("Rafael Lima"), "CLOSED"],
      ["SYSTEM", "Aviso desconhecido", null],
      ["EMPLOYEE", HANDOFF_SYSTEM_MESSAGE, null],
      ["EMPLOYEE", "Eu assumiu a conversa", null],
    ] as const;
    const ids = [];
    for (const [authorType, content] of rows) {
      ids.push((await client.message.create({ data: { conversationId, authorType, content } })).id);
    }

    for (const statement of backfillStatements()) await client.$executeRawUnsafe(statement);

    const stored = await client.message.findMany({ where: { id: { in: ids } }, select: { id: true, systemKind: true } });
    const kindOf = new Map(stored.map((m) => [m.id, m.systemKind] as const));
    assert.deepEqual(
      ids.map((id) => kindOf.get(id)),
      rows.map(([, , kind]) => kind),
    );
  });
});
