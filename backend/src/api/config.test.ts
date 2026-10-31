import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadApiConfig } from "./config.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const validEnv = { SESSION_SECRET: SECRET, CORS_ORIGINS: "http://localhost:3000" };

describe("loadApiConfig", () => {
  it("aceita a configuração mínima fora de produção", () => {
    assert.deepEqual(loadApiConfig(validEnv), {
      sessionSecret: SECRET,
      corsOrigins: ["http://localhost:3000"],
      isProduction: false,
    });
  });

  it("separa várias origens por vírgula", () => {
    const config = loadApiConfig({ ...validEnv, CORS_ORIGINS: "http://localhost:3000, https://app.nexo.example" });
    assert.deepEqual(config.corsOrigins, ["http://localhost:3000", "https://app.nexo.example"]);
  });

  it("liga o modo de produção só com NODE_ENV=production", () => {
    assert.equal(loadApiConfig({ ...validEnv, NODE_ENV: "production" }).isProduction, true);
    assert.equal(loadApiConfig({ ...validEnv, NODE_ENV: "development" }).isProduction, false);
  });

  it("recusa variáveis ausentes citando o nome de cada uma", () => {
    assert.throws(() => loadApiConfig({}), /SESSION_SECRET.*CORS_ORIGINS/);
  });

  it("recusa segredo com menos de 32 caracteres", () => {
    assert.throws(() => loadApiConfig({ ...validEnv, SESSION_SECRET: "a".repeat(31) }), /SESSION_SECRET/);
    assert.doesNotThrow(() => loadApiConfig({ ...validEnv, SESSION_SECRET: "a".repeat(32) }));
  });

  it("recusa o segredo de exemplo apenas em produção", () => {
    const env = { ...validEnv, SESSION_SECRET: "dev-only-troque-em-producao-0123456789abcdef" };
    assert.doesNotThrow(() => loadApiConfig(env));
    assert.throws(() => loadApiConfig({ ...env, NODE_ENV: "production" }), /SESSION_SECRET/);
  });

  for (const origins of ["*", "http://localhost:3000/", "http://localhost:3000,*", "localhost:3000", "", "http://a.example,"]) {
    it(`recusa CORS_ORIGINS="${origins}"`, () => {
      assert.throws(() => loadApiConfig({ ...validEnv, CORS_ORIGINS: origins }), /CORS_ORIGINS/);
    });
  }

  it("nunca inclui o valor recebido na mensagem de erro", () => {
    const leakedSecret = "curto-e-secreto";
    const leakedOrigin = "ftp-invalida-secreta";
    assert.throws(
      () => loadApiConfig({ SESSION_SECRET: leakedSecret, CORS_ORIGINS: leakedOrigin }),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.message.includes(leakedSecret), false);
        assert.equal(error.message.includes(leakedOrigin), false);
        return true;
      },
    );
  });
});
