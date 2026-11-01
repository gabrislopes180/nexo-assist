import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeErrorForLog } from "./safe-error.js";

describe("describeErrorForLog", () => {
  it("mantém nome, código e pilha, sem a mensagem, que pode carregar dados do usuário", () => {
    const error = Object.assign(new TypeError("conteudo-sensivel\nem duas linhas conteudo-sensivel"), { code: "P2003" });
    const output = describeErrorForLog(error);
    assert.equal(output.includes("conteudo-sensivel"), false);
    assert.match(output, /^TypeError P2003\n/);
    assert.match(output, /\n\s+at /);
  });

  it("omite código que não é texto", () => {
    assert.match(describeErrorForLog(Object.assign(new Error("x"), { code: { a: 1 } })), /^Error\n/);
  });

  it("não usa o valor lançado quando não é um Error", () => {
    assert.equal(describeErrorForLog("conteudo-sensivel"), "erro sem detalhes");
  });
});
