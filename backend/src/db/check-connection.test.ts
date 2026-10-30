import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, it } from "node:test";
import { pathToFileURL } from "node:url";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "../generated/prisma/client.js";
import { checkDatabaseConnection } from "./check-connection.js";

const clients: PrismaClient[] = [];

function clientFor(url: string) {
  const client = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  clients.push(client);
  return client;
}

function recordingLog() {
  const infos: string[] = [];
  const errors: string[] = [];
  return {
    infos,
    errors,
    log: { log: (message: string) => infos.push(message), error: (message: string) => errors.push(message) },
  };
}

after(async () => {
  await Promise.all(clients.map((client) => client.$disconnect()));
});

it("confirma a conexão e registra sucesso quando o banco responde", async () => {
  const { infos, errors, log } = recordingLog();

  const connected = await checkDatabaseConnection(clientFor(":memory:"), log);

  assert.equal(connected, true);
  assert.deepEqual(infos, ["Banco de dados conectado"]);
  assert.deepEqual(errors, []);
});

it("registra a falha e devolve false quando o banco não abre", async () => {
  const { infos, errors, log } = recordingLog();
  // O diretório pai não existe, então o SQLite não consegue abrir o arquivo.
  const url = pathToFileURL(path.join(tmpdir(), `nexo-${randomUUID()}`, "x.db")).href;

  const connected = await checkDatabaseConnection(clientFor(url), log);

  assert.equal(connected, false);
  assert.deepEqual(infos, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0] ?? "", /^Falha ao conectar ao banco de dados/);
});
