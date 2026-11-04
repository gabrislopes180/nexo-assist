import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withRetry } from "./resilience.js";

class DownError extends Error {}

const FAST = { timeoutMs: 20, attempts: 2, retryDelayMs: 1 };
const toDown = () => new DownError("fora do ar");

function scripted<T>(...steps: Array<() => Promise<T>>) {
  let calls = 0;
  const operation = () => {
    const step = steps[calls++];
    if (!step) throw new Error("chamada não prevista");
    return step();
  };
  return { operation, calls: () => calls };
}

describe("withRetry", () => {
  it("devolve o resultado sem nova tentativa no sucesso", async () => {
    const { operation, calls } = scripted(() => Promise.resolve(1));
    assert.equal(await withRetry(operation, FAST, toDown), 1);
    assert.equal(calls(), 1);
  });

  it("tenta de novo depois de falha e de timeout", async () => {
    const failing = scripted(() => Promise.reject(new Error("x")), () => Promise.resolve(2));
    assert.equal(await withRetry(failing.operation, FAST, toDown), 2);
    const hanging = scripted(() => new Promise<number>(() => undefined), () => Promise.resolve(3));
    assert.equal(await withRetry(hanging.operation, FAST, toDown), 3);
  });

  it("falha síncrona da operação também conta como tentativa", async () => {
    let calls = 0;
    const operation = (): Promise<number> => {
      if (++calls === 1) throw new Error("síncrono");
      return Promise.resolve(4);
    };
    assert.equal(await withRetry(operation, FAST, toDown), 4);
  });

  it("esgotadas as tentativas, lança o erro da fábrica sem o detalhe original", async () => {
    const { operation, calls } = scripted(() => Promise.reject(new Error("detalhe interno")), () => Promise.reject(new Error("detalhe interno")));
    await assert.rejects(withRetry(operation, FAST, toDown), (error: Error) => error instanceof DownError && !error.message.includes("detalhe"));
    assert.equal(calls(), 2);
  });

  it("respeita o número de tentativas", async () => {
    const { operation, calls } = scripted(...Array.from({ length: 3 }, () => () => Promise.reject(new Error("x"))));
    await assert.rejects(withRetry(operation, { ...FAST, attempts: 3 }, toDown), DownError);
    assert.equal(calls(), 3);
  });
});
