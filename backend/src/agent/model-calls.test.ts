import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ModelRouterLanguageModel } from "@mastra/core/llm";
import { fakeModel } from "./testing/fake-model.js";
import { instrumentModel, trackModelCalls } from "./model-calls.js";

const callOptions = { prompt: [{ role: "user" as const, content: [{ type: "text" as const, text: "oi" }] }] };

describe("instrumentModel", () => {
  it("conta chamadas e registra o resumo seguro do erro, sem a mensagem", async () => {
    const providerError = Object.assign(new Error("corpo cru com texto do usuário"), { statusCode: 503 });
    const { model } = fakeModel([{ kind: "error", error: providerError }, { kind: "text", text: "ok" }]);
    const instrumented = instrumentModel(model);
    assert.ok(typeof instrumented === "object" && "doGenerate" in instrumented);
    const { stats } = await trackModelCalls(async () => {
      await assert.rejects(instrumented.doGenerate(callOptions));
      await instrumented.doGenerate(callOptions);
    });
    assert.equal(stats.calls, 2);
    assert.deepEqual(stats.failures, ["Error status=503"]);
  });

  it("separa as contagens de turnos simultâneos", async () => {
    const { model } = fakeModel([{ kind: "text", text: "ok" }]);
    const instrumented = instrumentModel(model);
    assert.ok(typeof instrumented === "object" && "doGenerate" in instrumented);
    const [one, two] = await Promise.all([
      trackModelCalls(() => instrumented.doGenerate(callOptions)),
      trackModelCalls(async () => {
        await instrumented.doGenerate(callOptions);
        await instrumented.doGenerate(callOptions);
      }),
    ]);
    assert.equal(one.stats.calls, 1);
    assert.equal(two.stats.calls, 2);
  });

  it("sem turno ativo, só repassa a chamada", async () => {
    const { model, calls } = fakeModel([{ kind: "text", text: "ok" }]);
    const instrumented = instrumentModel(model);
    assert.ok(typeof instrumented === "object" && "doGenerate" in instrumented);
    await instrumented.doGenerate(callOptions);
    assert.equal(calls.length, 1);
  });

  it("transforma a configuração do roteador em modelo do roteador, sem perder identidade", () => {
    const instrumented = instrumentModel({ id: "google/gemini-3.5-flash-lite", apiKey: "chave-de-teste" });
    assert.ok(instrumented instanceof ModelRouterLanguageModel);
    assert.equal(instrumented.modelId, "gemini-3.5-flash-lite");
    assert.equal(instrumented.provider, "google");
  });
});
