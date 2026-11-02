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

  it("inclui o status HTTP do provedor sem mensagem, corpo, cabeçalhos nem URL", () => {
    const error = Object.assign(new Error("prompt-sensivel"), {
      name: "AI_APICallError",
      statusCode: 503,
      responseBody: "corpo-sensivel",
      responseHeaders: { "x-goog-api-key": "chave-sensivel" },
      requestBodyValues: { prompt: "prompt-sensivel" },
      url: "https://provedor.example/v1?key=chave-sensivel",
      isRetryable: true,
    });
    const output = describeErrorForLog(error);
    assert.match(output, /^AI_APICallError status=503\n/);
    for (const secret of ["prompt-sensivel", "corpo-sensivel", "chave-sensivel", "provedor.example"]) {
      assert.equal(output.includes(secret), false, secret);
    }
  });

  it("combina código e status", () => {
    assert.match(describeErrorForLog(Object.assign(new Error("x"), { code: "ETIMEDOUT", statusCode: 429 })), /^Error ETIMEDOUT status=429\n/);
  });

  it("ignora statusCode que não é um status HTTP inteiro", () => {
    for (const statusCode of ["503", 99, 600, 503.5, Number.NaN, { a: 1 }]) {
      assert.match(describeErrorForLog(Object.assign(new Error("x"), { statusCode })), /^Error\n/);
    }
  });

  it("omite código que não é texto", () => {
    assert.match(describeErrorForLog(Object.assign(new Error("x"), { code: { a: 1 } })), /^Error\n/);
  });

  it("não usa o valor lançado quando não é um Error", () => {
    assert.equal(describeErrorForLog("conteudo-sensivel"), "erro sem detalhes");
  });
});
