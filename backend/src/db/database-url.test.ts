import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { it } from "node:test";
import { resolveDatabaseUrl } from "./database-url.js";

const baseDir = path.resolve("/tmp/nexo/backend");

it("resolve file:./ relativo ao diretório base, não ao cwd", () => {
  assert.equal(resolveDatabaseUrl("file:./dev.db", baseDir), pathToFileURL(path.join(baseDir, "dev.db")).href);
});

it("resolve file: relativo sem ./ e com ../", () => {
  assert.equal(resolveDatabaseUrl("file:dev.db", baseDir), pathToFileURL(path.join(baseDir, "dev.db")).href);
  assert.equal(resolveDatabaseUrl("file:../data/x.db", baseDir), pathToFileURL(path.resolve(baseDir, "../data/x.db")).href);
});

it("preserva parâmetros de query em file: relativo", () => {
  assert.equal(
    resolveDatabaseUrl("file:./dev.db?mode=ro", baseDir),
    `${pathToFileURL(path.join(baseDir, "dev.db")).href}?mode=ro`,
  );
});

it("não altera file: absoluto nem URLs que não são file:", () => {
  for (const url of ["file:///C:/data/dev.db", "file:/var/data/dev.db", "file:C:/data/dev.db", "libsql://db.turso.io", ":memory:"]) {
    assert.equal(resolveDatabaseUrl(url, baseDir), url);
  }
});
