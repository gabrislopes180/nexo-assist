import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createApp, type AppDeps } from "../app.js";
import { createAuthService, type AuthService } from "../auth/auth-service.js";
import { issueSessionToken } from "../auth/session-token.js";
import type { ChatService } from "../chat/chat-service.js";
import { createTestDatabase } from "../db/test-database.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { ApiConfig } from "./config.js";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";
const ALLOWED_ORIGIN = "http://localhost:3000";
const baseConfig: ApiConfig = { sessionSecret: SECRET, corsOrigins: [ALLOWED_ORIGIN], isProduction: false };

const EMAIL = "pessoa@teste.example";
const CLEARED = /^nexo_session=;/;

const running: Server[] = [];

const unusedChatService: ChatService = {
  sendMessage: () => Promise.reject(new Error("chat não usado nestes testes")),
};

async function start(deps: Omit<AppDeps, "chatService">): Promise<string> {
  const server = createApp({ ...deps, chatService: unusedChatService }).listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  running.push(server);
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function sessionCookieOf(res: Response): string {
  const header = res.headers.getSetCookie()[0];
  assert.ok(header, "esperava Set-Cookie");
  return header.split(";")[0] ?? "";
}

function attributesOf(setCookie: string | undefined): string[] {
  assert.ok(setCookie, "esperava Set-Cookie");
  return setCookie
    .split("; ")
    .slice(1)
    .filter((attribute) => !attribute.startsWith("Max-Age") && !attribute.startsWith("Expires"))
    .sort();
}

function me(url: string, cookie?: string): Promise<Response> {
  return fetch(`${url}/auth/me`, cookie ? { headers: { Cookie: cookie } } : {});
}

async function assertError(res: Response, status: number, code: string, message: string) {
  assert.equal(res.status, status);
  assert.deepEqual(await res.json(), { error: { code, message } });
}

/** Serviço cujo acesso ao banco sempre falha, com detalhe interno na mensagem. */
const brokenAuthService: AuthService = {
  login: () => Promise.reject(new Error("detalhe interno do banco")),
  findSessionUser: () => Promise.reject(new Error("detalhe interno do banco")),
};

describe("rotas de autenticação", () => {
  let client: PrismaClient;
  let url: string;
  let userId: string;
  let expectedUser: Record<string, unknown>;

  before(async () => {
    client = await createTestDatabase();
    const user = await client.user.create({
      data: { name: "Pessoa Teste", email: EMAIL, role: "EMPLOYEE", department: "Financeiro" },
    });
    userId = user.id;
    expectedUser = { id: user.id, name: "Pessoa Teste", email: EMAIL, role: "EMPLOYEE", department: "Financeiro" };
    url = await start({ config: baseConfig, authService: createAuthService(client) });
  });

  after(async () => {
    for (const server of running) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
    await client.$disconnect();
  });

  describe("POST /auth/login", () => {
    const passwordCases: [string, Record<string, unknown>][] = [
      ["sem password", {}],
      ["com senha errada", { password: "errada" }],
      ["com senha vazia", { password: "" }],
      ["com senha numérica", { password: 123 }],
      ["com senha objeto", { password: { a: 1 } }],
    ];
    for (const [name, extra] of passwordCases) {
      it(`autentica ${name}`, async () => {
        const res = await postJson(`${url}/auth/login`, { email: EMAIL, ...extra });
        assert.equal(res.status, 200);
        assert.deepEqual(await res.json(), { user: expectedUser });
        assert.equal(res.headers.getSetCookie().length, 1);
      });
    }

    it("encontra o usuário com e-mail em maiúsculas e espaços", async () => {
      const res = await postJson(`${url}/auth/login`, { email: "  PESSOA@Teste.Example " });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { user: expectedUser });
    });

    it("não vaza campos fora de SessionUser", async () => {
      const res = await postJson(`${url}/auth/login`, { email: EMAIL });
      const body = (await res.json()) as { user: Record<string, unknown> };
      assert.deepEqual(Object.keys(body).sort(), ["user"]);
      assert.deepEqual(Object.keys(body.user).sort(), ["department", "email", "id", "name", "role"]);
    });

    it("define o cookie com os atributos do contrato, sem Secure fora de produção", async () => {
      const res = await postJson(`${url}/auth/login`, { email: EMAIL });
      const header = res.headers.getSetCookie()[0] ?? "";
      assert.match(header, /^nexo_session=[^;]+;/);
      assert.match(header, /; Max-Age=28800;/);
      assert.deepEqual(attributesOf(header), ["HttpOnly", "Path=/", "SameSite=Lax"]);
    });

    it("define e limpa o cookie com Secure em produção", async () => {
      const prodUrl = await start({
        config: { ...baseConfig, isProduction: true },
        authService: createAuthService(client),
      });
      const login = await postJson(`${prodUrl}/auth/login`, { email: EMAIL });
      assert.deepEqual(attributesOf(login.headers.getSetCookie()[0]), ["HttpOnly", "Path=/", "SameSite=Lax", "Secure"]);
      const logout = await fetch(`${prodUrl}/auth/logout`, { method: "POST" });
      assert.deepEqual(attributesOf(logout.headers.getSetCookie()[0]), ["HttpOnly", "Path=/", "SameSite=Lax", "Secure"]);
    });

    it("responde 401 sem cookie para e-mail inexistente", async () => {
      const res = await postJson(`${url}/auth/login`, { email: "ninguem@teste.example" });
      assert.deepEqual(res.headers.getSetCookie(), []);
      await assertError(res, 401, "EMAIL_NOT_FOUND", "E-mail não encontrado.");
    });

    it("responde 400 para e-mail inválido ou ausente", async () => {
      for (const body of [{ email: "sem-arroba" }, {}, { password: "x" }]) {
        const res = await postJson(`${url}/auth/login`, body);
        assert.deepEqual(res.headers.getSetCookie(), []);
        await assertError(res, 400, "INVALID_REQUEST", "Requisição inválida.");
      }
    });

    it("responde 400 para JSON malformado", async () => {
      const res = await fetch(`${url}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: '{"email":',
      });
      await assertError(res, 400, "INVALID_REQUEST", "Requisição inválida.");
    });

    it("responde 400 para body que não é JSON", async () => {
      const res = await fetch(`${url}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: `email=${EMAIL}`,
      });
      await assertError(res, 400, "INVALID_REQUEST", "Requisição inválida.");
    });

    it("responde 413 para body acima do limite", async () => {
      const res = await postJson(`${url}/auth/login`, { email: EMAIL, padding: "a".repeat(200 * 1024) });
      assert.deepEqual(res.headers.getSetCookie(), []);
      await assertError(res, 413, "INVALID_REQUEST", "Requisição inválida.");
    });

    it("responde com Cache-Control no-store, inclusive em erro", async () => {
      const ok = await postJson(`${url}/auth/login`, { email: EMAIL });
      const failed = await postJson(`${url}/auth/login`, { email: "invalido" });
      assert.equal(ok.headers.get("cache-control"), "no-store");
      assert.equal(failed.headers.get("cache-control"), "no-store");
    });
  });

  describe("GET /auth/me", () => {
    it("identifica o usuário pelo cookie do login", async () => {
      const login = await postJson(`${url}/auth/login`, { email: EMAIL });
      const res = await me(url, sessionCookieOf(login));
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { user: expectedUser });
      assert.equal(res.headers.get("cache-control"), "no-store");
    });

    it("responde SESSION_MISSING sem cookie e não mexe em cookies", async () => {
      const res = await me(url);
      assert.deepEqual(res.headers.getSetCookie(), []);
      await assertError(res, 401, "SESSION_MISSING", "Sessão não encontrada.");
    });

    it("responde SESSION_MISSING com cookie vazio", async () => {
      await assertError(await me(url, "nexo_session="), 401, "SESSION_MISSING", "Sessão não encontrada.");
    });

    async function assertInvalidAndCleared(res: Response) {
      const setCookie = res.headers.getSetCookie()[0];
      assert.match(setCookie ?? "", CLEARED);
      assert.deepEqual(attributesOf(setCookie), ["HttpOnly", "Path=/", "SameSite=Lax"]);
      await assertError(res, 401, "SESSION_INVALID", "Sessão inválida ou expirada.");
    }

    it("limpa o cookie adulterado", async () => {
      const login = await postJson(`${url}/auth/login`, { email: EMAIL });
      const [header, payload, signature = ""] = sessionCookieOf(login).split(".");
      const tampered = `${header}.${payload}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
      await assertInvalidAndCleared(await me(url, tampered));
    });

    it("limpa o cookie assinado com outro secret", async () => {
      const token = await issueSessionToken({ userId, secret: "outro-segredo-com-mais-de-32-caracteres", now: new Date() });
      await assertInvalidAndCleared(await me(url, `nexo_session=${token}`));
    });

    it("limpa o cookie expirado", async () => {
      const token = await issueSessionToken({ userId, secret: SECRET, now: new Date(Date.now() - 9 * 60 * 60 * 1000) });
      await assertInvalidAndCleared(await me(url, `nexo_session=${token}`));
    });

    it("limpa o cookie que o cookie-parser transforma em objeto", async () => {
      await assertInvalidAndCleared(await me(url, `nexo_session=j:${encodeURIComponent('{"a":1}')}`));
    });

    it("limpa o cookie de usuário removido", async () => {
      const removed = await client.user.create({ data: { name: "Removido", email: "removido@teste.example", role: "EMPLOYEE" } });
      const login = await postJson(`${url}/auth/login`, { email: removed.email });
      await client.user.delete({ where: { id: removed.id } });
      await assertInvalidAndCleared(await me(url, sessionCookieOf(login)));
    });

    it("lê o papel do banco a cada requisição", async () => {
      const changed = await client.user.create({ data: { name: "Muda", email: "muda@teste.example", role: "EMPLOYEE" } });
      const login = await postJson(`${url}/auth/login`, { email: changed.email });
      await client.user.update({ where: { id: changed.id }, data: { role: "ANALYST" } });
      const body = (await (await me(url, sessionCookieOf(login))).json()) as { user: { role: string } };
      assert.equal(body.user.role, "ANALYST");
    });
  });

  describe("POST /auth/logout", () => {
    function logout(cookie?: string): Promise<Response> {
      return fetch(`${url}/auth/logout`, { method: "POST", ...(cookie ? { headers: { Cookie: cookie } } : {}) });
    }

    async function assertLoggedOut(res: Response) {
      assert.equal(res.status, 204);
      assert.equal(await res.text(), "");
      assert.equal(res.headers.get("cache-control"), "no-store");
      assert.match(res.headers.getSetCookie()[0] ?? "", CLEARED);
    }

    it("com sessão válida limpa o cookie com os mesmos atributos do login", async () => {
      const login = await postJson(`${url}/auth/login`, { email: EMAIL });
      const res = await logout(sessionCookieOf(login));
      assert.deepEqual(attributesOf(res.headers.getSetCookie()[0]), attributesOf(login.headers.getSetCookie()[0]));
      await assertLoggedOut(res);
    });

    it("responde 204 sem cookie", async () => {
      await assertLoggedOut(await logout());
    });

    it("responde 204 com cookie inválido", async () => {
      await assertLoggedOut(await logout("nexo_session=lixo"));
    });

    it("é idempotente", async () => {
      await assertLoggedOut(await logout());
      await assertLoggedOut(await logout());
    });

    it("não consulta o banco, então funciona com ele fora", async () => {
      const brokenUrl = await start({ config: baseConfig, authService: brokenAuthService });
      assert.equal((await fetch(`${brokenUrl}/auth/logout`, { method: "POST" })).status, 204);
    });

    it("depois do logout, /auth/me sem cookie dá SESSION_MISSING", async () => {
      // fetch não guarda cookies: o navegador aplicaria o Set-Cookie de limpeza e deixaria de enviar o cookie.
      const login = await postJson(`${url}/auth/login`, { email: EMAIL });
      await assertLoggedOut(await logout(sessionCookieOf(login)));
      await assertError(await me(url), 401, "SESSION_MISSING", "Sessão não encontrada.");
    });
  });

  describe("falhas inesperadas", () => {
    it("responde 500 sem detalhes e registra o erro sem os campos anexados", async (t) => {
      const logged = t.mock.method(console, "error", () => undefined);
      const failure = Object.assign(new Error("falha do banco"), { body: "conteudo-do-body" });
      const brokenUrl = await start({
        config: baseConfig,
        authService: { ...brokenAuthService, login: () => Promise.reject(failure) },
      });
      const res = await postJson(`${brokenUrl}/auth/login`, { email: EMAIL, password: "senha-nao-logar" });
      await assertError(res, 500, "INTERNAL_ERROR", "Erro interno.");
      const output = JSON.stringify(logged.mock.calls.map((call) => call.arguments.map(String)));
      assert.match(output, /Error/);
      assert.equal(output.includes("falha do banco"), false);
      assert.equal(output.includes("conteudo-do-body"), false);
      assert.equal(output.includes("senha-nao-logar"), false);
    });

    it("mantém o cookie quando o banco falha em /auth/me", async (t) => {
      t.mock.method(console, "error", () => undefined);
      const brokenUrl = await start({ config: baseConfig, authService: brokenAuthService });
      const token = await issueSessionToken({ userId, secret: SECRET, now: new Date() });
      const res = await me(brokenUrl, `nexo_session=${token}`);
      assert.deepEqual(res.headers.getSetCookie(), []);
      await assertError(res, 500, "INTERNAL_ERROR", "Erro interno.");
    });
  });

  describe("aplicação", () => {
    it("responde 404 no formato padrão para rota inexistente", async () => {
      await assertError(await fetch(`${url}/nao-existe`), 404, "NOT_FOUND", "Rota não encontrada.");
      await assertError(await fetch(`${url}/auth/nao-existe`), 404, "NOT_FOUND", "Rota não encontrada.");
    });

    it("mantém o /health", async () => {
      const res = await fetch(`${url}/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: "ok" });
    });

    it("libera CORS com credenciais para origem permitida", async () => {
      const res = await fetch(`${url}/auth/me`, { headers: { Origin: ALLOWED_ORIGIN } });
      assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
      assert.equal(res.headers.get("access-control-allow-credentials"), "true");
    });

    it("responde o preflight do login para origem permitida", async () => {
      const res = await fetch(`${url}/auth/login`, {
        method: "OPTIONS",
        headers: { Origin: ALLOWED_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get("access-control-allow-origin"), ALLOWED_ORIGIN);
      assert.equal(res.headers.get("access-control-allow-credentials"), "true");
      assert.equal(res.headers.get("access-control-allow-methods"), "GET,POST,OPTIONS");
      assert.equal(res.headers.get("access-control-allow-headers"), "Content-Type");
    });

    it("não libera CORS para origem não permitida", async () => {
      const res = await fetch(`${url}/auth/me`, { headers: { Origin: "http://malicioso.example" } });
      assert.equal(res.headers.get("access-control-allow-origin"), null);
    });
  });
});
