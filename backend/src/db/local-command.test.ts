import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { it } from "node:test";

it("comandos de manutenção e seed recusam Turso antes de abrir uma conexão", () => {
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  const env = { ...process.env, DATABASE_URL: "libsql://never-connect.invalid", TURSO_AUTH_TOKEN: "fictitious-guard-test" };
  for (const [entry, ...args] of [
    ["src/db/local-command.ts", "migrate", "deploy"],
    ["src/db/local-command.ts", "migrate", "reset", "--force"],
    ["src/db/seed.ts"],
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  ]) {
    const result = spawnSync(process.execPath, ["--import", "tsx", entry!, ...args], { cwd, env, encoding: "utf8", timeout: 15_000 });
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /restrito a SQLite local/);
    assert.ok(!(result.stdout + result.stderr).includes("fictitious-guard-test"));
  }
});
