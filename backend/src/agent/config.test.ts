import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DEFAULT_AGENT_MODEL, loadAgentConfig } from "./config.js";

const KEY = "chave-de-teste-nao-vazar";

describe("loadAgentConfig", () => {
  it("usa o modelo padrão e passa a chave de LLM_API_KEY explicitamente", () => {
    assert.equal(DEFAULT_AGENT_MODEL, "google/gemini-3.5-flash-lite");
    assert.deepEqual(loadAgentConfig({ LLM_API_KEY: KEY }).model, { id: "google/gemini-3.5-flash-lite", apiKey: KEY });
  });

  it("usa 120 s de timeout de turno por padrão", () => {
    assert.equal(loadAgentConfig({ LLM_API_KEY: KEY }).timeoutMs, 120000);
  });

  it("aceita AGENT_TIMEOUT_MS", () => {
    assert.equal(loadAgentConfig({ LLM_API_KEY: KEY, AGENT_TIMEOUT_MS: "5000" }).timeoutMs, 5000);
  });

  it("recusa AGENT_TIMEOUT_MS inválido citando o nome da variável", () => {
    for (const AGENT_TIMEOUT_MS of ["", "0", "-1", "1.5", "abc", "2147483648"]) {
      assert.throws(() => loadAgentConfig({ LLM_API_KEY: KEY, AGENT_TIMEOUT_MS }), /AGENT_TIMEOUT_MS/);
    }
  });

  it("aceita AGENT_MODEL no formato provider/modelo", () => {
    const config = loadAgentConfig({ LLM_API_KEY: KEY, AGENT_MODEL: "google/gemini-3.7-flash" });
    assert.equal(config.model.id, "google/gemini-3.7-flash");
  });

  it("recusa AGENT_MODEL fora do formato", () => {
    for (const AGENT_MODEL of ["gemini-3.8-flash", "google/", "/gemini", "", "google/gemini flash"]) {
      assert.throws(() => loadAgentConfig({ LLM_API_KEY: KEY, AGENT_MODEL }), /AGENT_MODEL/);
    }
  });

  it("recusa chave ausente ou vazia citando só o nome da variável", () => {
    assert.throws(() => loadAgentConfig({}), /LLM_API_KEY/);
    assert.throws(() => loadAgentConfig({ LLM_API_KEY: "" }), /LLM_API_KEY/);
  });

  it("não expõe a chave na mensagem de erro", () => {
    assert.throws(
      () => loadAgentConfig({ LLM_API_KEY: KEY, AGENT_MODEL: "invalido" }),
      (error: Error) => !error.message.includes(KEY),
    );
  });
});
