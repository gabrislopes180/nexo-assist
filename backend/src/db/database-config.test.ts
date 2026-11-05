import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { databaseFingerprint, loadDatabaseConfig, requireLocalDatabase } from "./database-config.js";

describe("configuração de banco", () => {
  it("aceita SQLite local sem token e ignora credencial remota herdada", () => {
    assert.deepEqual(loadDatabaseConfig({ DATABASE_URL: "file:./dev.db", TURSO_AUTH_TOKEN: "não-usar" }), { url: "file:./dev.db", mode: "local" });
  });
  it("passa token separado para libsql autenticado, sem escolher destino por NODE_ENV", () => {
    assert.deepEqual(loadDatabaseConfig({ DATABASE_URL: "libsql://demo.turso.io", TURSO_AUTH_TOKEN: "token-ficticio", NODE_ENV: "test" }), {
      url: "libsql://demo.turso.io", authToken: "token-ficticio", mode: "remote",
    });
    assert.match(databaseFingerprint(loadDatabaseConfig({ DATABASE_URL: "libsql://demo.turso.io", TURSO_AUTH_TOKEN: "token-ficticio" })), /^[a-f0-9]{12}$/);
  });
  it("recusa remoto sem token e não bloqueia SQLite local", () => {
    assert.throws(() => loadDatabaseConfig({ DATABASE_URL: "libsql://demo.turso.io" }), /TURSO_AUTH_TOKEN/);
    assert.equal(requireLocalDatabase({ DATABASE_URL: "file:./test.db" }).mode, "local");
    assert.throws(() => requireLocalDatabase({ DATABASE_URL: "libsql://demo.turso.io", TURSO_AUTH_TOKEN: "ficticio" }), /restrito a SQLite local/);
  });
  it("recusa URL ausente, protocolos desconhecidos, tokens na URL e TLS desativado", () => {
    for (const url of [undefined, "", "file:", "postgresql://example.test/db", "https://example.test", "libsql://", "libsql://user:secret@example.test", "libsql://example.test?tls=0", "libsql://example.test?authToken=secret", "libsql://example.test/path"]) {
      assert.throws(() => loadDatabaseConfig({ DATABASE_URL: url, TURSO_AUTH_TOKEN: "ficticio" }), (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.ok(!error.message.includes("secret"));
        return true;
      });
    }
  });
  it("a suíte comum inicia local, sem token ou chave real mesmo com .env remoto", () => {
    assert.equal(loadDatabaseConfig(process.env).mode, "local");
    assert.equal(process.env.TURSO_AUTH_TOKEN, undefined);
    assert.equal(process.env.LLM_API_KEY, undefined);
  });
});
