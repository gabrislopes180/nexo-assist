import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { it } from "node:test";
import { pathToFileURL } from "node:url";
import { createClient } from "@libsql/client";
import { createDatabaseClient } from "./client.js";
import { initializeDemo } from "./demo-data.js";
import { assertMigrationHistory, migrateDatabase, readMigrations, readOnlyInspection, verifyApplicationSchema } from "./turso-migrations.js";
import { runDatabaseSmoke } from "./turso-smoke.js";

function local() {
  const url = pathToFileURL(path.join(tmpdir(), `nexo-test-${randomUUID()}.db`)).href;
  return { url, client: createClient({ url }) };
}

it("aplica as migrations completas, preserva trigger/RESTRICT e não reaplica", async () => {
  const { client } = local();
  try {
    const migrations = readMigrations();
    assert.deepEqual(await migrateDatabase(client), migrations.map(({ name }) => name));
    const before = await readOnlyInspection(client);
    assert.equal(before.applied.length, 4);
    assert.ok(before.objects.some(({ name, type }) => name === "ticket_event_no_update" && type === "trigger"));
    assert.deepEqual(await migrateDatabase(client), []);
    assert.deepEqual(await readOnlyInspection(client), before);
    await assert.rejects(assertMigrationHistory(client, migrations.map((m, i) => i === 0 ? { ...m, checksum: "changed" } : m)), /divergente/);
  } finally { client.close(); }
});

it("falha parcial desfaz todo o arquivo e seu registro, preservando migrations anteriores", async () => {
  const { client } = local();
  try {
    const migrations = readMigrations();
    await migrateDatabase(client, migrations);
    const sql = "CREATE TABLE rollback_probe(id TEXT); INSERT INTO missing_table VALUES (1);";
    const bad = { name: "20990101000000_controlled_failure", sql, checksum: createHash("sha256").update(sql).digest("hex") };
    await assert.rejects(migrateDatabase(client, [...migrations, bad]));
    const after = await readOnlyInspection(client);
    assert.equal(after.applied.length, 4);
    assert.ok(!after.objects.some(({ name }) => name === "rollback_probe"));
    await assertMigrationHistory(client, migrations, true);
  } finally { client.close(); }
});

it("recusa estrutura desconhecida sem criar ledger ou apagar registros", async () => {
  const { client } = local();
  try {
    await client.execute("CREATE TABLE existing(id INTEGER)");
    await client.execute("INSERT INTO existing VALUES (7)");
    await assert.rejects(migrateDatabase(client), /estrutura existente/);
    assert.equal((await client.execute("SELECT id FROM existing")).rows[0]?.id, 7);
    assert.deepEqual((await readOnlyInspection(client)).applied, []);
    assert.equal((await client.execute("SELECT name FROM sqlite_schema WHERE name='_nexo_migrations'")).rows.length, 0);
  } finally { client.close(); }
});

it("detecta índice removido mesmo com ledger completo, sem reparar silenciosamente", async () => {
  const { client } = local();
  try {
    await migrateDatabase(client);
    await client.execute('DROP INDEX "Ticket_code_key"');
    await assert.rejects(verifyApplicationSchema(client), /índice.*ausente/);
    assert.equal((await readOnlyInspection(client)).applied.length, 4);
  } finally { client.close(); }
});

it("inicializa somente banco vazio e valida fluxos reais com runner controlado", async () => {
  const { client: raw, url } = local();
  const client = createDatabaseClient({ url, mode: "local" });
  try {
    await migrateDatabase(raw);
    await initializeDemo(client);
    const before = await readOnlyInspection(raw);
    assert.equal(before.counts.User, 5);
    assert.equal(before.counts.Article, 8);
    await assert.rejects(initializeDemo(client), /já contêm dados/);
    assert.deepEqual(await readOnlyInspection(raw), before);
    const result = await runDatabaseSmoke(client);
    assert.ok(result.checks.includes("rollback"));
    await client.$disconnect();
    const restarted = createDatabaseClient({ url, mode: "local" });
    try {
      const conversation = await restarted.conversation.findUniqueOrThrow({ where: { id: result.conversationId }, include: { messages: true } });
      assert.equal(conversation.status, "WITH_AGENT");
      assert.equal(conversation.messageCount, result.messageCount);
      assert.ok(conversation.messages.some((message) => message.authorType === "ANALYST"));
    } finally { await restarted.$disconnect(); }
  } finally { await client.$disconnect(); raw.close(); }
});
